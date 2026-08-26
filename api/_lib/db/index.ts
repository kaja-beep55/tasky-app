import type { Database } from './types';
import { createLocalDb } from './local';
import { createSupabaseDb } from './supabase';

// ── Driver selection ──────────────────────────────────────────
// SUPABASE_SECRET_KEY is preferred (server-side only, bypasses RLS;
// authorization is enforced in the API layer). SUPABASE_PUBLISHABLE_KEY
// is accepted as a development fallback (RLS-protected). The local JSON
// driver exists for development/testing only and is NEVER used in
// production — a production deployment without Supabase credentials
// fails loudly instead of silently writing to a throwaway JSON file.

const IS_PROD = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

let instance: Database | null = null;

function wantsLocal(): boolean {
    // Explicit local opt-in (tests + local dev). Ignored in production.
    return !IS_PROD && Boolean(process.env.TASKY_LOCAL_DB_PATH);
}

export function isSupabaseConfigured(): boolean {
    if (wantsLocal()) return false;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    return Boolean(process.env.SUPABASE_URL && key);
}

export function getDb(): Database {
    if (instance) return instance;
    if (wantsLocal()) {
        instance = createLocalDb();
    } else if (isSupabaseConfigured()) {
        instance = createSupabaseDb();
    } else if (IS_PROD) {
        throw new Error('SUPABASE_NOT_CONFIGURED: SUPABASE_URL and SUPABASE_SECRET_KEY are required in production');
    } else {
        instance = createLocalDb();
    }
    return instance;
}

/** Test hook: reset cached driver (used by the test suite). */
export function _resetDbForTests(): void {
    instance = null;
}
