import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TASKY_LOCAL_DB_PATH = join(mkdtempSync(join(tmpdir(), 'tasky-api-')), 'db.json');
process.env.ADMIN_PANEL_CODE = '1234567890';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.RECOVERY_CODE_PEPPER = 'test-pepper';

import { call } from './helpers';
import signup from '../api/_routes/auth/signup';
import login from '../api/_routes/auth/login';
import logout from '../api/_routes/auth/logout';
import me from '../api/_routes/auth/me';
import recover from '../api/_routes/auth/recover';
import tasksIndex from '../api/_routes/tasks/index';
import taskDetail from '../api/_routes/tasks/[taskNumber]';
import submissions from '../api/_routes/submissions';
import coinsHistory from '../api/_routes/coins/history';
import adminUnlock from '../api/_routes/admin/unlock';
import adminTasks from '../api/_routes/admin/tasks/index';
import adminTaskItem from '../api/_routes/admin/tasks/[taskNumber]';
import adminUsers from '../api/_routes/admin/users';
import adminCoins from '../api/_routes/admin/coins';
import adminSubmissions from '../api/_routes/admin/submissions';

let userCookies: Record<string, string>;
let adminCookies: Record<string, string>;
let userId: string;
let username: string;
let userNumber: number;
let recoveryCode: string;

const NEW_USER = { name: 'Test User', country: 'Bangladesh', state: 'Dhaka', password: 'super-secret-99' };

before(async () => {
    const res = await call(signup, { method: 'POST', body: NEW_USER });
    assert.equal(res.status, 201);
    const profile = res.body.profile as Record<string, unknown>;
    userId = profile.id as string;
    username = profile.username as string;
    userNumber = profile.userNumber as number;
    recoveryCode = res.body.recoveryCode as string;
    userCookies = res.cookies;
});

// ── Public surface ──────────────────────────────────────────

test('GET /api/tasks returns published tasks without auth', async () => {
    const res = await call(tasksIndex);
    assert.equal(res.status, 200);
    const tasks = res.body.tasks as unknown[];
    assert.ok(tasks.length > 0);
});

test('GET /api/tasks/:n returns one task, 404 for unknown', async () => {
    const ok = await call(taskDetail, { query: { taskNumber: '1' } });
    assert.equal(ok.status, 200);
    const missing = await call(taskDetail, { query: { taskNumber: '9999' } });
    assert.equal(missing.status, 404);
});

test('GET /api/tasks rejects traversal-ish task numbers', async () => {
    const res = await call(taskDetail, { query: { taskNumber: '../etc/passwd' } });
    assert.equal(res.status, 400);
});

// ── Auth ────────────────────────────────────────────────────

test('signup rejects weak/invalid input', async () => {
    const res = await call(signup, { method: 'POST', body: { name: 'X', country: '', state: '', password: 'short' } });
    assert.equal(res.status, 400);
    assert.ok(!(res.body as Record<string, unknown>).profile);
});

test('signup never exposes the password or its hash', async () => {
    const res = await call(signup, {
        method: 'POST',
        body: { name: 'Privacy Check', country: 'BD', state: 'Sylhet', password: 'privacy-pass-1' },
    });
    assert.equal(res.status, 201);
    const profile = res.body.profile as Record<string, unknown>;
    assert.ok(!('password' in profile) && !('passwordHash' in profile));
    // session token must not be readable by JS (httpOnly cookie)
    assert.match(res.headers['set-cookie'], /HttpOnly/);
});

test('me returns the session user; without session → 401', async () => {
    const ok = await call(me, { cookies: userCookies });
    assert.equal(ok.status, 200);
    const anon = await call(me);
    assert.equal(anon.status, 401);
});

test('login with wrong password → generic 401 (no enumeration)', async () => {
    const res = await call(login, { method: 'POST', body: { identifier: username, password: 'wrong-password-1' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid username or password');
});

test('login with unknown user looks identical to wrong password', async () => {
    const res = await call(login, { method: 'POST', body: { identifier: 'no_such_user_99', password: 'wrong-password-1' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid username or password');
});

test('login by username AND by user number both restore the same account', async () => {
    const byName = await call(login, { method: 'POST', body: { identifier: username, password: NEW_USER.password } });
    const byNumber = await call(login, { method: 'POST', body: { identifier: String(userNumber), password: NEW_USER.password } });
    assert.equal(byName.status, 200);
    assert.equal(byNumber.status, 200);
    assert.equal((byName.body.profile as Record<string, unknown>).id, userId);
    assert.equal((byNumber.body.profile as Record<string, unknown>).id, userId);
});

test('logout invalidates the session', async () => {
    const res = await call(login, { method: 'POST', body: { identifier: username, password: NEW_USER.password } });
    const jar = res.cookies;
    await call(logout, { method: 'POST', cookies: jar });
    const after = await call(me, { cookies: jar });
    assert.equal(after.status, 401);
});

test('repeated wrong passwords trigger temporary lock', async () => {
    for (let i = 0; i < 5; i++) {
        await call(login, { method: 'POST', body: { identifier: 'lockvictim', password: 'wrong-password-1' } });
    }
    const res = await call(login, { method: 'POST', body: { identifier: 'lockvictim', password: 'wrong-password-1' } });
    assert.equal(res.status, 429);
});

// ── Recovery ────────────────────────────────────────────────

test('recovery with a wrong code fails; with the right code resets password', async () => {
    const bad = await call(recover, {
        method: 'POST',
        body: { identifier: username, recoveryCode: 'AAAA-AAAA-AAAA-AAAA', newPassword: 'new-secret-pass-1' },
    });
    assert.equal(bad.status, 401);

    const good = await call(recover, {
        method: 'POST',
        body: { identifier: username, recoveryCode, newPassword: 'new-secret-pass-1' },
    });
    assert.equal(good.status, 200);

    // Old password dead, old sessions dead, new password works — same account.
    const oldPw = await call(login, { method: 'POST', body: { identifier: username, password: NEW_USER.password } });
    assert.equal(oldPw.status, 401);
    const staleSession = await call(me, { cookies: userCookies });
    assert.equal(staleSession.status, 401);
    const newLogin = await call(login, { method: 'POST', body: { identifier: username, password: 'new-secret-pass-1' } });
    assert.equal(newLogin.status, 200);
    assert.equal((newLogin.body.profile as Record<string, unknown>).id, userId); // no duplicate account
    userCookies = newLogin.cookies;
});

// ── Submissions + WhatsApp flow metadata ────────────────────

test('submission requires login; creates pending record once', async () => {
    const anon = await call(submissions, { method: 'POST', body: { taskNumber: '1' } });
    assert.equal(anon.status, 401);

    const first = await call(submissions, { method: 'POST', body: { taskNumber: '1' }, cookies: userCookies });
    assert.equal(first.status, 201);

    const dupe = await call(submissions, { method: 'POST', body: { taskNumber: '1' }, cookies: userCookies });
    assert.equal(dupe.status, 200);
    assert.equal(dupe.body.alreadySubmitted, true);
});

// ── Coin history authorization (IDOR protection) ────────────

test('coin history requires auth and only shows own data', async () => {
    const anon = await call(coinsHistory);
    assert.equal(anon.status, 401);
    const own = await call(coinsHistory, { cookies: userCookies });
    assert.equal(own.status, 200);
    const txns = own.body.transactions as Array<Record<string, unknown>>;
    assert.ok(txns.every(t => t.userId === userId));
});

// ── Admin authorization ─────────────────────────────────────

test('admin endpoints reject missing/wrong code and missing session', async () => {
    const wrong = await call(adminUnlock, { method: 'POST', body: { code: '9999999999' } });
    assert.equal(wrong.status, 401);

    const noSession = await call(adminTasks, {});
    assert.equal(noSession.status, 401);

    // user session is NOT an admin session
    const userSession = await call(adminTasks, { cookies: userCookies });
    assert.equal(userSession.status, 401);
});

test('admin unlock with correct 10-digit code issues an admin session', async () => {
    const res = await call(adminUnlock, { method: 'POST', body: { code: '1234567890' } });
    assert.equal(res.status, 200);
    adminCookies = res.cookies;
    assert.ok(adminCookies.tasky_admin);
});

test('admin can create, edit, and archive a task; public list reflects it', async () => {
    const create = await call(adminTasks, {
        method: 'POST',
        cookies: adminCookies,
        body: {
            taskNumber: 'T-100', title: 'Admin Made Task', imageUrl: '/task-images/task-1.svg',
            rewardCoins: 70, targetUrl: 'https://example.com',
            description: 'Created in a test', whatToDo: 'Do the thing', rules: 'Be honest', status: 'published',
        },
    });
    assert.equal(create.status, 201);

    const dupeCreate = await call(adminTasks, {
        method: 'POST',
        cookies: adminCookies,
        body: {
            taskNumber: 'T-100', title: 'Dupe', imageUrl: '/task-images/task-1.svg',
            rewardCoins: 1, targetUrl: 'https://example.com', description: 'dupe dupe', whatToDo: 'dupe do',
        },
    });
    assert.equal(dupeCreate.status, 409);

    const edit = await call(adminTaskItem, {
        method: 'PATCH', cookies: adminCookies,
        query: { taskNumber: 'T-100' },
        body: { title: 'Admin Made Task (Edited)', rewardCoins: 80 },
    });
    assert.equal(edit.status, 200);
    assert.equal((edit.body.task as Record<string, unknown>).rewardCoins, 80);

    const pub = await call(taskDetail, { query: { taskNumber: 'T-100' } });
    assert.equal((pub.body.task as Record<string, unknown>).title, 'Admin Made Task (Edited)');

    const del = await call(adminTaskItem, { method: 'DELETE', cookies: adminCookies, query: { taskNumber: 'T-100' } });
    assert.equal(del.status, 200);
    const gone = await call(taskDetail, { query: { taskNumber: 'T-100' } });
    assert.equal(gone.status, 404); // archived → hidden from public
});

test('admin task creation rejects dangerous URLs and bad payloads', async () => {
    const jsUrl = await call(adminTasks, {
        method: 'POST', cookies: adminCookies,
        body: {
            taskNumber: 'T-666', title: 'Evil', imageUrl: '/task-images/task-1.svg', rewardCoins: 10,
            targetUrl: 'javascript:alert(1)', description: 'bad bad bad', whatToDo: 'bad bad bad',
        },
    });
    assert.equal(jsUrl.status, 400);
});

// ── Coin operations ─────────────────────────────────────────

test('admin add/deduct/reset coins with idempotency; history preserved', async () => {
    const add = await call(adminCoins, {
        method: 'POST', cookies: adminCookies,
        body: { userId, action: 'add', amount: 100, reason: 'Task Verified', idempotencyKey: 'testkey-add-1' },
    });
    assert.equal(add.status, 200);
    const txn = add.body.transaction as Record<string, unknown>;
    assert.equal(txn.newBalance, 100);

    // Retry with the same key — must NOT double-apply.
    const retry = await call(adminCoins, {
        method: 'POST', cookies: adminCookies,
        body: { userId, action: 'add', amount: 100, reason: 'Task Verified', idempotencyKey: 'testkey-add-1' },
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.applied, false);
    const afterRetry = await call(me, { cookies: userCookies });
    assert.equal((afterRetry.body.profile as Record<string, unknown>).coins, 100);

    const deduct = await call(adminCoins, {
        method: 'POST', cookies: adminCookies,
        body: { userId, action: 'deduct', amount: 30, reason: 'Admin Adjustment', idempotencyKey: 'testkey-ded-1' },
    });
    assert.equal((deduct.body.transaction as Record<string, unknown>).newBalance, 70);

    const over = await call(adminCoins, {
        method: 'POST', cookies: adminCookies,
        body: { userId, action: 'deduct', amount: 9999, reason: 'Too much', idempotencyKey: 'testkey-ded-2' },
    });
    assert.equal(over.status, 400);
    assert.equal(over.body.code, 'INSUFFICIENT_BALANCE');

    const reset = await call(adminCoins, {
        method: 'POST', cookies: adminCookies,
        body: { userId, action: 'reset', reason: 'Admin Reset', idempotencyKey: 'testkey-reset-1' },
    });
    assert.equal((reset.body.transaction as Record<string, unknown>).newBalance, 0);

    // History shows every step: 0→100, 100→70, 70→0
    const history = await call(coinsHistory, { cookies: userCookies });
    const txns = history.body.transactions as Array<Record<string, unknown>>;
    assert.equal(txns.length, 3);
    assert.deepEqual(
        txns.map(t => [t.previousBalance, t.newBalance]),
        [[70, 0], [100, 70], [0, 100]],
    );
});

test('users cannot call admin coin operations with a user session', async () => {
    const res = await call(adminCoins, {
        method: 'POST', cookies: userCookies,
        body: { userId, action: 'add', amount: 1000000, reason: 'hack', idempotencyKey: 'hack-1' },
    });
    assert.equal(res.status, 401);
});

test('users cannot mint coins by replaying admin requests without a session', async () => {
    const res = await call(adminCoins, {
        method: 'POST',
        body: { userId, action: 'add', amount: 1000000, reason: 'hack', idempotencyKey: 'hack-2' },
    });
    assert.equal(res.status, 401);
});

// ── Submission review flow ──────────────────────────────────

test('admin approves submission → coins granted exactly once', async () => {
    const list = await call(adminSubmissions, { cookies: adminCookies });
    const subs = list.body.submissions as Array<Record<string, unknown>>;
    const pending = subs.find(s => s.status === 'pending')!;
    assert.ok(pending);

    const approve = await call(adminSubmissions, {
        method: 'POST', cookies: adminCookies,
        body: { submissionId: pending.id, decision: 'approve' },
    });
    assert.equal(approve.status, 200);

    const reward = approve.body.reward as Record<string, unknown>;
    assert.equal(reward.actionType, 'task_reward');
    assert.equal(reward.amount, 50); // seed task 1 reward

    // Re-approving is a no-op (already reviewed).
    const again = await call(adminSubmissions, {
        method: 'POST', cookies: adminCookies,
        body: { submissionId: pending.id, decision: 'approve' },
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.alreadyReviewed, true);

    const profile = await call(me, { cookies: userCookies });
    assert.equal((profile.body.profile as Record<string, unknown>).coins, 50);
});

// ── Admin user search ───────────────────────────────────────

test('admin user search finds by username, name, and number', async () => {
    const byName = await call(adminUsers, { cookies: adminCookies, query: { query: 'Test User' } });
    assert.ok((byName.body.profiles as unknown[]).length >= 1);
    const byNumber = await call(adminUsers, { cookies: adminCookies, query: { query: String(userNumber) } });
    assert.ok((byNumber.body.profiles as unknown[]).length === 1);
    const anon = await call(adminUsers, { query: { query: 'Test' } });
    assert.equal(anon.status, 401);
});
