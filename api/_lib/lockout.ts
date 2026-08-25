import { getDb } from './db';
import { HttpError } from './http';

// ── Failed-attempt tracking with temporary lock ───────────────
// Counters persist in the app_settings KV so they survive
// serverless cold starts (unlike the in-memory rate limiter).

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60_000;   // 10 minutes
const LOCK_MS = 15 * 60_000;             // 15 minute lock after too many failures

interface AttemptState {
    failures: number[];
    lockedUntil: number;
}

async function read(key: string): Promise<AttemptState> {
    const raw = await getDb().getSetting(`lockout:${key}`);
    if (!raw) return { failures: [], lockedUntil: 0 };
    try {
        return JSON.parse(raw) as AttemptState;
    } catch {
        return { failures: [], lockedUntil: 0 };
    }
}

async function write(key: string, state: AttemptState): Promise<void> {
    await getDb().setSetting(`lockout:${key}`, JSON.stringify(state));
}

/** Throws 429 if this key is currently locked out. */
export async function assertNotLocked(key: string): Promise<void> {
    const state = await read(key);
    if (state.lockedUntil > Date.now()) {
        const waitMin = Math.ceil((state.lockedUntil - Date.now()) / 60_000);
        throw new HttpError(429, `Too many failed attempts. Try again in ${waitMin} minute(s).`, 'LOCKED');
    }
}

/** Record a failed attempt; locks the key after MAX_ATTEMPTS within the window. */
export async function recordFailure(key: string): Promise<void> {
    const state = await read(key);
    const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
    state.failures = state.failures.filter(t => t > cutoff);
    state.failures.push(Date.now());
    if (state.failures.length >= MAX_ATTEMPTS) {
        state.lockedUntil = Date.now() + LOCK_MS;
        state.failures = [];
    }
    await write(key, state);
}

/** Clear failure state after a success. */
export async function recordSuccess(key: string): Promise<void> {
    await write(key, { failures: [], lockedUntil: 0 });
}
