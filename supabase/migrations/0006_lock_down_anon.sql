-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0006: revoke the permissive anon/authenticated
-- grants added in 0002/0003.
--
-- Why: those policies existed only so the API could run on the
-- publishable key. In production the API uses SUPABASE_SECRET_KEY,
-- which bypasses RLS entirely — so the permissive anon policies
-- are pure attack surface (forged session inserts, password-hash
-- reads, ledger tampering). The frontend never talks to Supabase
-- directly; every privileged action goes through /api/*.
--
-- After this migration the publishable/anon key can ONLY read
-- published tasks (public data by design).
-- ══════════════════════════════════════════════════════════════

-- ── revoke table grants ──────────────────────────────────────
revoke insert, delete on public.sessions from anon, authenticated;
revoke select, insert, update on public.auth_identities from anon, authenticated;
revoke select, insert, update on public.account_recovery from anon, authenticated;
revoke select on public.admin_roles from anon, authenticated;
revoke insert on public.audit_logs from anon, authenticated;
revoke insert, update on public.profiles from anon, authenticated;
revoke insert, update, delete on public.tasks from anon, authenticated;
revoke insert, update on public.task_submissions from anon, authenticated;
revoke insert on public.coin_transactions from anon, authenticated;
revoke insert, update on public.app_settings from anon, authenticated;
revoke select on public.coin_transactions from anon;
revoke select on public.task_submissions from anon;
revoke select on public.profiles from anon;

-- ── drop permissive policies ─────────────────────────────────
drop policy if exists sessions_rw on public.sessions;
drop policy if exists auth_identities_rw on public.auth_identities;
drop policy if exists account_recovery_rw on public.account_recovery;
drop policy if exists admin_roles_read on public.admin_roles;
drop policy if exists audit_logs_insert on public.audit_logs;
drop policy if exists profiles_api_insert on public.profiles;
drop policy if exists profiles_api_update on public.profiles;
drop policy if exists tasks_api_write on public.tasks;
drop policy if exists submissions_api_write on public.task_submissions;
drop policy if exists coin_txn_insert on public.coin_transactions;
drop policy if exists app_settings_rw on public.app_settings;

-- Remaining policies (from 0001) are the intended ones:
--   tasks_public_read        anon+auth select published tasks
--   profiles_own_read        auth.uid() = id (Supabase-Auth users only)
--   coin_txn_own_read        auth.uid() = user_id
--   submissions_own_read     auth.uid() = user_id
-- The backend (secret key) bypasses RLS; authorization is
-- enforced server-side in the API layer.
