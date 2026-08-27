import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db';
import { ADMIN_COOKIE, HttpError, limitByIp, parseBody, sendError, setSessionCookie } from '../../_lib/http';
import { getClientIp } from '../../_lib/rateLimit';
import { assertNotLocked, recordFailure, recordSuccess } from '../../_lib/lockout';
import { generateSessionToken, hashToken, safeEqual } from '../../_lib/security';
import { asString, ValidationError } from '../../_lib/validate';

const ADMIN_SESSION_TTL_SEC = 30 * 60; // 30 minutes

// POST /api/admin/unlock { code }
// The 10-digit admin code is verified SERVER-SIDE only. It is an
// environment secret — never present in source, frontend bundles,
// localStorage, or database rows.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'admin-unlock', 10, 60_000);

        const ip = getClientIp(req.headers);
        const lockKey = `admin-unlock:${ip}`;
        await assertNotLocked(lockKey);

        const expected = process.env.ADMIN_PANEL_CODE;
        if (!expected || !/^\d{10}$/.test(expected)) {
            console.error('[admin] ADMIN_PANEL_CODE is not configured correctly');
            return res.status(503).json({ error: 'Admin panel is not configured', code: 'NOT_CONFIGURED' });
        }

        const body = parseBody<Record<string, unknown>>(req);
        const code = asString(body.code, 'code', { min: 10, max: 10 });
        if (!/^\d{10}$/.test(code)) {
            throw new HttpError(400, 'Admin code must be exactly 10 digits', 'VALIDATION');
        }

        if (!safeEqual(code, expected)) {
            await recordFailure(lockKey);
            await getDb().audit({
                actorUserId: null, actorType: 'system', action: 'admin_unlock_failed',
                targetType: null, targetId: null, meta: null,
            });
            throw new HttpError(401, 'Incorrect admin code', 'BAD_CODE');
        }

        await recordSuccess(lockKey);

        const token = generateSessionToken();
        await getDb().createSession({
            tokenHash: hashToken(token),
            userId: null,
            scope: 'admin',
            expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_SEC * 1000).toISOString(),
            createdAt: new Date().toISOString(),
        });
        setSessionCookie(res, ADMIN_COOKIE, token, ADMIN_SESSION_TTL_SEC);

        await getDb().audit({
            actorUserId: null, actorType: 'admin', action: 'admin_unlocked',
            targetType: null, targetId: null, meta: null,
        });

        // Admin session travels ONLY in the httpOnly cookie.
        return res.status(200).json({ ok: true, expiresInSec: ADMIN_SESSION_TTL_SEC });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
