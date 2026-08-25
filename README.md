# Tasky — Complete Tasks, Earn Coins

A simple mobile-first website where users complete small online tasks
(watch a video, subscribe, follow a page…), submit a short proof video
over WhatsApp, and an admin credits coins after manual review.

> This repository was rebuilt from the ground up. The old
> Stellar/x402 crypto product was fully removed — no wallets, no XLM,
> no blockchain, no AI-agent marketplace logic remains.

## Stack

- **Frontend:** React 19 + TypeScript + Vite (mobile-first "pocket ledger" design)
- **Backend:** Vercel-style serverless functions in `api/` (Node, zero external deps)
- **Database:** pluggable driver —
  - `local` (JSON file, default — zero credentials needed)
  - `supabase` (activated automatically when `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set)

## Quick start

```bash
npm install
cp .env.example .env   # fill in SESSION_SECRET, ADMIN_PANEL_CODE, RECOVERY_CODE_PEPPER
npm run dev            # frontend on :12000, API on :12001 (proxied)
```

Run the checks:

```bash
npm run lint
npm test
npm run build
```

## How it works

1. A visitor opens the home page and sees tasks immediately — no signup wall.
2. They create a profile (name, country, state, password). No email, no phone, no OTP.
   A unique username, user number, and a one-time recovery code are generated.
3. On a task page they tap **OPEN TARGET**, complete the task, record a proof video,
   and tap **SEND VIDEO ON WHATSAPP**. The video goes straight to WhatsApp —
   Tasky never stores, uploads, or proxies it.
4. The admin reviews the video in WhatsApp, finds the user in the Admin Panel,
   and adds coins. Every balance change is an append-only, idempotent transaction
   with a recorded reason.

## Admin Panel

Unlocked with a server-verified 10-digit code (`ADMIN_PANEL_CODE` env var, rate-limited
with temporary lockout). Sections: Task Details (search/edit/archive), Add Task,
Add Coins (add / deduct / reset with mandatory reason), Submissions review, Audit log.

## Security model (summary)

- Passwords: salted scrypt, never leave the server; recovery codes: peppered SHA-256.
- Sessions: opaque tokens in `httpOnly`+`SameSite=Strict` cookies; only SHA-256 hashes stored.
- Authorization is always server-side; users can only read their own data.
- Coin changes are atomic, append-only, and idempotent (stable idempotency keys).
- Rate limiting + lockout on login, recovery, and admin unlock.
- Strict input validation (https-only target URLs, safe task numbers, capped lengths).
- Generic error messages — no user enumeration.

## Project layout

```
api/                 serverless API (auth, tasks, submissions, coins, admin)
  _lib/              security, validation, rate limiting, lockout, db drivers
src/pages/           Home, TaskDetail, Signup, Login, Recover, Profile, CoinHistory, policies
src/pages/admin/     Admin unlock + panel (tasks, coins, submissions, audit)
supabase/            (schema added at the Supabase phase)
tests/               node:test unit + API integration tests (42 tests)
scripts/dev-api.ts   local API server used by `npm run dev:api`
```

## Environment variables

See `.env.example` — every variable is documented there.
**Never commit `.env`. Never put `SUPABASE_SECRET_KEY` in the frontend.**
