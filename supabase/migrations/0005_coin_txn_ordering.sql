-- Deterministic ordering for the coin ledger.
alter table public.coin_transactions
    add column if not exists seq bigint generated always as identity;

create unique index if not exists coin_transactions_seq_idx on public.coin_transactions (seq);
