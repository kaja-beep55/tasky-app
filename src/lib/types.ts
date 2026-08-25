// Shared frontend types — mirror of api/_lib/db/types.ts

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
    status: 'published' | 'archived';
    createdAt: string;
    updatedAt: string;
}

export interface Profile {
    id: string;
    userNumber: number;
    username: string;
    name: string;
    country: string;
    state: string;
    coins: number;
    status: 'active' | 'suspended';
    createdAt: string;
}

export interface CoinTransaction {
    id: string;
    userId: string;
    actionType: 'task_reward' | 'admin_add' | 'admin_deduct' | 'admin_reset' | 'adjustment';
    amount: number;
    previousBalance: number;
    newBalance: number;
    reason: string;
    adminId: string | null;
    referenceTaskId: string | null;
    idempotencyKey: string;
    createdAt: string;
}

export interface Submission {
    id: string;
    userId: string;
    taskId: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    rejectionReason: string | null;
    user?: { name: string; username: string; userNumber: number } | null;
    task?: { taskNumber: string; title: string; rewardCoins: number } | null;
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
