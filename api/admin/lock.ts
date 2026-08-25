import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { ADMIN_COOKIE, clearSessionCookie, getSession, sendError } from '../_lib/http';

// POST /api/admin/lock — end the admin session (panel "lock/exit")
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
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
