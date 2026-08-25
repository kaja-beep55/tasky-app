import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
    AuditLog, AuthIdentity, CoinTransaction, Database,
    Profile, RecoveryRecord, Session, Submission, Task,
} from './types';
import { seedTasks } from './seedTasks';

// ── Local JSON-file driver ────────────────────────────────────
// Used for local development and pre-Supabase testing. All
// writes pass through a promise-chain mutex so multi-step
// operations (coin transactions) are atomic within the process.

interface LocalState {
    profiles: Profile[];
    identities: AuthIdentity[];
    recoveries: RecoveryRecord[];
    sessions: Session[];
    tasks: Task[];
    submissions: Submission[];
    coinTransactions: CoinTransaction[];
    auditLogs: AuditLog[];
    settings: Record<string, string>;
    counters: { userNumber: number };
}

// Resolved lazily so tests can point TASKY_LOCAL_DB_PATH at a temp
// file before first use (static imports are hoisted above env setup).
function dbPath(): string {
    return resolve(process.env.TASKY_LOCAL_DB_PATH || '.tasky-local/db.json');
}

function emptyState(): LocalState {
    return {
        profiles: [],
        identities: [],
        recoveries: [],
        sessions: [],
        tasks: [],
        submissions: [],
        coinTransactions: [],
        auditLogs: [],
        settings: {},
        counters: { userNumber: 100000 },
    };
}

let state: LocalState | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function load(): LocalState {
    if (state) return state;
    if (existsSync(dbPath())) {
        try {
            state = { ...emptyState(), ...JSON.parse(readFileSync(dbPath(), 'utf8')) };
        } catch {
            state = emptyState();
        }
    } else {
        state = emptyState();
    }
    if (state.tasks.length === 0) {
        state.tasks = seedTasks();
        persist();
    }
    return state;
}

function persist() {
    if (!state) return;
    mkdirSync(dirname(dbPath()), { recursive: true });
    writeFileSync(dbPath(), JSON.stringify(state, null, 2));
}

// Serialize all mutating operations through one chain.
function withLock<T>(fn: () => T): Promise<T> {
    const result = writeChain.then(fn);
    writeChain = result.catch(() => undefined);
    return result;
}

const now = () => new Date().toISOString();

export function createLocalDb(): Database {
    return {
        async createProfile(input) {
            return withLock(() => {
                const s = load();
                const userNumber = ++s.counters.userNumber;
                const profile: Profile = {
                    id: randomUUID(),
                    userNumber,
                    username: input.username,
                    name: input.name,
                    country: input.country,
                    state: input.state,
                    coins: 0,
                    status: 'active',
                    createdAt: now(),
                };
                s.profiles.push(profile);
                persist();
                return profile;
            });
        },

        async getProfile(id) {
            return load().profiles.find(p => p.id === id) || null;
        },

        async getProfileByUsername(username) {
            return load().profiles.find(p => p.username.toLowerCase() === username.toLowerCase()) || null;
        },

        async getProfileByUserNumber(userNumber) {
            return load().profiles.find(p => p.userNumber === userNumber) || null;
        },

        async searchProfiles(query, limit) {
            const q = query.toLowerCase().trim();
            if (!q) return [];
            const numeric = /^\d+$/.test(q) ? parseInt(q, 10) : null;
            return load().profiles
                .filter(p =>
                    p.username.toLowerCase().includes(q) ||
                    p.name.toLowerCase().includes(q) ||
                    (numeric !== null && p.userNumber === numeric) ||
                    p.id.toLowerCase() === q
                )
                .slice(0, limit);
        },

        async nextUserNumber() {
            return load().counters.userNumber + 1;
        },

        async setIdentity(identity) {
            return withLock(() => {
                const s = load();
                s.identities = s.identities.filter(i => i.userId !== identity.userId);
                s.identities.push(identity);
                persist();
            });
        },

        async getIdentity(userId) {
            return load().identities.find(i => i.userId === userId) || null;
        },

        async setRecovery(record) {
            return withLock(() => {
                const s = load();
                s.recoveries = s.recoveries.filter(r => r.userId !== record.userId);
                s.recoveries.push(record);
                persist();
            });
        },

        async getRecovery(userId) {
            return load().recoveries.find(r => r.userId === userId) || null;
        },

        async createSession(session) {
            return withLock(() => {
                load().sessions.push(session);
                persist();
            });
        },

        async getSession(tokenHash) {
            const session = load().sessions.find(s => s.tokenHash === tokenHash) || null;
            if (session && new Date(session.expiresAt).getTime() <= Date.now()) return null;
            return session;
        },

        async deleteSession(tokenHash) {
            return withLock(() => {
                const s = load();
                s.sessions = s.sessions.filter(x => x.tokenHash !== tokenHash);
                persist();
            });
        },

        async deleteUserSessions(userId) {
            return withLock(() => {
                const s = load();
                s.sessions = s.sessions.filter(x => x.userId !== userId);
                persist();
            });
        },

        async pruneExpiredSessions() {
            return withLock(() => {
                const s = load();
                const cutoff = Date.now();
                s.sessions = s.sessions.filter(x => new Date(x.expiresAt).getTime() > cutoff);
                persist();
            });
        },

        async listPublishedTasks() {
            return load().tasks
                .filter(t => t.status === 'published')
                .sort((a, b) => a.taskNumber.localeCompare(b.taskNumber, undefined, { numeric: true }));
        },

        async listAllTasks() {
            return load().tasks
                .slice()
                .sort((a, b) => a.taskNumber.localeCompare(b.taskNumber, undefined, { numeric: true }));
        },

        async getTaskByNumber(taskNumber) {
            return load().tasks.find(t => t.taskNumber === taskNumber) || null;
        },

        async createTask(input) {
            return withLock(() => {
                const s = load();
                if (s.tasks.some(t => t.taskNumber === input.taskNumber)) {
                    throw new Error('DUPLICATE_TASK_NUMBER');
                }
                const task: Task = { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() };
                s.tasks.push(task);
                persist();
                return task;
            });
        },

        async updateTask(taskNumber, patch) {
            return withLock(() => {
                const s = load();
                const task = s.tasks.find(t => t.taskNumber === taskNumber);
                if (!task) return null;
                Object.assign(task, patch, { updatedAt: now() });
                persist();
                return task;
            });
        },

        async archiveTask(taskNumber) {
            return withLock(() => {
                const s = load();
                const task = s.tasks.find(t => t.taskNumber === taskNumber);
                if (!task) return null;
                task.status = 'archived';
                task.updatedAt = now();
                persist();
                return task;
            });
        },

        async createSubmission(userId, taskId) {
            return withLock(() => {
                const s = load();
                if (s.submissions.some(x => x.userId === userId && x.taskId === taskId)) return null;
                const submission: Submission = {
                    id: randomUUID(),
                    userId,
                    taskId,
                    status: 'pending',
                    submittedAt: now(),
                    reviewedAt: null,
                    reviewedBy: null,
                    rejectionReason: null,
                };
                s.submissions.push(submission);
                persist();
                return submission;
            });
        },

        async listSubmissionsForUser(userId) {
            return load().submissions
                .filter(s => s.userId === userId)
                .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        },

        async listAllSubmissions(status) {
            const s = load();
            return s.submissions
                .filter(x => !status || x.status === status)
                .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        },

        async reviewSubmission(id, status, reviewedBy, rejectionReason) {
            return withLock(() => {
                const s = load();
                const sub = s.submissions.find(x => x.id === id);
                if (!sub) return null;
                if (sub.status !== 'pending') return sub; // already reviewed — idempotent
                sub.status = status;
                sub.reviewedAt = now();
                sub.reviewedBy = reviewedBy;
                sub.rejectionReason = rejectionReason;
                persist();
                return sub;
            });
        },

        async applyCoinTransaction(input) {
            return withLock(() => {
                const s = load();
                // Idempotency: a retried request with the same key returns the original record.
                const existing = s.coinTransactions.find(t => t.idempotencyKey === input.idempotencyKey);
                if (existing) return { created: false, txn: existing };

                const profile = s.profiles.find(p => p.id === input.userId);
                if (!profile) throw new Error('USER_NOT_FOUND');

                const previousBalance = profile.coins;
                let newBalance: number;
                let amount = input.amount;

                if (input.actionType === 'admin_reset') {
                    newBalance = 0;
                    amount = -previousBalance;
                } else {
                    newBalance = previousBalance + amount;
                }
                if (newBalance < 0) throw new Error('INSUFFICIENT_BALANCE');

                profile.coins = newBalance;

                const txn: CoinTransaction = {
                    id: randomUUID(),
                    userId: input.userId,
                    actionType: input.actionType,
                    amount,
                    previousBalance,
                    newBalance,
                    reason: input.reason,
                    adminId: input.adminId,
                    referenceTaskId: input.referenceTaskId,
                    idempotencyKey: input.idempotencyKey,
                    createdAt: now(),
                };
                s.coinTransactions.push(txn);
                persist();
                return { created: true, txn };
            });
        },

        async listCoinTransactions(userId, limit) {
            return load().coinTransactions
                .filter(t => t.userId === userId)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, limit);
        },

        async listAllCoinTransactions(limit) {
            return load().coinTransactions
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, limit);
        },

        async audit(entry) {
            return withLock(() => {
                load().auditLogs.push({ ...entry, id: randomUUID(), createdAt: now() });
                persist();
            });
        },

        async listAudit(limit) {
            return load().auditLogs
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, limit);
        },

        async getSetting(key) {
            return load().settings[key] ?? null;
        },

        async setSetting(key, value) {
            return withLock(() => {
                load().settings[key] = value;
                persist();
            });
        },
    };
}
