import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { HttpError, limitByIp, parseBody, sendError } from '../../_lib/http.js';
import { assertNotLocked, recordFailure, recordSuccess } from '../../_lib/lockout.js';
import { hashPassword, hashRecoveryCode, safeEqual } from '../../_lib/security.js';
import { asLoginIdentifier, asPassword, asString, ValidationError } from '../../_lib/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'recover', 10, 10 * 60_000);

        const body = parseBody<Record<string, unknown>>(req);
        const identifier = asLoginIdentifier(body.identifier);
        const recoveryCode = asString(body.recoveryCode, 'recoveryCode', { min: 8, max: 32 });
        const newPassword = asPassword(body.newPassword);

        const lockKey = `recover:${identifier}`;
        await assertNotLocked(lockKey);

        const db = getDb();
        const profile = /^\d+$/.test(identifier)
            ? (await db.getProfileByUserNumber(parseInt(identifier, 10))) || (await db.getProfileByUsername(identifier))
            : await db.getProfileByUsername(identifier);

        // Publishable-key mode: the recovery code hash is never
        // selectable; verify + rotate password inside the database.
        if ('recoverWithCode' in db && typeof (db as { recoverWithCode?: unknown }).recoverWithCode === 'function') {
            const presentedHash = hashRecoveryCode(recoveryCode);
            const okRpc = profile
                ? await (db as unknown as { recoverWithCode(u: string, c: string, p: string): Promise<boolean> })
                    .recoverWithCode(profile.id, presentedHash, hashPassword(newPassword))
                : false;
            if (!profile || !okRpc) {
                await recordFailure(lockKey);
                await db.audit({
                    actorUserId: profile?.id ?? null, actorType: 'system', action: 'recovery_failed',
                    targetType: 'profile', targetId: profile?.id ?? null, meta: null,
                });
                throw new HttpError(401, 'Invalid recovery details', 'BAD_RECOVERY');
            }
            await recordSuccess(lockKey);
            await db.audit({
                actorUserId: profile.id, actorType: 'user', action: 'recovery_success',
                targetType: 'profile', targetId: profile.id, meta: null,
            });
            return res.status(200).json({ ok: true });
        }

        const recovery = profile ? await db.getRecovery(profile.id) : null;

        const presented = hashRecoveryCode(recoveryCode);
        const ok = recovery ? safeEqual(presented, recovery.codeHash) : false;

        if (!profile || !recovery || !ok) {
            await recordFailure(lockKey);
            await db.audit({
                actorUserId: profile?.id ?? null, actorType: 'system', action: 'recovery_failed',
                targetType: 'profile', targetId: profile?.id ?? null, meta: null,
            });
            throw new HttpError(401, 'Invalid recovery details', 'BAD_RECOVERY');
        }

        await recordSuccess(lockKey);

        await db.setIdentity({
            userId: profile.id,
            passwordHash: hashPassword(newPassword),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // Kill every existing session — recovery must never leave old tokens alive.
        await db.deleteUserSessions(profile.id);

        await db.audit({
            actorUserId: profile.id, actorType: 'user', action: 'recovery_success',
            targetType: 'profile', targetId: profile.id, meta: null,
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
