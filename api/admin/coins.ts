import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import type { CoinActionType } from '../_lib/db/types';
import { HttpError, limitByIp, parseBody, requireAdmin, sendError } from '../_lib/http';
import { asEnum, asIdempotencyKey, asInt, asString, ValidationError } from '../_lib/validate';

const ACTIONS = ['add', 'deduct', 'reset'] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_TO_TXN: Record<Action, CoinActionType> = {
    add: 'admin_add',
    deduct: 'admin_deduct',
    reset: 'admin_reset',
};

// POST /api/admin/coins { userId, action, amount?, reason, idempotencyKey }
// The ONLY way balances change outside approved task rewards.
// Every change is an append-only transaction with a stable
// idempotency key, so retries never double-apply.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await requireAdmin(req);
        limitByIp(req, 'admin-coins', 60, 60_000);

        const body = parseBody<Record<string, unknown>>(req);
        const userId = asString(body.userId, 'userId', { min: 8, max: 64 });
        const action = asEnum<Action>(body.action, 'action', ACTIONS);
        const reason = asString(body.reason, 'reason', { min: 2, max: 300 });
        const idempotencyKey = asIdempotencyKey(body.idempotencyKey);

        let amount = 0;
        if (action === 'add' || action === 'deduct') {
            amount = asInt(body.amount, 'amount', { min: 1, max: 1_000_000 });
            if (action === 'deduct') amount = -amount;
        }

        const db = getDb();
        const profile = await db.getProfile(userId);
        if (!profile) throw new HttpError(404, 'User not found', 'NOT_FOUND');

        const { created, txn } = await db.applyCoinTransaction({
            userId,
            actionType: ACTION_TO_TXN[action],
            amount,
            reason,
            adminId: null,
            referenceTaskId: null,
            idempotencyKey,
        });

        await db.audit({
            actorUserId: null, actorType: 'admin', action: `coins_${action}`,
            targetType: 'profile', targetId: userId,
            meta: { amount: txn.amount, newBalance: txn.newBalance, reason, idempotencyKey, applied: created },
        });

        return res.status(200).json({ transaction: txn, applied: created });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ error: 'User does not have enough coins to deduct that amount', code: 'INSUFFICIENT_BALANCE' });
        }
        return sendError(res, err);
    }
}
