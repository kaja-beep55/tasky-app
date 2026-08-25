/**
 * Rate limiter for Vercel serverless functions.
 * Tracks both IP-level and wallet-level submission rates.
 * In-memory — resets on cold start, which is acceptable for hackathon scale.
 */

const IP_WINDOW_MS = 60_000;       // 1 minute
const IP_MAX_REQUESTS = 20;        // 20 req/min per IP (down from 30)

const WALLET_COOLDOWN_MS = 30_000; // 1 submission per 30 seconds per wallet

// IP rate limiter
const ipStore: Map<string, { count: number; windowStart: number }> = new Map();

// Wallet submission cooldown
const walletStore: Map<string, number> = new Map(); // wallet -> last submission timestamp

/**
 * Extract client IP from request headers (works on Vercel).
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0].split(',')[0].trim();
    }
    const real = headers['x-real-ip'];
    if (typeof real === 'string') return real;
    return '127.0.0.1';
}

/**
 * Check if an IP is rate limited.
 * Returns true if the IP should be blocked.
 */
export function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = ipStore.get(ip);

    if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
        // New window
        ipStore.set(ip, { count: 1, windowStart: now });
        return false;
    }

    entry.count++;
    if (entry.count > IP_MAX_REQUESTS) {
        return true;
    }

    return false;
}

/**
 * Check if a wallet is on cooldown (submitted too recently).
 * Returns true if the wallet should be blocked.
 */
export function isWalletCooldown(wallet: string): boolean {
    const now = Date.now();
    const lastSubmit = walletStore.get(wallet);

    if (!lastSubmit || now - lastSubmit > WALLET_COOLDOWN_MS) {
        walletStore.set(wallet, now);
        return false;
    }

    return true;
}
