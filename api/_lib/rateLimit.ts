// ── Rate limiting ─────────────────────────────────────────────
// Adapted from the original XLMx402earn IP/wallet limiter.
// Generic key-based fixed-window limiter. In-memory: resets on
// serverless cold start. That is acceptable as a first layer;
// sensitive flows ALSO use attempt tracking persisted in the DB.

interface Bucket {
    count: number;
    windowStart: number;
}

const buckets: Map<string, Bucket> = new Map();
let lastSweep = Date.now();

function sweep(now: number) {
    // Prevent unbounded memory growth on long-lived instances.
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart > 15 * 60_000) buckets.delete(key);
    }
}

/**
 * Fixed-window rate limiter.
 * @returns true if the request SHOULD BE BLOCKED.
 */
export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    sweep(now);
    const entry = buckets.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return false;
    }
    entry.count++;
    return entry.count > maxRequests;
}

export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].trim();
    const real = headers['x-real-ip'];
    if (typeof real === 'string') return real;
    return '127.0.0.1';
}
