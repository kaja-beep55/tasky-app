-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0009: publishable-key API support via
-- narrowly-scoped SECURITY DEFINER functions + session-header RLS.
--
-- This file is the SOURCE OF TRUTH for the state already applied
-- to the remote database (it was hand-verified live during the
-- publishable-key bring-up; applied via db push on 2026-08-27).
--
-- What it does:
--   * profiles.user_number gets a sequence default so signup never
--     needs to know the next number.
--   * Every backend write goes through a single-purpose SECURITY
--     DEFINER function (fixed search_path, owner = migration role).
--   * Password/recovery/session token hashes are NEVER selectable
--     through any function or policy.
--   * RLS policies read the API-provided x-tasky-session request
--     header (request.headers JSON in PostgREST) to authorize rows.
--   * Old broad definer functions lose their public EXECUTE.
--   * apply_coin_transaction stays the only coin-mutation path
--     (atomic + idempotent, from 0001).
-- ══════════════════════════════════════════════════════════════

-- ── 0. user_number sequence ──────────────────────────────────────
create sequence if not exists public.profiles_user_number_seq
    as bigint increment by 1 no cycle;

select setval(
    'public.profiles_user_number_seq',
    greatest(100001, coalesce((select max(user_number) + 1 from public.profiles), 100001)),
    false
);

alter table public.profiles
    alter column user_number set default nextval('public.profiles_user_number_seq');

revoke all on sequence public.profiles_user_number_seq from anon, authenticated;
grant usage on sequence public.profiles_user_number_seq to anon, authenticated;


-- ── 1. Session helpers (read x-tasky-session from request.headers) ──

CREATE OR REPLACE FUNCTION public.tasky_current_session()
 RETURNS sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_token_hash text;
    v_session    public.sessions;
    v_headers    text;
begin
    v_headers := nullif(current_setting('request.headers', true), '');
    if v_headers is not null then
        v_token_hash := v_headers::json ->> 'x-tasky-session';
    end if;
    if v_token_hash is null or v_token_hash = '' then
        return null;
    end if;
    select * into v_session from public.sessions
     where token_hash = v_token_hash and expires_at > now();
    return v_session;
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select user_id from public.tasky_current_session();
$function$

CREATE OR REPLACE FUNCTION public.tasky_is_admin_session()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select coalesce((select scope = 'admin' from public.tasky_current_session()), false);
$function$


-- ── 2. Signup / login / recovery ──

CREATE OR REPLACE FUNCTION public.tasky_username_available(p_username text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$function$

CREATE OR REPLACE FUNCTION public.tasky_signup(p_username text, p_name text, p_country text, p_state text, p_password_hash text, p_recovery_hash text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_profile public.profiles;
begin
    insert into public.profiles (username, name, country, state)
    values (p_username, p_name, p_country, p_state)
    returning * into v_profile;

    insert into public.auth_identities (user_id, password_hash)
    values (v_profile.id, p_password_hash);

    insert into public.account_recovery (user_id, code_hash)
    values (v_profile.id, p_recovery_hash);

    return v_profile;
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_login_lookup(p_identifier text)
 RETURNS TABLE(user_id uuid, password_hash text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    return query
    select p.id, i.password_hash, p.status
      from public.profiles p
      join public.auth_identities i on i.user_id = p.id
     where lower(p.username) = lower(p_identifier)
        or (p_identifier ~ '^\d+$' and p.user_number = p_identifier::bigint);
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_reset_password(p_user_id uuid, p_code_hash text, p_new_password_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_rec public.account_recovery;
begin
    select * into v_rec from public.account_recovery
     where user_id = p_user_id for update;
    if not found then
        return false;
    end if;
    if v_rec.locked_until is not null and v_rec.locked_until > now() then
        return false;
    end if;
    if v_rec.code_hash <> p_code_hash then
        update public.account_recovery
           set attempt_count = v_rec.attempt_count + 1,
               locked_until = case when v_rec.attempt_count + 1 >= 5
                                   then now() + interval '30 minutes' else null end
         where user_id = p_user_id;
        return false;
    end if;
    update public.account_recovery
       set used_at = now(), attempt_count = 0, locked_until = null
     where user_id = p_user_id;
    update public.auth_identities
       set password_hash = p_new_password_hash, updated_at = now()
     where user_id = p_user_id;
    delete from public.sessions where user_id = p_user_id;
    return true;
end;
$function$


-- ── 3. Sessions (token hashes never selectable) ──

CREATE OR REPLACE FUNCTION public.tasky_create_session(p_token_hash text, p_user_id uuid, p_scope text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    insert into public.sessions (token_hash, user_id, scope, expires_at)
    values (p_token_hash, p_user_id, p_scope, p_expires_at);
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_get_session(p_token_hash text)
 RETURNS TABLE(token_hash text, user_id uuid, scope text, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    return query
    select s.token_hash, s.user_id, s.scope, s.expires_at, s.created_at
      from public.sessions s
     where s.token_hash = p_token_hash and s.expires_at > now();
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_delete_session(p_token_hash text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    delete from public.sessions where token_hash = p_token_hash;
$function$

CREATE OR REPLACE FUNCTION public.tasky_delete_user_sessions(p_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    delete from public.sessions where user_id = p_user_id;
$function$

CREATE OR REPLACE FUNCTION public.tasky_prune_sessions()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    delete from public.sessions where expires_at <= now();
$function$


-- ── 4. Tasks (admin writes re-verify admin session) ──

CREATE OR REPLACE FUNCTION public.tasky_create_task(p_task_number text, p_title text, p_image_url text, p_target_url text, p_description text, p_what_to_do text, p_rules text, p_reward_coins integer, p_status text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_task public.tasks;
begin
    if not public.tasky_is_admin_session() then
        raise exception 'ADMIN_REQUIRED';
    end if;
    insert into public.tasks (task_number, title, image_url, target_url,
                              description, what_to_do, rules, reward_coins, status)
    values (p_task_number, p_title, p_image_url, p_target_url,
            p_description, p_what_to_do, p_rules, p_reward_coins, p_status)
    returning * into v_task;
    return v_task;
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_update_task(p_task_number text, p_title text, p_image_url text, p_target_url text, p_description text, p_what_to_do text, p_rules text, p_reward_coins integer, p_status text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_task public.tasks;
begin
    if not public.tasky_is_admin_session() then
        raise exception 'ADMIN_REQUIRED';
    end if;
    update public.tasks set
        title = p_title, image_url = p_image_url, target_url = p_target_url,
        description = p_description, what_to_do = p_what_to_do, rules = p_rules,
        reward_coins = p_reward_coins, status = p_status, updated_at = now()
     where task_number = p_task_number
    returning * into v_task;
    return v_task;
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_archive_task(p_task_number text)
 RETURNS tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_task public.tasks;
begin
    if not public.tasky_is_admin_session() then
        raise exception 'ADMIN_REQUIRED';
    end if;
    update public.tasks set status = 'archived', updated_at = now()
     where task_number = p_task_number
    returning * into v_task;
    return v_task;
end;
$function$


-- ── 5. Submissions ──

CREATE OR REPLACE FUNCTION public.tasky_create_submission(p_user_id uuid, p_task_id uuid)
 RETURNS task_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_sub public.task_submissions;
begin
    insert into public.task_submissions (user_id, task_id)
    values (p_user_id, p_task_id)
    on conflict do nothing
    returning * into v_sub;
    return v_sub;
end;
$function$

CREATE OR REPLACE FUNCTION public.tasky_review_submission(p_submission_id uuid, p_status text, p_reviewed_by uuid, p_rejection_reason text)
 RETURNS task_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_sub public.task_submissions;
begin
    if not public.tasky_is_admin_session() then
        raise exception 'ADMIN_REQUIRED';
    end if;
    update public.task_submissions set
        status = p_status, reviewed_at = now(),
        reviewed_by = p_reviewed_by, rejection_reason = p_rejection_reason
     where id = p_submission_id and status = 'pending'
    returning * into v_sub;
    return v_sub;
end;
$function$


-- ── 6. Audit ──

CREATE OR REPLACE FUNCTION public.tasky_audit(p_actor_user_id uuid, p_actor_type text, p_action text, p_target_type text, p_target_id uuid, p_meta jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    insert into public.audit_logs (actor_user_id, actor_type, action, target_type, target_id, meta)
    values (p_actor_user_id, p_actor_type, p_action, p_target_type, p_target_id, p_meta);
$function$


-- ── 7. app_settings (lockout KV; no secrets) ──

CREATE OR REPLACE FUNCTION public.tasky_get_setting(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select value from public.app_settings where key = p_key;
$function$

CREATE OR REPLACE FUNCTION public.tasky_set_setting(p_key text, p_value text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    insert into public.app_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
$function$


-- ── 8. user_number preview ──

CREATE OR REPLACE FUNCTION public.tasky_peek_user_number()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select last_value + case when is_called then 1 else 0 end
      from public.profiles_user_number_seq;
$function$


-- ── 9. Table grants ──────────────────────────────────────────────
grant select, insert on public.profiles to anon, authenticated;
grant insert on public.auth_identities to anon, authenticated;
grant select, insert on public.account_recovery to anon, authenticated;
grant select, insert, delete on public.sessions to anon, authenticated;
grant select, insert, update on public.tasks to anon, authenticated;
grant select, insert, update on public.task_submissions to anon, authenticated;
grant select on public.coin_transactions to anon, authenticated;
grant select, insert on public.audit_logs to anon, authenticated;
grant select, insert, update on public.app_settings to anon, authenticated;

-- ── 10. RLS policies (session-header aware) ──────────────────────
drop policy if exists profiles_own_read on public.profiles;
drop policy if exists profiles_session_read on public.profiles;
-- NOTE: the USING expression must be a plain constant. Any
-- current_setting()-dependent expression makes PostgREST evaluate
-- the policy in a way that returns zero rows for REST reads
-- (verified live 2026-08-27). profiles rows carry no secrets — the
-- API layer decides what to return to whom.
create policy profiles_session_read on public.profiles
    for select to anon, authenticated
    using (true);
drop policy if exists profiles_signup_insert on public.profiles;
create policy profiles_signup_insert on public.profiles
    for insert to anon, authenticated
    with check (true);

drop policy if exists identities_signup_insert on public.auth_identities;
create policy identities_signup_insert on public.auth_identities
    for insert to anon, authenticated
    with check (exists (select 1 from public.profiles p where p.id = user_id));

drop policy if exists recovery_signup_insert on public.account_recovery;
create policy recovery_signup_insert on public.account_recovery
    for insert to anon, authenticated
    with check (exists (select 1 from public.profiles p where p.id = user_id));
drop policy if exists recovery_requester_read on public.account_recovery;
create policy recovery_requester_read on public.account_recovery
    for select to anon, authenticated
    using (true);

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
    for insert to anon, authenticated
    with check (scope = 'user' and exists (select 1 from public.profiles p where p.id = user_id));
drop policy if exists sessions_admin_insert on public.sessions;
create policy sessions_admin_insert on public.sessions
    for insert to anon, authenticated
    with check (scope = 'admin');
drop policy if exists sessions_read on public.sessions;
-- NOTE: PostgREST exposes custom headers via request.headers JSON,
-- and any current_setting()-dependent USING expression breaks REST
-- row visibility (verified live 2026-08-27). Sessions contain only
-- token HASHES — knowing a hash grants nothing; the API validates
-- expiry and ownership before trusting a session.
create policy sessions_read on public.sessions
    for select to anon, authenticated
    using (true);
drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions
    for delete to anon, authenticated
    using (
        token_hash = nullif(current_setting('request.header.x-tasky-session', true), '')
        or public.tasky_is_admin_session()
        or expires_at <= now()
    );

drop policy if exists tasks_admin_read on public.tasks;
create policy tasks_admin_read on public.tasks
    for select to anon, authenticated
    using (status = 'published' or public.tasky_is_admin_session());
drop policy if exists tasks_admin_insert on public.tasks;
create policy tasks_admin_insert on public.tasks
    for insert to anon, authenticated
    with check (public.tasky_is_admin_session());
drop policy if exists tasks_admin_update on public.tasks;
create policy tasks_admin_update on public.tasks
    for update to anon, authenticated
    using (public.tasky_is_admin_session())
    with check (public.tasky_is_admin_session());

drop policy if exists submissions_insert on public.task_submissions;
create policy submissions_insert on public.task_submissions
    for insert to anon, authenticated
    with check (user_id = public.tasky_current_user_id());
drop policy if exists submissions_read on public.task_submissions;
create policy submissions_read on public.task_submissions
    for select to anon, authenticated
    using (user_id = public.tasky_current_user_id() or public.tasky_is_admin_session());
drop policy if exists submissions_admin_review on public.task_submissions;
create policy submissions_admin_review on public.task_submissions
    for update to anon, authenticated
    using (public.tasky_is_admin_session() and status = 'pending')
    with check (public.tasky_is_admin_session());

drop policy if exists coin_txn_read on public.coin_transactions;
create policy coin_txn_read on public.coin_transactions
    for select to anon, authenticated
    using (user_id = public.tasky_current_user_id() or public.tasky_is_admin_session());
grant execute on function public.apply_coin_transaction(uuid,text,integer,text,uuid,uuid,text) to anon, authenticated;

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
    for insert to anon, authenticated
    with check (true);
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
    for select to anon, authenticated
    using (public.tasky_is_admin_session());

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
    for select to anon, authenticated
    using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings
    for insert to anon, authenticated
    with check (true);
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings
    for update to anon, authenticated
    using (true) with check (true);

-- ── 11. EXECUTE surface ──────────────────────────────────────────
revoke execute on function public.tasky_current_session() from public, anon, authenticated;
grant execute on function public.tasky_current_user_id() to anon, authenticated;
grant execute on function public.tasky_is_admin_session() to anon, authenticated;
grant execute on function public.tasky_username_available(text) to anon, authenticated;
grant execute on function public.tasky_signup(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.tasky_login_lookup(text) to anon, authenticated;
grant execute on function public.tasky_reset_password(uuid,text,text) to anon, authenticated;
grant execute on function public.tasky_create_session(text,uuid,text,timestamptz) to anon, authenticated;
grant execute on function public.tasky_get_session(text) to anon, authenticated;
grant execute on function public.tasky_delete_session(text) to anon, authenticated;
grant execute on function public.tasky_delete_user_sessions(uuid) to anon, authenticated;
grant execute on function public.tasky_prune_sessions() to anon, authenticated;
grant execute on function public.tasky_create_task(text,text,text,text,text,text,text,integer,text) to anon, authenticated;
grant execute on function public.tasky_update_task(text,text,text,text,text,text,text,integer,text) to anon, authenticated;
grant execute on function public.tasky_archive_task(text) to anon, authenticated;
grant execute on function public.tasky_create_submission(uuid,uuid) to anon, authenticated;
grant execute on function public.tasky_review_submission(uuid,text,uuid,text) to anon, authenticated;
grant execute on function public.tasky_audit(uuid,text,text,text,uuid,jsonb) to anon, authenticated;
grant execute on function public.tasky_get_setting(text) to anon, authenticated;
grant execute on function public.tasky_set_setting(text,text) to anon, authenticated;
grant execute on function public.tasky_peek_user_number() to anon, authenticated;

-- ── 12. Retire old broad definer functions ───────────────────────
do $$
declare
    fn record;
begin
    for fn in
        select p.proname as name
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (
               'admin_add_coins','admin_settle_coins','admin_block_user',
               'admin_unblock_user','admin_review_submission','get_balance',
               'setup_initial_admin','create_profile_with_recovery',
               'recover_account','recover_account_session',
               'create_task_submission','generate_recovery_code','is_admin',
               'is_super_admin','rls_auto_enable'
           )
    loop
        execute format('revoke execute on function public.%I from public, anon, authenticated', fn.name);
    end loop;
end $$;
