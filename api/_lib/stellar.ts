import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Memo,
} from '@stellar/stellar-sdk';

// ──────────────────────────────────────
// Stellar Testnet helper for Agent Earn
// ──────────────────────────────────────

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

export const horizon = new Horizon.Server(HORIZON_URL);

/**
 * Get the escrow keypair from env. Falls back to a placeholder for build-time.
 */
export function getEscrowKeypair(): Keypair {
  const secret = process.env.STELLAR_SERVER_SECRET_KEY;
  if (!secret) throw new Error('STELLAR_SERVER_SECRET_KEY not set');
  return Keypair.fromSecret(secret);
}

/**
 * Check if an account exists on testnet.
 */
export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await horizon.loadAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get XLM balance for an account.
 */
export async function getBalance(publicKey: string): Promise<string> {
  const account = await horizon.loadAccount(publicKey);
  const native = account.balances.find(
    (b: { asset_type: string }) => b.asset_type === 'native'
  );
  return native ? (native as { balance: string }).balance : '0';
}

/**
 * Verify a transaction on Horizon: check from, to, amount, memo.
 */
export async function verifyTransaction(
  txHash: string,
  opts: {
    expectedFrom?: string;
    expectedTo?: string;
    expectedAmount?: string;
    expectedMemo?: string;
    maxAgeSeconds?: number;
  }
): Promise<{ valid: boolean; reason?: string; tx?: Record<string, unknown> }> {
  try {
    const tx = await horizon.transactions().transaction(txHash).call();
    const txData = tx as unknown as {
      successful: boolean;
      source_account: string;
      memo?: string;
      memo_type?: string;
      created_at: string;
    };

    if (!txData.successful) {
      return { valid: false, reason: 'Transaction failed on-chain' };
    }

    // Check age
    if (opts.maxAgeSeconds) {
      const txTime = new Date(txData.created_at).getTime();
      const now = Date.now();
      if (now - txTime > opts.maxAgeSeconds * 1000) {
        return { valid: false, reason: 'Transaction too old' };
      }
    }

    // Check source
    if (opts.expectedFrom && txData.source_account !== opts.expectedFrom) {
      return { valid: false, reason: 'Wrong source account' };
    }

    // Check memo
    if (opts.expectedMemo) {
      if (!txData.memo || txData.memo !== opts.expectedMemo) {
        return { valid: false, reason: `Memo mismatch: expected '${opts.expectedMemo}', got '${txData.memo || 'none'}'` };
      }
    }

    // Check operations (payment to correct destination with correct amount)
    const opsResponse = await horizon.operations().forTransaction(txHash).call();
    const ops = opsResponse.records as unknown as Array<{
      type: string;
      to?: string;
      amount?: string;
      asset_type?: string;
    }>;

    if (opts.expectedTo || opts.expectedAmount) {
      const paymentOp = ops.find(
        (op: { type: string; to?: string; amount?: string }) =>
          op.type === 'payment' &&
          (!opts.expectedTo || op.to === opts.expectedTo) &&
          (!opts.expectedAmount || op.amount === opts.expectedAmount)
      );
      if (!paymentOp) {
        return {
          valid: false,
          reason: `No matching payment op: to=${opts.expectedTo}, amount=${opts.expectedAmount}`,
        };
      }
    }

    return { valid: true, tx: txData as unknown as Record<string, unknown> };
  } catch (err) {
    return { valid: false, reason: `Horizon error: ${(err as Error).message}` };
  }
}

/**
 * Get the latest ledger sequence number.
 */
export async function getLatestLedger(): Promise<number> {
  const response = await horizon.ledgers().order('desc').limit(1).call();
  const records = response.records as Array<{ sequence: number }>;
  return records[0]?.sequence ?? 0;
}

/**
 * Send XLM from the escrow wallet to a recipient.
 */
export async function sendPayout(
  destinationPublicKey: string,
  amountXLM: string,
  memoText?: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const escrowKeypair = getEscrowKeypair();
    const escrowAccount = await horizon.loadAccount(escrowKeypair.publicKey());

    let txBuilder = new TransactionBuilder(escrowAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: destinationPublicKey,
          asset: Asset.native(),
          amount: amountXLM,
        })
      )
      .setTimeout(30);

    if (memoText) {
      txBuilder = txBuilder.addMemo(Memo.text(memoText));
    }

    const transaction = txBuilder.build();
    transaction.sign(escrowKeypair);

    const result = await horizon.submitTransaction(transaction);
    const hash = (result as unknown as { hash: string }).hash;
    return { success: true, txHash: hash };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Verify a multi-op transaction (e.g., 3 payments in one tx).
 */
export async function verifyMultiOpTx(
  txHash: string,
  expectedOps: Array<{ to: string; amount: string }>
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const tx = await horizon.transactions().transaction(txHash).call();
    const txData = tx as unknown as { successful: boolean };
    if (!txData.successful) return { valid: false, reason: 'Transaction failed' };

    const opsResponse = await horizon.operations().forTransaction(txHash).call();
    const ops = opsResponse.records as unknown as Array<{
      type: string;
      to?: string;
      amount?: string;
    }>;

    for (const expected of expectedOps) {
      const found = ops.find(
        (op) => op.type === 'payment' && op.to === expected.to && op.amount === expected.amount
      );
      if (!found) {
        return { valid: false, reason: `Missing payment to ${expected.to} for ${expected.amount}` };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Horizon error: ${(err as Error).message}` };
  }
}

/**
 * Verify account has specific options set (e.g., home_domain).
 */
export async function verifyAccountOptions(
  publicKey: string,
  expectedDomain?: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const account = await horizon.loadAccount(publicKey);
    const accountData = account as unknown as { home_domain?: string };

    if (expectedDomain && accountData.home_domain !== expectedDomain) {
      return {
        valid: false,
        reason: `home_domain: expected '${expectedDomain}', got '${accountData.home_domain || 'not set'}'`,
      };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Account load error: ${(err as Error).message}` };
  }
}

/**
 * Verify transaction has time_bounds set.
 */
export async function verifyTimeBounds(
  txHash: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const tx = await horizon.transactions().transaction(txHash).call();
    const txData = tx as unknown as {
      successful: boolean;
      valid_after?: string;
      valid_before?: string;
      preconditions?: {
        timebounds?: { min_time?: string; max_time?: string };
      };
    };

    if (!txData.successful) return { valid: false, reason: 'Transaction failed' };

    // SDK v13+ / Protocol 21: time bounds under preconditions.timebounds
    let validBeforeStr = txData.valid_before;
    let validAfterStr = txData.valid_after;

    if ((!validBeforeStr || validBeforeStr === '1970-01-01T00:00:00Z') && txData.preconditions?.timebounds) {
      const tb = txData.preconditions.timebounds;
      if (tb.max_time && tb.max_time !== '0') {
        validBeforeStr = new Date(parseInt(tb.max_time, 10) * 1000).toISOString();
        validAfterStr = tb.min_time && tb.min_time !== '0'
          ? new Date(parseInt(tb.min_time, 10) * 1000).toISOString()
          : '1970-01-01T00:00:00Z';
      }
    }

    if (!validBeforeStr || validBeforeStr === '1970-01-01T00:00:00Z') {
      return { valid: false, reason: 'No time_bounds set (valid_before missing)' };
    }

    const validAfter = new Date(validAfterStr || 0).getTime();
    const validBefore = new Date(validBeforeStr).getTime();
    const diff = (validBefore - validAfter) / 1000;

    if (diff > 86400) {
      return { valid: false, reason: `Time window too large: ${diff}s (max 86400s)` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Horizon error: ${(err as Error).message}` };
  }
}

// ──────────────────────────────────────
// USDC constants (Stellar testnet)
// ──────────────────────────────────────
export const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const USDC_CODE = 'USDC';

/**
 * Check if an account has a USDC trustline on testnet.
 */
export async function verifyUsdcTrustline(
  publicKey: string
): Promise<{ valid: boolean; balance?: string; reason?: string }> {
  try {
    const account = await horizon.loadAccount(publicKey);
    const balances = account.balances as Array<{
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      balance: string;
    }>;

    const usdc = balances.find(
      (b) =>
        b.asset_type === 'credit_alphanum4' &&
        b.asset_code === USDC_CODE &&
        b.asset_issuer === USDC_ISSUER_TESTNET
    );

    if (usdc) {
      return { valid: true, balance: usdc.balance };
    }
    return { valid: false, reason: 'No USDC trustline found on this account' };
  } catch (err) {
    return { valid: false, reason: `Account load error: ${(err as Error).message}` };
  }
}

/**
 * Verify a transaction contains a USDC payment operation.
 */
export async function verifyUsdcPayment(
  txHash: string,
  opts?: { expectedFrom?: string; expectedTo?: string; minAmount?: string }
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const tx = await horizon.transactions().transaction(txHash).call();
    const txData = tx as unknown as { successful: boolean };
    if (!txData.successful) return { valid: false, reason: 'Transaction failed' };

    const opsResponse = await horizon.operations().forTransaction(txHash).call();
    const ops = opsResponse.records as unknown as Array<{
      type: string;
      to?: string;
      from?: string;
      amount?: string;
      asset_type?: string;
      asset_code?: string;
      asset_issuer?: string;
      source_account?: string;
    }>;

    const usdcOp = ops.find(
      (op) =>
        op.type === 'payment' &&
        op.asset_code === USDC_CODE &&
        (!opts?.expectedTo || op.to === opts.expectedTo) &&
        (!opts?.expectedFrom || (op.source_account || op.from) === opts.expectedFrom)
    );

    if (!usdcOp) {
      return { valid: false, reason: 'No USDC payment operation found in transaction' };
    }

    if (opts?.minAmount && parseFloat(usdcOp.amount || '0') < parseFloat(opts.minAmount)) {
      return { valid: false, reason: `USDC amount too low: ${usdcOp.amount} (need ${opts.minAmount}+)` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Horizon error: ${(err as Error).message}` };
  }
}

/**
 * Check if a Soroban contract address (C...) exists via Horizon.
 */
export async function contractExists(contractId: string): Promise<boolean> {
  try {
    // Soroban contracts can be checked via the /accounts endpoint
    const resp = await fetch(`${HORIZON_URL}/accounts/${contractId}`);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Verify a transaction contains an invoke_host_function operation (Soroban).
 */
export async function verifySorobanInvoke(
  txHash: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const tx = await horizon.transactions().transaction(txHash).call();
    const txData = tx as unknown as { successful: boolean };
    if (!txData.successful) return { valid: false, reason: 'Transaction failed' };

    const opsResponse = await horizon.operations().forTransaction(txHash).call();
    const ops = opsResponse.records as unknown as Array<{ type: string }>;

    const sorobanOp = ops.find(
      (op) => op.type === 'invoke_host_function' || op.type === 'extend_footprint_ttl' || op.type === 'restore_footprint'
    );

    if (!sorobanOp) {
      return { valid: false, reason: 'No Soroban operation (invoke_host_function) found in transaction' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `Horizon error: ${(err as Error).message}` };
  }
}

/**
 * Verify a Soroban contract ID format (C... 56 chars).
 */
export function isValidContractId(contractId: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(contractId.trim());
}

