import type { Database } from './types';
import { createLocalDb } from './local';
import { createSupabaseDb } from './supabase';

// ── Driver selection ──────────────────────────────────────────
// Supabase is used ONLY when both backend credentials exist.
// Otherwise the local JSON driver is used (development/testing).

let instance: Database | null = null;

export function isSupabaseConfigured(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function getDb(): Database {
    if (instance) return instance;
    instance = isSupabaseConfigured() ? createSupabaseDb() : createLocalDb();
    return instance;
}

/** Test hook: reset cached driver (used by the test suite). */
export function _resetDbForTests(): void {
    instance = null;
}
