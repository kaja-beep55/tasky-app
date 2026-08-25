# Tasky — project memory

Rebuilt from XLMx402earn (old crypto product fully removed; baseline commit b776e08).

## Workflow contract (user's spec)

Strict phase order. After frontend+backend+security are done, STOP at the
"Supabase checkpoint": report what credentials are needed (exact env names,
public vs secret, where to obtain/place them) and wait for the user's
explicit "CONTINUE" before touching any real Supabase project.

## Stack / commands

- React 19 + TS + Vite frontend (port 12000), Node serverless-style API (port 12001).
- `npm run dev` starts frontend; `npm run dev:api` (scripts/dev-api.ts) runs the API locally.
- Checks: `npm run lint`, `npm test` (node:test, 42 tests), `npm run build`.
- DB driver selection in api/_lib/db/index.ts: Supabase only when BOTH
  SUPABASE_URL + SUPABASE_SECRET_KEY exist, else local JSON driver (TASKY_LOCAL_DB_PATH).

## Key invariants

- Passwords: scrypt (security.ts), never leave the server. Recovery codes: peppered SHA-256.
- Sessions: opaque tokens in httpOnly SameSite=Strict cookies; ONLY hashes stored server-side.
  Never return tokens in response bodies (fixed 2026-08-25 — was a leak).
- Coin ledger: append-only, idempotent (client sends stable idempotency key),
  balance + transaction updated atomically.
- Admin unlock: 10-digit ADMIN_PANEL_CODE, constant-time compare, lockout after 5 fails.
- Local driver resolves TASKY_LOCAL_DB_PATH lazily (tests set env after hoisted imports).
- WhatsApp flow is a wa.me link only — no video is ever stored anywhere.
