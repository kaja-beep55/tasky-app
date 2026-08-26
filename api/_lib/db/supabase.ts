import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
    AuditLog, CoinTransaction, Database,
    Profile, Submission, SubmissionStatus, Task, TaskStatus,
} from './types';

// ── Supabase driver ───────────────────────────────────────────
// Uses the SECRET key (bypasses RLS) — this driver must only ever
// run inside serverless functions. All authorization decisions
// are made in the API layer BEFORE calling these methods.

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (client) return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase driver selected but SUPABASE_URL / key are not set');
    client = createClient(url, key, { auth: { persistSession: false } });
    return client;
}

function fail(context: string, error: { message: string } | null): never {
    console.error(`[db:supabase] ${context}:`, error?.message);
    throw new Error('DATABASE_ERROR');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(r: any): Task {
    return {
        id: r.id, taskNumber: r.task_number, title: r.title, imageUrl: r.image_url,
        rewardCoins: r.reward_coins, targetUrl: r.target_url, description: r.description,
        whatToDo: r.what_to_do, rules: r.rules, status: r.status as TaskStatus,
        createdAt: r.created_at, updatedAt: r.updated_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfile(r: any): Profile {
    return {
        id: r.id, userNumber: r.user_number, username: r.username, name: r.name,
        country: r.country, state: r.state, coins: r.coins, status: r.status,
        createdAt: r.created_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubmission(r: any): Submission {
    return {
        id: r.id, userId: r.user_id, taskId: r.task_id, status: r.status as SubmissionStatus,
        submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by,
        rejectionReason: r.rejection_reason,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTxn(r: any): CoinTransaction {
    return {
        id: r.id, userId: r.user_id, actionType: r.action_type, amount: r.amount,
        previousBalance: r.previous_balance, newBalance: r.new_balance, reason: r.reason,
        adminId: r.admin_id, referenceTaskId: r.reference_task_id,
        idempotencyKey: r.idempotency_key, createdAt: r.created_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAudit(r: any): AuditLog {
    return {
        id: r.id, actorUserId: r.actor_user_id, actorType: r.actor_type, action: r.action,
        targetType: r.target_type, targetId: r.target_id, meta: r.meta, createdAt: r.created_at,
    };
}

export function createSupabaseDb(): Database {
    const db = () => getClient();

    return {
        async createProfile(input) {
            // user_number is assigned by a DB sequence/trigger (see migration)
            const { data, error } = await db().from('profiles')
                .insert({
                    username: input.username, name: input.name,
                    country: input.country, state: input.state,
                })
                .select().single();
            if (error) {
                if (error.code === '23505') throw new Error('USERNAME_TAKEN');
                fail('createProfile', error);
            }
            return mapProfile(data);
        },

        async getProfile(id) {
            const { data, error } = await db().from('profiles').select('*').eq('id', id).maybeSingle();
            if (error) fail('getProfile', error);
            return data ? mapProfile(data) : null;
        },

        async getProfileByUsername(username) {
            const { data, error } = await db().from('profiles').select('*')
                .ilike('username', username).maybeSingle();
            if (error) fail('getProfileByUsername', error);
            return data ? mapProfile(data) : null;
        },

        async getProfileByUserNumber(userNumber) {
            const { data, error } = await db().from('profiles').select('*')
                .eq('user_number', userNumber).maybeSingle();
            if (error) fail('getProfileByUserNumber', error);
            return data ? mapProfile(data) : null;
        },

        async searchProfiles(query, limit) {
            const q = query.trim();
            if (!q) return [];
            const sb = db();
            const like = `%${q.replace(/[%_,.]/g, '')}%`;
            const numeric = /^\d+$/.test(q) ? parseInt(q, 10) : null;
            let req = sb.from('profiles').select('*');
            req = numeric !== null
                ? req.or(`username.ilike.${like},name.ilike.${like},user_number.eq.${numeric}`)
                : req.or(`username.ilike.${like},name.ilike.${like}`);
            const { data, error } = await req.limit(limit);
            if (error) fail('searchProfiles', error);
            return (data || []).map(mapProfile);
        },

        async nextUserNumber() {
            const { data, error } = await db().rpc('peek_next_user_number');
            if (error) fail('nextUserNumber', error);
            return data as number;
        },

        async setIdentity(identity) {
            const { error } = await db().from('auth_identities').upsert({
                user_id: identity.userId, password_hash: identity.passwordHash,
                updated_at: identity.updatedAt,
            });
            if (error) fail('setIdentity', error);
        },

        async getIdentity(userId) {
            const { data, error } = await db().from('auth_identities').select('*')
                .eq('user_id', userId).maybeSingle();
            if (error) fail('getIdentity', error);
            return data ? {
                userId: data.user_id, passwordHash: data.password_hash,
                createdAt: data.created_at, updatedAt: data.updated_at,
            } : null;
        },

        async setRecovery(record) {
            const { error } = await db().from('account_recovery').upsert({
                user_id: record.userId, code_hash: record.codeHash, created_at: record.createdAt,
            });
            if (error) fail('setRecovery', error);
        },

        async getRecovery(userId) {
            const { data, error } = await db().from('account_recovery').select('*')
                .eq('user_id', userId).maybeSingle();
            if (error) fail('getRecovery', error);
            return data ? { userId: data.user_id, codeHash: data.code_hash, createdAt: data.created_at } : null;
        },

        async createSession(session) {
            const { error } = await db().from('sessions').insert({
                token_hash: session.tokenHash, user_id: session.userId,
                scope: session.scope, expires_at: session.expiresAt,
            });
            if (error) fail('createSession', error);
        },

        async getSession(tokenHash) {
            const { data, error } = await db().from('sessions').select('*')
                .eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString())
                .maybeSingle();
            if (error) fail('getSession', error);
            return data ? {
                tokenHash: data.token_hash, userId: data.user_id, scope: data.scope,
                expiresAt: data.expires_at, createdAt: data.created_at,
            } : null;
        },

        async deleteSession(tokenHash) {
            const { error } = await db().from('sessions').delete().eq('token_hash', tokenHash);
            if (error) fail('deleteSession', error);
        },

        async deleteUserSessions(userId) {
            const { error } = await db().from('sessions').delete().eq('user_id', userId);
            if (error) fail('deleteUserSessions', error);
        },

        async pruneExpiredSessions() {
            const { error } = await db().from('sessions').delete()
                .lt('expires_at', new Date().toISOString());
            if (error) fail('pruneExpiredSessions', error);
        },

        async listPublishedTasks() {
            const { data, error } = await db().from('tasks').select('*')
                .eq('status', 'published').order('task_number');
            if (error) fail('listPublishedTasks', error);
            return (data || []).map(mapTask);
        },

        async listAllTasks() {
            const { data, error } = await db().from('tasks').select('*').order('task_number');
            if (error) fail('listAllTasks', error);
            return (data || []).map(mapTask);
        },

        async getTaskByNumber(taskNumber) {
            const { data, error } = await db().from('tasks').select('*')
                .eq('task_number', taskNumber).maybeSingle();
            if (error) fail('getTaskByNumber', error);
            return data ? mapTask(data) : null;
        },

        async createTask(input) {
            const { data, error } = await db().from('tasks').insert({
                task_number: input.taskNumber, title: input.title, image_url: input.imageUrl,
                reward_coins: input.rewardCoins, target_url: input.targetUrl,
                description: input.description, what_to_do: input.whatToDo,
                rules: input.rules, status: input.status,
            }).select().single();
            if (error) {
                if (error.code === '23505') throw new Error('DUPLICATE_TASK_NUMBER');
                fail('createTask', error);
            }
            return mapTask(data);
        },

        async updateTask(taskNumber, patch) {
            const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (patch.title !== undefined) row.title = patch.title;
            if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
            if (patch.rewardCoins !== undefined) row.reward_coins = patch.rewardCoins;
            if (patch.targetUrl !== undefined) row.target_url = patch.targetUrl;
            if (patch.description !== undefined) row.description = patch.description;
            if (patch.whatToDo !== undefined) row.what_to_do = patch.whatToDo;
            if (patch.rules !== undefined) row.rules = patch.rules;
            if (patch.status !== undefined) row.status = patch.status;
            const { data, error } = await db().from('tasks').update(row)
                .eq('task_number', taskNumber).select().maybeSingle();
            if (error) fail('updateTask', error);
            return data ? mapTask(data) : null;
        },

        async archiveTask(taskNumber) {
            const { data, error } = await db().from('tasks')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('task_number', taskNumber).select().maybeSingle();
            if (error) fail('archiveTask', error);
            return data ? mapTask(data) : null;
        },

        async createSubmission(userId, taskId) {
            const { data, error } = await db().from('task_submissions')
                .insert({ user_id: userId, task_id: taskId }).select().maybeSingle();
            if (error) {
                // Unique violation = already submitted → idempotent no-op
                if (error.code === '23505') return null;
                fail('createSubmission', error);
            }
            return data ? mapSubmission(data) : null;
        },

        async listSubmissionsForUser(userId) {
            const { data, error } = await db().from('task_submissions').select('*')
                .eq('user_id', userId).order('submitted_at', { ascending: false });
            if (error) fail('listSubmissionsForUser', error);
            return (data || []).map(mapSubmission);
        },

        async listAllSubmissions(status) {
            let req = db().from('task_submissions').select('*')
                .order('submitted_at', { ascending: false });
            if (status) req = req.eq('status', status);
            const { data, error } = await req;
            if (error) fail('listAllSubmissions', error);
            return (data || []).map(mapSubmission);
        },

        async reviewSubmission(id, status, reviewedBy, rejectionReason) {
            const { data, error } = await db().from('task_submissions')
                .update({
                    status, reviewed_at: new Date().toISOString(),
                    reviewed_by: reviewedBy, rejection_reason: rejectionReason,
                })
                .eq('id', id).eq('status', 'pending').select().maybeSingle();
            if (error) fail('reviewSubmission', error);
            return data ? mapSubmission(data) : null;
        },

        async applyCoinTransaction(input) {
            // Atomicity + idempotency enforced inside the DB function
            // (unique idempotency_key, row-level lock on the profile).
            const { data, error } = await db().rpc('apply_coin_transaction', {
                p_user_id: input.userId,
                p_action_type: input.actionType,
                p_amount: input.amount,
                p_reason: input.reason,
                p_admin_id: input.adminId,
                p_reference_task_id: input.referenceTaskId,
                p_idempotency_key: input.idempotencyKey,
            });
            if (error) {
                if (error.message.includes('INSUFFICIENT_BALANCE')) throw new Error('INSUFFICIENT_BALANCE');
                if (error.message.includes('USER_NOT_FOUND')) throw new Error('USER_NOT_FOUND');
                fail('applyCoinTransaction', error);
            }
            const row = Array.isArray(data) ? data[0] : data;
            return { created: row.was_created as boolean, txn: mapTxn(row) };
        },

        async listCoinTransactions(userId, limit) {
            const { data, error } = await db().from('coin_transactions').select('*')
                .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
            if (error) fail('listCoinTransactions', error);
            return (data || []).map(mapTxn);
        },

        async listAllCoinTransactions(limit) {
            const { data, error } = await db().from('coin_transactions').select('*')
                .order('created_at', { ascending: false }).limit(limit);
            if (error) fail('listAllCoinTransactions', error);
            return (data || []).map(mapTxn);
        },

        async audit(entry) {
            const { error } = await db().from('audit_logs').insert({
                actor_user_id: entry.actorUserId, actor_type: entry.actorType,
                action: entry.action, target_type: entry.targetType,
                target_id: entry.targetId, meta: entry.meta,
            });
            if (error) console.error('[db:supabase] audit write failed:', error.message);
        },

        async listAudit(limit) {
            const { data, error } = await db().from('audit_logs').select('*')
                .order('created_at', { ascending: false }).limit(limit);
            if (error) fail('listAudit', error);
            return (data || []).map(mapAudit);
        },

        async getSetting(key) {
            const { data, error } = await db().from('app_settings').select('value')
                .eq('key', key).maybeSingle();
            if (error) fail('getSetting', error);
            return data?.value ?? null;
        },

        async setSetting(key, value) {
            const { error } = await db().from('app_settings').upsert({ key, value });
            if (error) fail('setSetting', error);
        },
    };
}
