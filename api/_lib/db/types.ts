// ── Tasky data model ─────────────────────────────────────────
// These types are the contract between API routes and the data
// access layer (local file driver today, Supabase driver after
// the credential checkpoint).

export type TaskStatus = 'published' | 'archived';

export interface Task {
    id: string;
    taskNumber: string;
    title: string;
    imageUrl: string;
    rewardCoins: number;
    targetUrl: string;
    description: string;
    whatToDo: string;
    rules: string;
    status: TaskStatus;
    createdAt: string;
    updatedAt: string;
}

export type ProfileStatus = 'active' | 'suspended';

export interface Profile {
    id: string;
    userNumber: number;
    username: string;
    name: string;
    country: string;
    state: string;
    coins: number;
    status: ProfileStatus;
    createdAt: string;
}

// Password credentials live ONLY here — never in `profiles`,
// never in plaintext. scrypt(PW,salt) digest + per-user salt.
export interface AuthIdentity {
    userId: string;
    passwordHash: string;   // format: scrypt$N$r$p$saltB64$hashB64
    createdAt: string;
    updatedAt: string;
}

// Recovery codes stored as a keyed hash — never plaintext.
export interface RecoveryRecord {
    userId: string;
    codeHash: string;       // sha256(code + pepper)
    createdAt: string;
}

export interface Session {
    tokenHash: string;      // sha256(opaque token)
    userId: string | null;  // null for admin-scope sessions
    scope: 'user' | 'admin';
    expiresAt: string;
    createdAt: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface Submission {
    id: string;
    userId: string;
    taskId: string;
    status: SubmissionStatus;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    rejectionReason: string | null;
}

export type CoinActionType =
    | 'task_reward'
    | 'admin_add'
    | 'admin_deduct'
    | 'admin_reset'
    | 'adjustment';

export interface CoinTransaction {
    id: string;
    userId: string;
    actionType: CoinActionType;
    amount: number;              // signed for add/deduct; absolute for reset entries
    previousBalance: number;
    newBalance: number;
    reason: string;
    adminId: string | null;
    referenceTaskId: string | null;
    idempotencyKey: string;
    createdAt: string;
}

export interface AuditLog {
    id: string;
    actorUserId: string | null;
    actorType: 'user' | 'admin' | 'system';
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: Record<string, unknown> | null;
    createdAt: string;
}

export interface CoinTxnInput {
    userId: string;
    actionType: CoinActionType;
    amount: number;         // for admin_reset this is ignored; driver computes
    reason: string;
    adminId: string | null;
    referenceTaskId: string | null;
    idempotencyKey: string;
}

export interface Database {
    // profiles
    createProfile(input: { name: string; country: string; state: string; username: string }): Promise<Profile>;
    getProfile(id: string): Promise<Profile | null>;
    getProfileByUsername(username: string): Promise<Profile | null>;
    getProfileByUserNumber(userNumber: number): Promise<Profile | null>;
    searchProfiles(query: string, limit: number): Promise<Profile[]>;
    nextUserNumber(): Promise<number>;

    // auth identities (server-only)
    setIdentity(identity: AuthIdentity): Promise<void>;
    getIdentity(userId: string): Promise<AuthIdentity | null>;

    // recovery (server-only)
    setRecovery(record: RecoveryRecord): Promise<void>;
    getRecovery(userId: string): Promise<RecoveryRecord | null>;

    // sessions
    createSession(session: Session): Promise<void>;
    getSession(tokenHash: string): Promise<Session | null>;
    deleteSession(tokenHash: string): Promise<void>;
    deleteUserSessions(userId: string): Promise<void>;
    pruneExpiredSessions(): Promise<void>;

    // tasks
    listPublishedTasks(): Promise<Task[]>;
    listAllTasks(): Promise<Task[]>;
    getTaskByNumber(taskNumber: string): Promise<Task | null>;
    createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
    updateTask(taskNumber: string, patch: Partial<Omit<Task, 'id' | 'taskNumber' | 'createdAt' | 'updatedAt'>>): Promise<Task | null>;
    archiveTask(taskNumber: string): Promise<Task | null>;

    // submissions
    createSubmission(userId: string, taskId: string): Promise<Submission | null>; // null if already exists
    listSubmissionsForUser(userId: string): Promise<Submission[]>;
    listAllSubmissions(status?: SubmissionStatus): Promise<Submission[]>;
    reviewSubmission(id: string, status: 'approved' | 'rejected', reviewedBy: string | null, rejectionReason: string | null): Promise<Submission | null>;

    // coins — atomic, append-only
    applyCoinTransaction(input: CoinTxnInput): Promise<{ created: boolean; txn: CoinTransaction }>;
    listCoinTransactions(userId: string, limit: number): Promise<CoinTransaction[]>;
    listAllCoinTransactions(limit: number): Promise<CoinTransaction[]>;

    // audit
    audit(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void>;
    listAudit(limit: number): Promise<AuditLog[]>;

    // settings KV (used for lockout counters, feature config)
    getSetting(key: string): Promise<string | null>;
    setSetting(key: string, value: string): Promise<void>;
}
