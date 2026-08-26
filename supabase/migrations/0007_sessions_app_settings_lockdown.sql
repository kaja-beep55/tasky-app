-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0007: close remaining grant holes.
--
-- Fix-check review found two leftovers that 0006 missed:
--   1. sessions had UPDATE (plus residual SELECT) for anon/auth —
--      anyone with the publishable key could rewrite the scope of
--      any session row, e.g. set it to 'admin'.
--   2. app_settings still had SELECT — the publishable key could
--      read lockout counters; harmless but unnecessary.
--
-- Also: SELECT on profiles / coin_transactions / task_submissions
-- resurfaces through PostgREST even after REVOKE because of the
-- 'authenticated' grant hierarchy. The migrations are the source
-- of truth; this file guarantees the end-state is locked.
-- ══════════════════════════════════════════════════════════════

revoke all on public.sessions from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.coin_transactions from anon, authenticated;
revoke all on public.task_submissions from anon, authenticated;
revoke all on public.admin_roles from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
revoke all on public.auth_identities from anon, authenticated;
revoke all on public.account_recovery from anon, authenticated;

-- Public/anon keep ONLY read access to published tasks (the one
-- intentional public surface).
grant select on public.tasks to anon, authenticated;
