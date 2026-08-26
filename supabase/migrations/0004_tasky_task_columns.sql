-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0004: fix the tasks table.
-- The API driver expects `what_to_do` (not `instructions`).
-- Rename the column for consistency.
-- ══════════════════════════════════════════════════════════════

alter table public.tasks
    rename column instructions to what_to_do;
