-- ══════════════════════════════════════════════════════════════
-- Tasky — initial schema (reproducible migration 0001)
-- No crypto, no Stellar, no video storage. Metadata only.
-- ══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── profiles ─────────────────────────────────────────────────
create table public.profiles (
    id            uuid primary key default gen_random_uuid(),
    user_number   bigint      not null unique,
    username      text        not null check (username ~ '^[a-z0-9_]{3,30}$'),
    name          text        not null check (char_length(name) between 2 and 80),
    country       text        not null check (char_length(country) between 2 and 80),
    state         text        not null check (char_length(state) between 2 and 80),
    coin_balance  integer     not null default 0 check (coin_balance >= 0),
    status        text        not null default 'active' check (status in ('active','suspended')),
    last_login_at timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Users must not be able to modify privileged columns directly.



-- ── auth identities (server-only; scrypt hashes) ─────────────
create table public.auth_identities (
    user_id       uuid primary key references public.profiles(id) on delete cascade,
    password_hash text not null,               -- scrypt$N$r$p$salt$hash
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- ── account recovery (hashed codes, attempt tracking) ────────
create table public.account_recovery (
    user_id         uuid primary key references public.profiles(id) on delete cascade,
    code_hash       text not null,             -- sha256(code + server pepper)
    attempt_count   integer not null default 0,
    locked_until    timestamptz,
    used_at         timestamptz,
    created_at      timestamptz not null default now()
);

-- ── sessions (only token hashes are stored) ──────────────────
create table public.sessions (
    token_hash  text primary key,              -- sha256(opaque token)
    user_id     uuid references public.profiles(id) on delete cascade,
    scope       text not null check (scope in ('user','admin')),
    expires_at  timestamptz not null,
    created_at  timestamptz not null default now()
);

-- ── tasks ────────────────────────────────────────────────────
create table public.tasks (
    id           uuid primary key default gen_random_uuid(),
    task_number  text not null unique check (task_number ~ '^[A-Za-z0-9-]{1,20}$'),
    title        text not null check (char_length(title) between 2 and 120),
    image_url    text not null,
    target_url   text not null check (target_url ~ '^https://'),
    description  text not null default '',
    instructions text not null default '',
    rules        text not null default '',
    reward_coins integer not null check (reward_coins >= 0 and reward_coins <= 100000),
    status       text not null default 'published' check (status in ('published','archived')),
    created_by   uuid,
    updated_by   uuid,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

create trigger trg_tasks_touch
    before update on public.tasks
    for each row execute function public.touch_updated_at();

-- ── task submissions (metadata only — NEVER video) ───────────
create table public.task_submissions (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.profiles(id) on delete cascade,
    task_id          uuid not null references public.tasks(id) on delete restrict,
    status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
    rejection_reason text,
    reviewed_by      uuid,
    submitted_at     timestamptz not null default now(),
    reviewed_at      timestamptz,
    unique (user_id, task_id)                  -- one submission per user per task
);

-- ── coin transactions (append-only ledger) ───────────────────
create table public.coin_transactions (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.profiles(id) on delete restrict,
    action_type      text not null check (action_type in
                     ('task_reward','admin_add','admin_deduct','admin_reset','adjustment')),
    amount           integer not null,
    previous_balance integer not null check (previous_balance >= 0),
    new_balance      integer not null check (new_balance >= 0),
    reason           text not null check (char_length(reason) between 2 and 300),
    task_id          uuid references public.tasks(id) on delete set null,
    admin_id         uuid,
    idempotency_key  text not null,
    created_at       timestamptz not null default now(),
    unique (user_id, idempotency_key)          -- retries can never double-apply
);

-- Ledger is append-only: block UPDATE/DELETE at the table level.
create or replace function public.block_ledger_mutation() returns trigger
language plpgsql as $$
begin
    raise exception 'coin_transactions is append-only';
end $$;

create trigger trg_ledger_no_update
    before update or delete on public.coin_transactions
    for each row execute function public.block_ledger_mutation();

-- ── admin roles ──────────────────────────────────────────────
create table public.admin_roles (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null unique references public.profiles(id) on delete cascade,
    role       text not null default 'admin' check (role in ('admin')),
    status     text not null default 'active' check (status in ('active','revoked')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ── audit logs (append-only; no passwords/codes/secrets) ─────
create table public.audit_logs (
    id            uuid primary key default gen_random_uuid(),
    actor_user_id uuid,
    actor_type    text not null check (actor_type in ('user','admin','system')),
    action        text not null,
    target_type   text,
    target_id     text,
    meta          jsonb,
    created_at    timestamptz not null default now()
);

create trigger trg_audit_no_mutation
    before update or delete on public.audit_logs
    for each row execute function public.block_ledger_mutation();

-- ── app settings (non-secret config only) ────────────────────
create table public.app_settings (
    key        text primary key,
    value      text not null,
    updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════
-- ATOMIC COIN FUNCTION — the ONLY way balances change.
-- Locks the profile row, validates, updates balance, writes the
-- ledger entry — all-or-nothing. Idempotent via unique key.
-- ══════════════════════════════════════════════════════════════
create or replace function public.apply_coin_transaction(
    p_user_id         uuid,
    p_action_type     text,
    p_amount          integer,
    p_reason          text,
    p_admin_id        uuid,
    p_task_id         uuid,
    p_idempotency_key text
) returns public.coin_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prev integer;
    v_new  integer;
    v_amt  integer;
    v_txn  public.coin_transactions;
begin
    -- Idempotency: already applied? return the original row.
    select * into v_txn from public.coin_transactions
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
        return v_txn;
    end if;

    -- Lock the balance row for the duration of this transaction.
    select coin_balance into v_prev from public.profiles
     where id = p_user_id and status = 'active'
     for update;
    if not found then
        raise exception 'user not found or not active';
    end if;

    if p_action_type = 'admin_reset' then
        v_amt := -v_prev;
        v_new := 0;
    else
        if p_amount is null or p_amount <= 0 then
            raise exception 'amount must be a positive integer';
        end if;
        v_amt := case when p_action_type in ('admin_deduct') then -p_amount else p_amount end;
        v_new := v_prev + v_amt;
    end if;

    if v_new < 0 then
        raise exception 'insufficient balance';
    end if;

    -- Trigger guard blocks direct balance updates, so do it via a
    -- session flag that only this function sets.
    perform set_config('tasky.coin_write', 'on', true);
    update public.profiles set coin_balance = v_new where id = p_user_id;
    perform set_config('tasky.coin_write', 'off', true);

    insert into public.coin_transactions
        (user_id, action_type, amount, previous_balance, new_balance,
         reason, task_id, admin_id, idempotency_key)
    values
        (p_user_id, p_action_type, v_amt, v_prev, v_new,
         p_reason, p_task_id, p_admin_id, p_idempotency_key)
    returning * into v_txn;

    return v_txn;
end $$;

-- Allow the guard trigger to pass when the function is writing.
create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
    if current_setting('tasky.coin_write', true) is distinct from 'on' then
        if new.coin_balance is distinct from old.coin_balance
           or new.user_number is distinct from old.user_number
           or new.username    is distinct from old.username
           or new.status      is distinct from old.status then
            raise exception 'privileged profile fields cannot be modified directly';
        end if;
    end if;
    new.updated_at := now();
    return new;
end $$;

create trigger trg_profiles_guard
    before update on public.profiles
    for each row execute function public.guard_profile_update();

create unique index idx_profiles_username_unique on public.profiles (lower(username));

-- ══════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════
create index idx_profiles_user_number  on public.profiles (user_number);
create index idx_profiles_name         on public.profiles (name);
create index idx_tasks_task_number     on public.tasks (task_number);
create index idx_tasks_title           on public.tasks (title);
create index idx_tasks_status          on public.tasks (status);
create index idx_submissions_user      on public.task_submissions (user_id);
create index idx_submissions_task      on public.task_submissions (task_id);
create index idx_submissions_status    on public.task_submissions (status);
create index idx_coin_txn_user         on public.coin_transactions (user_id);
create index idx_coin_txn_created      on public.coin_transactions (created_at);
create index idx_audit_actor           on public.audit_logs (actor_user_id);
create index idx_audit_created         on public.audit_logs (created_at);
create index idx_sessions_user         on public.sessions (user_id);
create index idx_sessions_expiry       on public.sessions (expires_at);

-- ══════════════════════════════════════════════════════════════
-- GRANTS + RLS  (least privilege: revoke everything, grant only
-- what each role needs; the API uses the secret key which
-- bypasses RLS — every authorization decision happens server-side)
-- ══════════════════════════════════════════════════════════════

alter table public.profiles          enable row level security;
alter table public.auth_identities   enable row level security;
alter table public.account_recovery  enable row level security;
alter table public.sessions          enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_submissions  enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.admin_roles       enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.app_settings      enable row level security;

-- Defaults are already locked down; make it explicit.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Public/anonymous: read published tasks only.
grant select on public.tasks to anon, authenticated;
create policy tasks_public_read on public.tasks
    for select to anon, authenticated
    using (status = 'published');

-- Signed-in users: read their own profile + own coin history.
grant select on public.profiles to authenticated;
create policy profiles_own_read on public.profiles
    for select to authenticated
    using (auth.uid()::text = id::text);

grant select on public.coin_transactions to authenticated;
create policy coin_txn_own_read on public.coin_transactions
    for select to authenticated
    using (auth.uid()::text = user_id::text);

grant select on public.task_submissions to authenticated;
create policy submissions_own_read on public.task_submissions
    for select to authenticated
    using (auth.uid()::text = user_id::text);

-- apply_coin_transaction may only be executed by the backend
-- (secret key role). No public EXECUTE.
revoke execute on function public.apply_coin_transaction(uuid,text,integer,text,uuid,uuid,text) from anon, authenticated;
