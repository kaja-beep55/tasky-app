-- ══════════════════════════════════════════════════════════════
-- Tasky — migration 0002: widen grants/policies for app_settings
-- The API needs read/write access to non-secret app settings
-- (lockout counters, admin-code hash, etc.) through the
-- publishable/anon role. This is safe because app_settings
-- holds no user data and no secrets.
-- ══════════════════════════════════════════════════════════════

-- Grants already applied in 0001 remain. Add INSERT/UPDATE for
-- app_settings so the backend can manage lockout/settings rows.
grant insert, update on public.app_settings to anon, authenticated;

create policy app_settings_rw on public.app_settings
    for all to anon, authenticated
    using (true)
    with check (true);
