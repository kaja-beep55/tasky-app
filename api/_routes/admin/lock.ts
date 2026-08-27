import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { ADMIN_COOKIE, assertSameOrigin, clearSessionCookie, getSession, sendError } from '../../_lib/http.js';

// POST /api/admin/lock — end the admin session (panel "lock/exit")
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        assertSameOrigin(req);
        const session = await getSession(req, ADMIN_COOKIE);
        if (session) {
            await getDb().deleteSession(session.tokenHash);
        }
        clearSessionCookie(res, ADMIN_COOKIE);
        return res.status(200).json({ ok: true });
    } catch (err) {
        return sendError(res, err);
    }
}
