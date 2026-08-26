-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0003: grants + permissive policies for the
-- API tables that are accessed through the publishable/anon role.
-- These policies are intentionally permissive (USING true) because
-- the API itself enforces authorization server-side. The RLS on
-- user-owned tables (profiles, coin_transactions, etc.) still
-- restricts which ROWS a user can read; these grants only decide
-- whether the anon role can touch the table at all.
-- ══════════════════════════════════════════════════════════════

-- sessions: the API creates/deletes session rows for login/logout
grant insert, delete on public.sessions to anon, authenticated;
create policy sessions_rw on public.sessions
    for all to anon, authenticated
    using (true) with check (true);

-- auth_identities: the API reads/writes password hashes
grant insert, update, select on public.auth_identities to anon, authenticated;
create policy auth_identities_rw on public.auth_identities
    for all to anon, authenticated
    using (true) with check (true);

-- account_recovery: the API reads/writes hashed recovery codes
grant select, insert, update on public.account_recovery to anon, authenticated;
create policy account_recovery_rw on public.account_recovery
    for all to anon, authenticated
    using (true) with check (true);

-- admin_roles: the API reads admin role info (admin unlock)
grant select on public.admin_roles to anon, authenticated;
create policy admin_roles_read on public.admin_roles
    for select to anon, authenticated
    using (true);

-- audit_logs: the API inserts audit records (append-only)
grant insert on public.audit_logs to anon, authenticated;
create policy audit_logs_insert on public.audit_logs
    for insert to anon, authenticated with check (true);

-- profiles: the API creates/reads/updates profiles
grant select, insert, update on public.profiles to anon, authenticated;
-- Keep the own-read policy (it already exists from 0001).
-- Add a policy that lets the API insert/update profile rows.
create policy profiles_api_insert on public.profiles
    for insert to anon, authenticated with check (true);
create policy profiles_api_update on public.profiles
    for update to anon, authenticated using (true) with check (true);

-- tasks: the API does admin CRUD on tasks
grant insert, update, delete on public.tasks to anon, authenticated;
create policy tasks_api_write on public.tasks
    for all to anon, authenticated
    using (true) with check (true);

-- task_submissions: the API creates/updates submission records
grant select, insert, update on public.task_submissions to anon, authenticated;
create policy submissions_api_write on public.task_submissions
    for all to anon, authenticated
    using (true) with check (true);

-- coin_transactions: the API only INSERTS (never UPDATE/DELETE)
grant insert on public.coin_transactions to anon, authenticated;
create policy coin_txn_insert on public.coin_transactions
    for insert to anon, authenticated with check (true);
