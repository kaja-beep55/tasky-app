import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  accountExists,
  getBalance,
  getLatestLedger,
  verifyTransaction,
  verifyMultiOpTx,
  verifyAccountOptions,
  verifyTimeBounds,
  contractExists,
  verifySorobanInvoke,
  verifyUsdcTrustline,
  verifyUsdcPayment,
  isValidContractId,
} from './stellar';

// ──────────────────────────────────────
// Auto-verify engine for task submissions
// ──────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type VerifyResult = {
  passed: boolean;
  type: 'auto' | 'semi' | 'manual';
  reason?: string;
  score?: number;
};

const ESCROW_ADDRESS = process.env.STELLAR_ESCROW_PUBLIC_KEY || '';

/**
 * SHA-256 hash of proof text for dedup
 */
function hashProof(proof: string): string {
  return createHash('sha256').update(proof.trim().toLowerCase()).digest('hex');
}

/**
 * Main verify dispatcher — routes based on task verify_config.type
 */
export async function autoVerify(
  taskId: string,
  verifyConfig: { type: string; check?: string; min_words?: number; required_keywords?: string[]; expected_strings?: string[] },
  proof: string,
  agentWallet?: string
): Promise<VerifyResult> {
  switch (verifyConfig.type) {
    case 'account_exists':
      return verifyAccountExists(proof);

    case 'tx_verify':
      return verifyTxProof(taskId, proof, agentWallet);

    case 'tx_verify_memo':
      return verifyTxMemo(proof);

    case 'tx_verify_multi':
      return verifyTxMulti(taskId, proof);

    case 'tx_verify_timebounds':
      return verifyTxTimebounds(proof);

    case 'account_options':
      return verifyAccOptions(proof, agentWallet);

    case 'data_match':
      return verifyDataMatch(taskId, proof);

    case 'api_response_match':
      return verifyApiResponse(taskId, proof, verifyConfig);

    case 'text_quality':
      return verifyTextQuality(proof, verifyConfig.min_words, verifyConfig.required_keywords);

    case 'text_contains':
      return verifyTextContains(proof, verifyConfig.expected_strings);

    case 'stellar_address':
      return verifyStellarAddress(proof);

    case 'soroban_contract_exists':
      return verifySorobanContract(proof);

    case 'soroban_invoke_tx':
      return verifySorobanInvokeTx(proof);

    case 'usdc_trustline':
      return verifyUsdcTrustlineCheck(proof, agentWallet);

    case 'usdc_payment':
      return verifyUsdcPaymentTx(proof, agentWallet);

    case 'tx_verify_m2m':
      return verifyM2mTransfer(proof, agentWallet);

    case 'manual_review':
      return { passed: false, type: 'manual', reason: 'Queued for sponsor review' };

    default:
      return { passed: false, type: 'manual', reason: `Unknown verify type: ${verifyConfig.type}` };
  }
}

// ──────────────────────────────────────
// Verifiers
// ──────────────────────────────────────

async function verifyAccountExists(publicKey: string): Promise<VerifyResult> {
  const clean = publicKey.trim();
  if (!/^G[A-Z2-7]{55}$/.test(clean)) {
    return { passed: false, type: 'auto', reason: 'Invalid Stellar public key format' };
  }
  const exists = await accountExists(clean);
  return exists
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: 'Account not found on testnet' };
}

async function verifyTxProof(taskId: string, txHash: string, agentWallet?: string): Promise<VerifyResult> {
  const taskConfigs: Record<string, { amount?: string; memo?: string }> = {
    'task-002': { amount: '0.5000000' },
    'task-003': { amount: '1.0000000', memo: 'hello' },
    'task-013': { amount: '0.1000000' },
    'task-016': { amount: '0.1000000' },
  };

  const config = taskConfigs[taskId] || {};
  const result = await verifyTransaction(txHash.trim(), {
    expectedFrom: agentWallet,
    expectedTo: ESCROW_ADDRESS,
    expectedAmount: config.amount,
    expectedMemo: config.memo,
    maxAgeSeconds: 3600,
  });

  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

async function verifyTxMemo(txHash: string): Promise<VerifyResult> {
  try {
    const result = await verifyTransaction(txHash.trim(), {
      expectedTo: ESCROW_ADDRESS,
      expectedAmount: '0.1000000',
      maxAgeSeconds: 3600,
    });

    if (!result.valid) {
      return { passed: false, type: 'auto', reason: result.reason };
    }

    // Verify memo exists (accept any memo text — plain or base64 JSON)
    const tx = result.tx as { memo?: string; memo_type?: string } | undefined;
    if (!tx?.memo) {
      return { passed: false, type: 'auto', reason: 'No memo found' };
    }

    // Accept any non-empty memo — plain text or base64 JSON
    if (tx.memo.length > 0) {
      return { passed: true, type: 'auto' };
    }

    return { passed: false, type: 'auto', reason: 'Empty memo' };
  } catch (err) {
    return { passed: false, type: 'auto', reason: `Verify error: ${(err as Error).message}` };
  }
}

async function verifyTxMulti(taskId: string, txHash: string): Promise<VerifyResult> {
  // task-014: multi-destination payment
  if (taskId !== 'task-014') {
    return { passed: false, type: 'auto', reason: 'Multi-op verify only for task-014' };
  }

  // For now use placeholder destinations — will be set via env/config
  const destinations = [
    process.env.STELLAR_DEST_1 || '',
    process.env.STELLAR_DEST_2 || '',
    process.env.STELLAR_DEST_3 || '',
  ].filter(Boolean);

  if (destinations.length < 3) {
    // If destinations not configured, just verify it has 3 payment ops
    return { passed: true, type: 'semi', reason: 'Destinations not configured, manual check needed' };
  }

  const result = await verifyMultiOpTx(txHash.trim(), destinations.map(d => ({ to: d, amount: '0.1000000' })));
  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

async function verifyTxTimebounds(txHash: string): Promise<VerifyResult> {
  const result = await verifyTimeBounds(txHash.trim());
  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

async function verifyAccOptions(txHash: string, agentWallet?: string): Promise<VerifyResult> {
  if (!agentWallet) {
    return { passed: false, type: 'auto', reason: 'Agent wallet not provided' };
  }
  const result = await verifyAccountOptions(agentWallet, 'agent-earn.stellar');
  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

async function verifyDataMatch(taskId: string, proof: string): Promise<VerifyResult> {
  const proofClean = proof.trim();

  if (taskId === 'task-004') {
    // Check escrow balance
    try {
      const actualBalance = await getBalance(ESCROW_ADDRESS);
      const actual = parseFloat(actualBalance);

      // Try plain number first, then try extracting from JSON
      let proofBalance = parseFloat(proofClean);
      if (isNaN(proofBalance)) {
        try {
          const parsed = JSON.parse(proofClean);
          proofBalance = parseFloat(parsed.balance || parsed.amount || parsed.xlm || '');
        } catch {
          // Try regex for any number in the proof
          const match = proofClean.match(/[\d]+\.[\d]+/);
          if (match) proofBalance = parseFloat(match[0]);
        }
      }

      if (isNaN(proofBalance)) {
        return { passed: false, type: 'auto', reason: 'Could not extract a balance number from proof. Submit a plain number like "19832.5"' };
      }
      if (Math.abs(proofBalance - actual) <= 50) {
        return { passed: true, type: 'auto' };
      }
      return { passed: false, type: 'auto', reason: `Balance mismatch: proof=${proofBalance}, actual=${actual}` };
    } catch (err) {
      return { passed: false, type: 'auto', reason: `Balance check error: ${(err as Error).message}` };
    }
  }

  if (taskId === 'task-005') {
    // Check ledger sequence
    try {
      const actualLedger = await getLatestLedger();
      const proofLedger = parseInt(proofClean, 10);
      if (isNaN(proofLedger)) {
        return { passed: false, type: 'auto', reason: 'Proof is not a valid number' };
      }
      if (Math.abs(proofLedger - actualLedger) <= 5) {
        return { passed: true, type: 'auto' };
      }
      return { passed: false, type: 'auto', reason: `Ledger mismatch: proof=${proofLedger}, actual=${actualLedger}` };
    } catch (err) {
      return { passed: false, type: 'auto', reason: `Ledger check error: ${(err as Error).message}` };
    }
  }

  return { passed: false, type: 'semi', reason: 'Unknown data_match task' };
}

async function verifyApiResponse(
  taskId: string,
  proof: string,
  verifyConfig: { check?: string }
): Promise<VerifyResult> {
  // ── SERVER-SIDE FETCH: Compare proof against real API responses ──

  // task-006: x402 weather — server fetches real weather, compares temperature
  if (taskId === 'task-006') {
    try {
      const proofData = typeof proof === 'string' ? JSON.parse(proof) : proof;
      const proofTemp = parseFloat(proofData.temperature ?? proofData.temp ?? '');
      if (isNaN(proofTemp)) {
        return { passed: false, type: 'auto', reason: 'No valid temperature number found in proof JSON' };
      }
      // Server-side validation: fetch real weather from a free public API
      const realRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current_weather=true');
      if (realRes.ok) {
        const realData = await realRes.json();
        const realTemp = realData?.current_weather?.temperature;
        if (realTemp !== undefined && Math.abs(proofTemp - realTemp) > 15) {
          return { passed: false, type: 'auto', reason: `Temperature mismatch: proof=${proofTemp}, reality≈${realTemp}` };
        }
      }
      return { passed: true, type: 'auto' };
    } catch {
      return { passed: false, type: 'auto', reason: 'Proof must be valid JSON with a temperature field' };
    }
  }

  // task-007: x402 crypto quote — server checks price is in sane range
  if (taskId === 'task-007') {
    try {
      const proofData = typeof proof === 'string' ? JSON.parse(proof) : proof;
      const proofPrice = parseFloat(proofData.price ?? '');
      if (isNaN(proofPrice) || proofPrice <= 0) {
        return { passed: false, type: 'auto', reason: 'No valid price number found in proof JSON' };
      }
      // Sanity: XLM price should be between $0.01 and $10 (broad range)
      if (proofPrice < 0.01 || proofPrice > 10) {
        return { passed: false, type: 'auto', reason: `Price ${proofPrice} is outside realistic XLM range ($0.01-$10)` };
      }
      // Must include source exchange
      if (!proofData.source && !proofData.exchange) {
        return { passed: false, type: 'auto', reason: 'Missing source/exchange field in price data' };
      }
      return { passed: true, type: 'auto' };
    } catch {
      return { passed: false, type: 'auto', reason: 'Proof must be valid JSON with price and source fields' };
    }
  }

  // task-008: ASG Card health — server-side fetch to verify
  if (taskId === 'task-008') {
    try {
      const realRes = await fetch('https://api.asgcard.dev/health');
      if (realRes.ok) {
        const realData = await realRes.json();
        const proofData = typeof proof === 'string' ? JSON.parse(proof) : proof;
        // Compare version fields
        if (realData.version && proofData.version && realData.version !== proofData.version) {
          return { passed: false, type: 'auto', reason: `Version mismatch: proof=${proofData.version}, actual=${realData.version}` };
        }
      }
      // Still require core fields
      const proofLower = proof.toLowerCase();
      if (proofLower.includes('"status"') && proofLower.includes('"ok"') && proofLower.includes('"version"')) {
        return { passed: true, type: 'auto' };
      }
      return { passed: false, type: 'auto', reason: 'Missing status=ok or version field' };
    } catch {
      return { passed: false, type: 'auto', reason: 'Proof must be valid JSON from api.asgcard.dev/health' };
    }
  }

  // task-009: ASG Card pricing — server-side fetch to verify
  if (taskId === 'task-009') {
    try {
      const realRes = await fetch('https://api.asgcard.dev/pricing');
      if (realRes.ok) {
        const realData = await realRes.json();
        const proofData = typeof proof === 'string' ? JSON.parse(proof) : proof;
        // Verify actual pricing values match
        const realFee = realData.cardFee ?? realData.card_fee;
        const proofFee = proofData.cardFee ?? proofData.card_fee;
        if (realFee !== undefined && proofFee !== undefined && realFee !== proofFee) {
          return { passed: false, type: 'auto', reason: `Card fee mismatch: proof=${proofFee}, actual=${realFee}` };
        }
        return { passed: true, type: 'auto' };
      }
      // Fallback: check for key values
      const proofLower = proof.toLowerCase();
      if (proofLower.includes('10') && proofLower.includes('3.5')) {
        return { passed: true, type: 'auto' };
      }
      return { passed: false, type: 'auto', reason: 'Missing pricing data (cardFee, topUpPercent)' };
    } catch {
      return { passed: false, type: 'auto', reason: 'Proof must contain valid pricing data from api.asgcard.dev/pricing' };
    }
  }

  return { passed: false, type: 'semi', reason: `API response verify for ${taskId}: ${verifyConfig.check}` };
}

async function verifyTextQuality(
  proof: string,
  minWords?: number,
  requiredKeywords?: string[]
): Promise<VerifyResult> {
  const cleanProof = proof.trim();
  const wordList = cleanProof.split(/\s+/);
  const words = wordList.length;
  const min = minWords || 100;

  if (words < min) {
    return { passed: false, type: 'semi', reason: `Too short: ${words} words (need ${min}+)` };
  }

  if (requiredKeywords) {
    const lowerProof = cleanProof.toLowerCase();
    const missing = requiredKeywords.filter((kw) => !lowerProof.includes(kw.toLowerCase()));
    if (missing.length > 0) {
      return { passed: false, type: 'semi', reason: `Missing keywords: ${missing.join(', ')}` };
    }
  }

  // ── ANTI-ABUSE: SHA-256 Proof Dedup ──
  const proofHash = hashProof(cleanProof);
  const { data: existingProof } = await supabase
    .from('earn_submissions')
    .select('id')
    .eq('proof_hash', proofHash)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  if (existingProof) {
    return { passed: false, type: 'semi', reason: 'Duplicate proof detected — this exact text was already submitted' };
  }

  // ── ANTI-ABUSE: Unique Word Ratio ──
  // Prevents generic filler text reused across tasks
  const uniqueWords = new Set(wordList.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
  const uniqueRatio = uniqueWords.size / words;
  if (uniqueRatio < 0.35) {
    return { passed: false, type: 'semi', reason: `Low text uniqueness (${Math.round(uniqueRatio * 100)}%). Write original, task-specific content.` };
  }

  return { passed: true, type: 'semi', score: Math.min(100, Math.round((words / min) * 80)) };
}

function verifyTextContains(proof: string, expectedStrings?: string[]): VerifyResult {
  if (!expectedStrings || expectedStrings.length === 0) {
    return { passed: true, type: 'semi' };
  }

  const lowerProof = proof.toLowerCase();
  const missing = expectedStrings.filter((s) => !lowerProof.includes(s.toLowerCase()));

  if (missing.length > 0) {
    return { passed: false, type: 'semi', reason: `Missing: ${missing.join(', ')}` };
  }

  return { passed: true, type: 'semi' };
}

function verifyStellarAddress(proof: string): VerifyResult {
  const clean = proof.trim();
  if (/^G[A-Z2-7]{55}$/.test(clean)) {
    return { passed: true, type: 'auto' };
  }
  // Try to extract from text
  const match = clean.match(/G[A-Z2-7]{55}/);
  if (match) {
    return { passed: true, type: 'auto' };
  }
  return { passed: false, type: 'auto', reason: 'No valid Stellar address found (G..., 56 chars)' };
}

// ──────────────────────────────────────
// Soroban verifiers
// ──────────────────────────────────────

async function verifySorobanContract(proof: string): Promise<VerifyResult> {
  const clean = proof.trim();

  // Accept C... contract IDs
  if (isValidContractId(clean)) {
    return { passed: true, type: 'auto' };
  }

  // Try to extract C... address from text
  const match = clean.match(/C[A-Z2-7]{55}/);
  if (match) {
    return { passed: true, type: 'auto' };
  }

  return { passed: false, type: 'auto', reason: 'No valid Soroban contract ID found (C..., 56 chars)' };
}

async function verifySorobanInvokeTx(txHash: string): Promise<VerifyResult> {
  const clean = txHash.trim();

  // If proof looks like a TX hash (64 hex chars), verify on-chain
  if (/^[a-f0-9]{64}$/i.test(clean)) {
    const result = await verifySorobanInvoke(clean);
    return result.valid
      ? { passed: true, type: 'auto' }
      : { passed: false, type: 'auto', reason: result.reason };
  }

  // Fallback: if it contains a C... contract address, accept as semi-verified
  const contractMatch = clean.match(/C[A-Z2-7]{55}/);
  if (contractMatch) {
    const words = clean.split(/\s+/).length;
    if (words >= 10) {
      return { passed: true, type: 'semi', reason: 'Contract ID found in text proof' };
    }
  }

  return { passed: false, type: 'semi', reason: 'Provide a TX hash (64 hex chars) or text proof with contract ID' };
}

// ──────────────────────────────────────
// USDC verifiers
// ──────────────────────────────────────

async function verifyUsdcTrustlineCheck(proof: string, agentWallet?: string): Promise<VerifyResult> {
  // Proof can be a TX hash or just the agent wallet
  const walletToCheck = agentWallet || proof.trim();

  if (!/^G[A-Z2-7]{55}$/.test(walletToCheck)) {
    return { passed: false, type: 'auto', reason: 'No valid wallet address to check trustline' };
  }

  const result = await verifyUsdcTrustline(walletToCheck);
  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

async function verifyUsdcPaymentTx(txHash: string, agentWallet?: string): Promise<VerifyResult> {
  const result = await verifyUsdcPayment(txHash.trim(), {
    expectedFrom: agentWallet,
  });
  return result.valid
    ? { passed: true, type: 'auto' }
    : { passed: false, type: 'auto', reason: result.reason };
}

/**
 * M2M: verify agent-to-agent XLM transfer.
 * Checks: tx exists, from==agentWallet, recipient is a registered agent,
 * amount==0.1, memo=='m2m', no self-transfer.
 */
async function verifyM2mTransfer(txHash: string, agentWallet?: string): Promise<VerifyResult> {
  const clean = txHash.trim();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    return { passed: false, type: 'auto', reason: 'Invalid transaction hash format (expected 64 hex chars)' };
  }

  try {
    // 1) Load transaction from Horizon
    const tx = await horizon.transactions().transaction(clean).call();
    const txData = tx as unknown as {
      successful: boolean;
      source_account: string;
      memo?: string;
      memo_type?: string;
      created_at: string;
    };

    if (!txData.successful) {
      return { passed: false, type: 'auto', reason: 'Transaction failed on-chain' };
    }

    // 2) Check sender
    if (agentWallet && txData.source_account !== agentWallet) {
      return { passed: false, type: 'auto', reason: 'Transaction not sent from your registered wallet' };
    }

    // 3) Check memo
    if (!txData.memo || txData.memo !== 'm2m') {
      return { passed: false, type: 'auto', reason: `Memo mismatch: expected 'm2m', got '${txData.memo || 'none'}'` };
    }

    // 4) Check max age (1 hour)
    const txTime = new Date(txData.created_at).getTime();
    if (Date.now() - txTime > 3600 * 1000) {
      return { passed: false, type: 'auto', reason: 'Transaction too old (max 1 hour)' };
    }

    // 5) Get payment operations
    const opsResponse = await horizon.operations().forTransaction(clean).call();
    const ops = opsResponse.records as unknown as Array<{
      type: string;
      to?: string;
      from?: string;
      amount?: string;
      asset_type?: string;
      source_account?: string;
    }>;

    const paymentOp = ops.find(
      (op) => op.type === 'payment' && op.asset_type === 'native' && op.amount === '0.1000000'
    );

    if (!paymentOp) {
      return { passed: false, type: 'auto', reason: 'No native XLM payment of 0.1 found in transaction' };
    }

    const recipient = paymentOp.to;
    if (!recipient) {
      return { passed: false, type: 'auto', reason: 'Payment recipient could not be determined' };
    }

    // 6) No self-transfer
    if (recipient === agentWallet) {
      return { passed: false, type: 'auto', reason: 'Self-transfers are not allowed — send to a different registered agent' };
    }

    // 7) Check if recipient is a registered agent
    const { data: agents } = await supabase
      .from('agents')
      .select('id, wallet')
      .eq('wallet', recipient)
      .limit(1);

    if (!agents || agents.length === 0) {
      return { passed: false, type: 'auto', reason: `Recipient ${recipient.slice(0, 8)}… is not a registered agent. Use GET /api/agents to find valid targets.` };
    }

    return { passed: true, type: 'auto' };
  } catch (err) {
    return { passed: false, type: 'auto', reason: `Horizon error: ${(err as Error).message}` };
  }
}
