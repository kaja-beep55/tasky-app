import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db';
import { limitByIp, requireAdmin, sendError } from '../../_lib/http';
import { asString, ValidationError } from '../../_lib/validate';

// GET /api/admin/users?query=…
// Search by user number, user id, username, or name.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await requireAdmin(req);
        limitByIp(req, 'admin-user-search', 60, 60_000);
        const query = asString(req.query.query ?? '', 'query', { max: 64 });
        const profiles = await getDb().searchProfiles(query, 10);
        return res.status(200).json({ profiles });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
