import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
    AuditLog, CoinTransaction, Database,
    Profile, Submission, SubmissionStatus, Task, TaskStatus,
} from './types.js';

// ── Supabase driver ───────────────────────────────────────────
// Prefers the SECRET key (bypasses RLS); falls back to the
// publishable key in development. Either way this driver must only
// ever run inside server-side functions — keys never reach the
// frontend bundle. All authorization decisions are made in the API
// layer BEFORE calling these methods.

let client: SupabaseClient | null = null;

// Per-request session hash, set by the API layer (http.ts) so RLS
// policies / definer functions (migration 0009) can authorize
// operations performed with the publishable key.
// Global fallback registry — in bundled serverless code the same
// module can be instantiated twice under different specifiers, so a
// plain module-level variable is not reliable.
const REG = globalThis as unknown as { __taskySessionHash?: string | null };
let requestSessionTokenHash: string | null = null;
export function setRequestSessionTokenHash(hash: string | null): void {
    requestSessionTokenHash = hash;
    REG.__taskySessionHash = hash;
}
function currentSessionHash(): string | null {
    return requestSessionTokenHash ?? REG.__taskySessionHash ?? null;
}

function getClient(): SupabaseClient {
    if (client) return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase driver selected but SUPABASE_URL / key are not set');
    client = createClient(url, key, { auth: { persistSession: false } });
    return client;
}

// Client carrying the per-request session header. Cached per hash.
const authedClients = new Map<string, SupabaseClient>();
function dbAuthed(): SupabaseClient {
    const h = currentSessionHash();
    if (!h) return getClient();
    const cached = authedClients.get(h);
    if (cached) return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase driver selected but SUPABASE_URL / key are not set');
    const c = createClient(url, key, {
        auth: { persistSession: false },
        global: { headers: { 'x-tasky-session': h } },
    });
    authedClients.set(h, c);
    return c;
}

// True when an error means "no direct table access with this key" and
// the operation should go through the definer functions (0009).
function needsRpc(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42501'
        || /permission denied|row-level security/i.test(error.message || '');
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
        country: r.country, state: r.state, coins: r.coin_balance, status: r.status,
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
    const db = () => dbAuthed();

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

        // Full signup in one atomic call (publishable-key mode; see 0009).
        async signupComplete(input) {
            const { data, error } = await db().rpc('tasky_signup', {
                p_username: input.username, p_name: input.name,
                p_country: input.country, p_state: input.state,
                p_password_hash: input.passwordHash, p_recovery_hash: input.recoveryHash,
            });
            if (error) {
                if (error.code === '23505') throw new Error('USERNAME_TAKEN');
                fail('signupComplete', error);
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
            const { data, error } = await db().rpc('tasky_peek_user_number');
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
            // With the publishable key the password hash is never
            // selectable; login verification goes through verifyLogin
            // (tasky_login_lookup). With the secret key the direct
            // read still works.
            const { data, error } = await db().from('auth_identities').select('*')
                .eq('user_id', userId).maybeSingle();
            if (error) {
                if (needsRpc(error)) return null;
                fail('getIdentity', error);
            }
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
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_create_session', {
                        p_token_hash: session.tokenHash, p_user_id: session.userId,
                        p_scope: session.scope, p_expires_at: session.expiresAt,
                    });
                    if (r.error) fail('createSession', r.error);
                    return;
                }
                fail('createSession', error);
            }
        },

        async getSession(tokenHash) {
            const { data, error } = await db().from('sessions').select('*')
                .eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString())
                .maybeSingle();
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_get_session', { p_token_hash: tokenHash });
                    if (r.error) fail('getSession', r.error);
                    const row = Array.isArray(r.data) ? r.data[0] : r.data;
                    return row ? {
                        tokenHash: row.token_hash, userId: row.user_id, scope: row.scope,
                        expiresAt: row.expires_at, createdAt: row.created_at,
                    } : null;
                }
                fail('getSession', error);
            }
            return data ? {
                tokenHash: data.token_hash, userId: data.user_id, scope: data.scope,
                expiresAt: data.expires_at, createdAt: data.created_at,
            } : null;
        },

        async deleteSession(tokenHash) {
            const { error } = await db().from('sessions').delete().eq('token_hash', tokenHash);
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_delete_session', { p_token_hash: tokenHash });
                    if (r.error) fail('deleteSession', r.error);
                    return;
                }
                fail('deleteSession', error);
            }
        },

        async deleteUserSessions(userId) {
            const { error } = await db().from('sessions').delete().eq('user_id', userId);
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_delete_user_sessions', { p_user_id: userId });
                    if (r.error) fail('deleteUserSessions', r.error);
                    return;
                }
                fail('deleteUserSessions', error);
            }
        },

        // ── publishable-key helpers (migration 0009) ────────────
        // With the publishable key password/recovery hashes are never
        // selectable; verification happens against tasky_login_lookup /
        // tasky_reset_password inside the database.
        async verifyLogin(identifier, password) {
            const { data, error } = await db().rpc('tasky_login_lookup', { p_identifier: identifier });
            if (error) fail('verifyLogin', error);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return null;
            const { verifyPassword } = await import('../security.js');
            if (!verifyPassword(password, row.password_hash)) return null;
            if (row.status !== 'active') throw new Error('SUSPENDED');
            const profile = await this.getProfile(row.user_id);
            return profile ? { profile } : null;
        },

        async recoverWithCode(userId, codeHash, newPasswordHash) {
            const { data, error } = await db().rpc('tasky_reset_password', {
                p_user_id: userId, p_code_hash: codeHash, p_new_password_hash: newPasswordHash,
            });
            if (error) fail('recoverWithCode', error);
            return data === true;
        },

        async pruneExpiredSessions() {
            const { error } = await db().from('sessions').delete()
                .lt('expires_at', new Date().toISOString());
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_prune_sessions');
                    if (r.error) fail('pruneExpiredSessions', r.error);
                    return;
                }
                fail('pruneExpiredSessions', error);
            }
        },

        async listPublishedTasks() {
            const { data, error } = await db().from('tasks').select('*')
                .eq('status', 'published').order('task_number');
            if (error) fail('listPublishedTasks', error);
            // RLS quirk: direct PostgREST SELECT can silently return zero
            // rows with the publishable key; fall back to the definer fn.
            if (!error && (data || []).length === 0) {
                const r = await db().rpc('tasky_tasks_list_published');
                if (!r.error && Array.isArray(r.data) && r.data.length > 0) {
                    return r.data.map(mapTask);
                }
            }
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
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_create_task', {
                        p_task_number: input.taskNumber, p_title: input.title,
                        p_image_url: input.imageUrl, p_target_url: input.targetUrl,
                        p_description: input.description, p_what_to_do: input.whatToDo,
                        p_rules: input.rules, p_reward_coins: input.rewardCoins,
                        p_status: input.status,
                    });
                    if (r.error) {
                        if (r.error.code === '23505') throw new Error('DUPLICATE_TASK_NUMBER');
                        fail('createTask', r.error);
                    }
                    return mapTask(r.data);
                }
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
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_update_task', {
                        p_task_number: taskNumber,
                        p_title: patch.title, p_image_url: patch.imageUrl,
                        p_target_url: patch.targetUrl, p_description: patch.description,
                        p_what_to_do: patch.whatToDo, p_rules: patch.rules,
                        p_reward_coins: patch.rewardCoins, p_status: patch.status,
                    });
                    if (r.error) fail('updateTask', r.error);
                    return r.data ? mapTask(r.data) : null;
                }
                fail('updateTask', error);
            }
            return data ? mapTask(data) : null;
        },

        async archiveTask(taskNumber) {
            const { data, error } = await db().from('tasks')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('task_number', taskNumber).select().maybeSingle();
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_archive_task', { p_task_number: taskNumber });
                    if (r.error) fail('archiveTask', r.error);
                    return r.data ? mapTask(r.data) : null;
                }
                fail('archiveTask', error);
            }
            return data ? mapTask(data) : null;
        },

        async createSubmission(userId, taskId) {
            const { data, error } = await db().from('task_submissions')
                .insert({ user_id: userId, task_id: taskId }).select().maybeSingle();
            if (error) {
                // Unique violation = already submitted → idempotent no-op
                if (error.code === '23505') return null;
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_create_submission', { p_user_id: userId, p_task_id: taskId });
                    if (r.error) fail('createSubmission', r.error);
                    return r.data ? mapSubmission(r.data) : null;
                }
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
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_review_submission', {
                        p_submission_id: id, p_status: status,
                        p_reviewed_by: reviewedBy, p_rejection_reason: rejectionReason,
                    });
                    if (r.error) fail('reviewSubmission', r.error);
                    return r.data ? mapSubmission(r.data) : null;
                }
                fail('reviewSubmission', error);
            }
            return data ? mapSubmission(data) : null;
        },

        async applyCoinTransaction(input) {
            // Atomicity + idempotency enforced inside the DB function
            // (unique idempotency_key, row-level lock on the profile).
            // The live DB function (0001) applies the sign itself for
            // admin_deduct, so always send a positive amount.
            const amount = input.actionType === 'admin_deduct' ? Math.abs(input.amount) : input.amount;
            const { data, error } = await db().rpc('apply_coin_transaction', {
                p_user_id: input.userId,
                p_action_type: input.actionType,
                p_amount: amount,
                p_reason: input.reason,
                p_admin_id: input.adminId,
                p_task_id: input.referenceTaskId,
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
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .order('seq', { ascending: false })
                .limit(limit);
            if (error) fail('listCoinTransactions', error);
            return (data || []).map(mapTxn);
        },

        async listAllCoinTransactions(limit) {
            const { data, error } = await db().from('coin_transactions').select('*')
                .order('created_at', { ascending: false })
                .order('seq', { ascending: false })
                .limit(limit);
            if (error) fail('listAllCoinTransactions', error);
            return (data || []).map(mapTxn);
        },

        async audit(entry) {
            const { error } = await db().from('audit_logs').insert({
                actor_user_id: entry.actorUserId, actor_type: entry.actorType,
                action: entry.action, target_type: entry.targetType,
                target_id: entry.targetId, meta: entry.meta,
            });
            if (error) {
                const r = await db().rpc('tasky_audit', {
                    p_actor_user_id: entry.actorUserId, p_actor_type: entry.actorType,
                    p_action: entry.action, p_target_type: entry.targetType,
                    p_target_id: entry.targetId, p_meta: entry.meta,
                });
                if (r.error) console.error('[db:supabase] audit write failed:', r.error.message);
            }
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
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_get_setting', { p_key: key });
                    if (r.error) fail('getSetting', r.error);
                    return r.data ?? null;
                }
                fail('getSetting', error);
            }
            return data?.value ?? null;
        },

        async setSetting(key, value) {
            const { error } = await db().from('app_settings').upsert({ key, value });
            if (error) {
                if (needsRpc(error)) {
                    const r = await db().rpc('tasky_set_setting', { p_key: key, p_value: value });
                    if (r.error) fail('setSetting', r.error);
                    return;
                }
                fail('setSetting', error);
            }
        },
    };
}
