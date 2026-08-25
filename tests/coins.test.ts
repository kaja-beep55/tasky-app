import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TASKY_LOCAL_DB_PATH = join(mkdtempSync(join(tmpdir(), 'tasky-coins-')), 'db.json');

import { getDb, _resetDbForTests } from '../api/_lib/db';
import type { Database } from '../api/_lib/db/types';

let db: Database;
let userId: string;

before(async () => {
    _resetDbForTests();
    db = getDb();
    const profile = await db.createProfile({ name: 'Coin Tester', country: 'BD', state: 'Dhaka', username: 'cointester1' });
    userId = profile.id;
});

test('add coins appends a transaction and updates balance', async () => {
    const { created, txn } = await db.applyCoinTransaction({
        userId, actionType: 'admin_add', amount: 50, reason: 'Task Verified',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-add-1',
    });
    assert.ok(created);
    assert.equal(txn.previousBalance, 0);
    assert.equal(txn.newBalance, 50);
    const profile = await db.getProfile(userId);
    assert.equal(profile?.coins, 50);
});

test('idempotency: same key never applies twice', async () => {
    const first = await db.applyCoinTransaction({
        userId, actionType: 'admin_add', amount: 50, reason: 'Task Verified',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-dup',
    });
    const second = await db.applyCoinTransaction({
        userId, actionType: 'admin_add', amount: 50, reason: 'Task Verified',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-dup',
    });
    assert.ok(first.created);
    assert.ok(!second.created);
    assert.equal(second.txn.id, first.txn.id);
    const profile = await db.getProfile(userId);
    assert.equal(profile?.coins, 100); // 50 (prev test) + 50 (once, not twice)
});

test('deduct coins reduces balance, recorded with negative amount', async () => {
    const { txn } = await db.applyCoinTransaction({
        userId, actionType: 'admin_deduct', amount: -20, reason: 'Admin Adjustment',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-ded-1',
    });
    assert.equal(txn.newBalance, 80);
    assert.equal(txn.amount, -20);
});

test('deducting more than the balance is rejected atomically', async () => {
    await assert.rejects(() => db.applyCoinTransaction({
        userId, actionType: 'admin_deduct', amount: -9999, reason: 'Too much',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-ded-over',
    }), /INSUFFICIENT_BALANCE/);
    const profile = await db.getProfile(userId);
    assert.equal(profile?.coins, 80); // unchanged
});

test('reset zeroes the balance but preserves history', async () => {
    const { txn } = await db.applyCoinTransaction({
        userId, actionType: 'admin_reset', amount: 0, reason: 'Admin Reset',
        adminId: null, referenceTaskId: null, idempotencyKey: 'k-reset-1',
    });
    assert.equal(txn.newBalance, 0);
    assert.equal(txn.previousBalance, 80);
    const history = await db.listCoinTransactions(userId, 50);
    assert.equal(history.length, 4); // add, add(dup not added), deduct, reset
});

test('coin history is per-user (no cross-user leakage)', async () => {
    const other = await db.createProfile({ name: 'Other', country: 'IN', state: 'Goa', username: 'otheruser1' });
    const mine = await db.listCoinTransactions(userId, 50);
    const theirs = await db.listCoinTransactions(other.id, 50);
    assert.equal(theirs.length, 0);
    assert.ok(mine.every(t => t.userId === userId));
});

test('task_reward action is recorded like any other transaction', async () => {
    const { txn } = await db.applyCoinTransaction({
        userId, actionType: 'task_reward', amount: 50, reason: 'Task 1 verified',
        adminId: null, referenceTaskId: 'seed-task-1', idempotencyKey: 'submission-reward:abc',
    });
    assert.equal(txn.actionType, 'task_reward');
    assert.equal(txn.referenceTaskId, 'seed-task-1');
});
