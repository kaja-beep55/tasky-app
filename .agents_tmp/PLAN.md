# 1. OBJECTIVE

Tasky-এর জন্য একটি verification-only test run চালানো: (১) cross-device login ধরে রাখে কি না, (২) সব ডেটা টাইপ কোথায় persist হয় তা নির্ণয়, (৩) delete/archive আচরণ যাচাই, এবং (৪) বাংলায় PASS/FAIL রিপোর্ট দেওয়া। কোনো নতুন feature বা UI পরিবর্তন হবে না; শুধু ছোট, নিরাপদ data/security bug পাওয়া গেলে minimal fix + re-test। কোনো real secret ব্যবহার হবে না (শুধু test-only env মান), কোনো production data touched হবে না — সব verification একটি fresh temp DB ফাইল ও temp test image দিয়ে আলাদা environment-এ চলবে।

# 2. CONTEXT SUMMARY

**Stack:** React 19 + Vite frontend (port 12000), Node API local dev server `scripts/dev-api.ts` (port 12001)। ডেটা দুই driver-এর এক: local JSON (default `.tasky-local/db.json`, `TASKY_LOCAL_DB_PATH`-এ override) অথবা Supabase (যদি `SUPABASE_URL` + key থাকে)। Selector: `api/_lib/db/index.ts`। আমরা শুধু **local JSON driver** test করব — real Supabase credentials নেই, এবং AGENTS.md workflow contract বলে Supabase checkpoint-এ stop করতে।

**Storage map (local driver — যাচাইয়ের target):**
- Profile → `profiles[]` in db.json (`createProfile`)
- Password hash → আলাদা `identities[]` (কখনো profile-এ নয়; scrypt)
- Recovery code (peppered SHA-256) → `recoveries[]`
- Sessions (হ্যাশ-স্টোরড opaque token) → `sessions[]`
- Tasks → `tasks[]`
- Submissions → `submissions[]`
- Coin history → `coinTransactions[]`; balance `profiles.coins`-এ denormalized
- Audit → `auditLogs[]`
- **Images:** DB তে শুধু `imageUrl` string; actual file হোয় `public/task-images/*.svg` (Vite/static-served) অথবা external `https://` URL। কোনো upload endpoint নেই; কোনো Supabase bucket migration নেই। Admin form-এ URL manually input করা হয়।

**Delete semantics (গুরুত্বপূর্ণ finding):** একমাত্র Delete action হলো admin task Delete (`Trash2` button, `AdminTasks.tsx`) → `DELETE /api/admin/tasks/:n` → `archiveTask()` — **soft delete** (`status:'archived'`)। Record মোছে না (শুধু status বদলায়), image file/URL-ও মোছে না, এবং পুরনো URL serve হতে থাকে (static asset/external)। UI text নিজেই বলে: "The task will be archived… Past submissions and coin history are preserved." এই design টি submissions/coin-history referential integrity রক্ষা করার জন্য ইচ্ছাকৃত।

**Expected test outcomes (execution-এর পরে verify হবে):**
- Cross-device login, profile/coin persistence, coin history, image storage reference — PASS হওয়ার কথা (existing test-suite ই এগুলোর বড় অংশ cover করে)।
- DATABASE DELETE: FAIL (hard delete নয় — archive) — by design, severity তুলনামূলক Low; user expectation-এর সাথে mismatch report করতে হবে।
- STORAGE DELETE: FAIL — image remove হয় না; severity Low (শুধু static assets; পুরাতন image সার্ভ হতে থাকে)।
- ORPHAN FILE: প্রযুক্তিগতভাবে PASS — archived record এখনো image-কে reference করে, তাই actual orphan নেই; তবে image-এর কোনো lifecycle নেই → flagged note।

**Other risks:** কোনো test data কে production data-এর সাথে গুলানো যাবে না — সম্পূর্ণ run fresh `TASKY_LOCAL_DB_PATH` temp ফাইলে হবে; repo-seeded tasks/images ছুঁয়ে না।

# 3. APPROACH OVERVIEW

1. **Isolation first:** fresh temp DB ফাইল (`TASKY_LOCAL_DB_PATH=/tmp/tasky-final-test-<ts>/db.json`) + test-only env vars (`ADMIN_PANEL_CODE=1234567890` — repo test suite-এর মতোই dummy; `SESSION_SECRET=test-...`, `RECOVERY_CODE_PEPPER=test-...`) দিয়ে `npm run dev:api` চালু। Frontend static image serving যাচাইয়ের জন্য `npm run dev` (Vite) ও চালু করা যায়; অন্যথায় filesystem-level existence check যথেষ্ট।
2. **Scripted end-to-end verification:** একটি ব্রোড bash/curl স্ক্রিপ্ট (কিংবা `tests/helpers.ts` pattern-এর মতো একটি node script) যা দুটি আলাদা cookie jar = দুটি "ডিভাইস" simulate করে। Device A → signup/login → /auth/me, /coins/history → logout; Device B → same identifier+password login → same reads → exact-match comparisons।
3. **Persistence audit:** test চালুর পর db.json ফাইল পড়ে প্রতিটি ডেটা টাইপের সঠিক সংরক্ষণ নিশ্চিত করা; image হলে DB-র `imageUrl` ↔ `public/task-images/` ফাইল mapping যাচাই।
4. **Delete probe:** temp test image (`public/task-images/final-delete-test.svg`) + temp task তৈরি; একটি submission ও coin transaction বানান; তারপর normal Delete endpoint চালু; asserts: record archived (exists with status), file অক্ষত, URL সার্ভ হচ্ছে, orphan নেই কিনা। শেষে image ফাইল cleanup — reported orphan কে না ছেড়ে।
5. **Fix policy:** actual bug (যেমন balance/history mismatch, duplicate account, session leakage) পেলে ছোট minimal fix; তারপে সেই scenario + পুরো `npm test` আবার চালু। Delete-semantics mismatch গুলো fix **করবে না** — by design আচরণ; report-এ severity + rationale লিখে দেবে। কোনো ক্ষেত্রেই Supabase নয়, production data নয়।

Alternatives considered: (a) শুধু existing `npm test` চালানো — অপর্যাপ্ত: cross-device sequence ও delete/storage probe cover করে না। (b) Supabase-এ চালানো — নিষিদ্ধ (no real secrets; workflow contract-এ checkpoint)। (c) hard-delete implement করা — scope violation (নতুন feature) ও design-র বিরোধী।

# 4. IMPLEMENTATION STEPS

**Step 0 — Baseline ও isolation:**
- Goal: green baseline + আলাদা test env।
- Method: `npm test`, `npm run lint`, `npm run build` চালিয়ে baseline নিশ্চিত করা। তারপর temp dir বানিয়ে `TASKY_LOCAL_DB_PATH=<tmp>/db.json`, `ADMIN_PANEL_CODE=1234567890`, `SESSION_SECRET=test-session-secret`, `RECOVERY_CODE_PEPPER=test-pepper` সেট করে `npm run dev:api` (port 12001) start করা। Image-URL যাচাই চাইলে `npm run dev` (port 12000) ও start।
- Reference: `scripts/dev-api.ts`, `api/_lib/db/index.ts`, `tests/api.test.ts` (env patterns)।

**Step 1 — Cross-device login test (device A → device B):**
- Goal: একই account দুই "ডিভাইসে" ফেরে; clone নয়।
- Method: দুটি cookie jar (`jarA`, `jarB`) ধরে curl/node script: (1) A: `POST /api/auth/signup` (দ্রষ্টব্য: response cookie jarA-তে) → `GET /api/auth/me` → `GET /api/coins/history` → `POST /api/auth/logout` → verify `/api/auth/me` এখন 401। (2) B: `POST /api/auth/login` `{identifier: username, password}` → `/me` + `/coins/history`। (3) Same flow আবার `identifier = userNumber` (6-digit) দিয়ে। (4) Compare: profile `id`, `userNumber`, `username`, `coins` exact-equal; coin history arrays identical (`id` list + sequence); temp DB ফাইলের `profiles`-এ ঠিক ১টি record সেই username-এর জন্য (no new account)।
- Reference: `api/auth/login.ts`, `api/auth/me.ts`, `api/coins/history.ts`, `api/auth/logout.ts`, `tests/api.test.ts`("login by username AND by user number both restore the same account")।

**Step 2 — Data persistence mapping:**
- Goal: প্রতিটি ডেটা টাইপের storage location নিশ্চিত করা।
- Method: test account-এ admin unlock (`POST /api/admin/unlock` test code দিয়ে), admin coin add (`POST /api/admin/coins` unique idempotency key দিয়ে), submission (`POST /api/submissions`) তৈরি। তারপর `<tmp>/db.json` ফাইল পড়ে নিশ্চিত: `profiles` (profile row), `identities` (scrypt hash, আলাদা section), `recoveries` (hash), `sessions` (token hash), `tasks`, `submissions`, `coinTransactions` (previousBalance/newBalance chain), `auditLogs`। Image: `imageUrl` string-ই DB তে থাকে; file `public/task-images/`-এ (অথবা external https URL) — DB↔file relation হলো URL string reference; কোনো real relation/constraint নেই। একইভাবে build output `dist/task-images/`-ও।
- Reference: `api/_lib/db/local.ts`, `api/_lib/db/types.ts`, `public/task-images/`।

**Step 3 — Delete probe:**
- Goal: delete আচরণ + orphan/survival যাচাই।
- Method: (1) temp image `<svg …/>` marker ফাইল `public/task-images/final-delete-test.svg` বানাও। (2) Admin: `POST /api/admin/tasks` `taskNumber:'T-DEL'`, `imageUrl:'/task-images/final-delete-test.svg'`। (3) User: `POST /api/submissions` (referential link যাচাইয়ের জন্য একটি submission রেকর্ড; WhatsApp-flow metadata only)। (4) Admin: `DELETE /api/admin/tasks/T-DEL`। (5) Asserts: `GET /api/admin/tasks` → record আছে, `status:'archived'` → DATABASE DELETE=FAIL(by design); file `public/task-images/…` অক্ষত → STORAGE DELETE=FAIL; URL-ই accessible (`npm run dev` চালু থাকলে GET 200; else filesystem exists চেক) → old-URL-accessible=true; archived record image-কে এখনো reference → orphan নেই → ORPHAN FILE=PASS (with lifecycle-risk note)। (6) Cleanup: test image ফাইল delete করো এবং temp DB ফাইল discard করো। Repo seeded data অক্ষত।
- Reference: `api/admin/tasks/[taskNumber].ts`(DELETE→archive), `src/pages/admin/AdminTasks.tsx`, `tests/api.test.ts`("admin can create, edit, and archive a task")।

**Step 4 — Severity assessment + conditional fix:**
- Goal: যেকোনো genuine bug (Step 1-2-3-এ পাওয়া) minimal-স্কোপে fix + re-test; design mismatches report-only।
- Method: প্রতিটি FAIL item-এর severity (data-loss risk / security / by-design) tag করা। যদি e.g. history অসঙ্গতি, duplicate account, session/auth ভুল দেখা যায় — ছোট fix (সবচেয়ে ছোট সমাধান) → failing scenario rerun + পুরো `npm test`, `lint`, `build`।

**Step 5 — Final Bengali report:**
- Goal: user-এর prescribed format-এ ফলাফল।
- Method: ঠিক নিচের লাইনগুলো (যেখানে PASS/FAIL যায়গা স্ক্রিপ্ট output থেকে):
  - CROSS-DEVICE LOGIN: PASS/FAIL
  - PROFILE PERSISTENCE: PASS/FAIL
  - COIN PERSISTENCE: PASS/FAIL
  - COIN HISTORY: PASS/FAIL
  - IMAGE STORAGE: PASS/FAIL
  - DATABASE DELETE: PASS/FAIL
  - STORAGE DELETE: PASS/FAIL
  - ORPHAN FILE: PASS/FAIL
  প্রতিটি FAIL-এ severity + rationale; নোট: সব test data temp/db ছিল, repo seeded data অক্ষত, cleanup done।

# 5. TESTING AND VALIDATION

**Baseline gate:** `npm test` (42 tests), `npm run lint`, `npm run build` — শুরুতে সব pass হতে হবে; pre-existing pass-rate report করো।

**Acceptance criteria per checklist item:**
- CROSS-DEVICE LOGIN: PASS iff profile `id`/`userNumber` equal A↔B (username- ও userNumber-উভয় login), balance সম্পূর্ণ identical, history identical, এবং db file-এ ঠিক ১টি profile থাকে সেই username-এর জন্য।
- PROFILE PERSISTENCE: PASS iff db.json `profiles[]`-এ name/country/state/userNumber/coins/createdAt অবিকত persist হয় এবং relogin-এ ফেরে।
- COIN PERSISTENCE: PASS iff `profiles.coins` balance-এ admin txn-এর পর update হয় এবং re-login-এ stable।
- COIN HISTORY: PASS iff `coinTransactions[]` append-only log-এ previousBalance→newBalance chain সঠিক এবং দুই ডিভাইসে identical।
- IMAGE STORAGE: PASS iff imageUrl string DB-তে থাকে এবং file `public/task-images/` (বা external https) অবস্থানে match করে; no upload/bucket confusion।
- DATABASE DELETE: PASS iff Delete-এর পর record hard-deleted বা archive documented-as-behavior; user checklist-এর strict reading-এ archive=FAIL → marked with severity "Low / by design (referential integrity preserved)"।
- STORAGE DELETE: PASS iff সম্পর্কিত image remove হয়; expected FAIL → severity "Low" কারণ static assets, upload feature absent, old URL accessible।
- ORPHAN FILE: PASS iff কোনো file DB reference ছাড়া ভাসে না (এখানে archived record এখনো reference করে → orphan নেই); note: কোনো cleanup mechanism নেই → future upload feature-এর জন্য risk flag।

**Validation loops:** failing test re-run করে প্রতিটি fix এর পরে নিশ্চিত; final report-এ exact PASS/FAIL lines + severity নোট + "no real secrets / temp DB only / repo data untouched / cleanup done" statements।
