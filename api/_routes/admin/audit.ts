import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { requireAdmin, sendError } from '../../_lib/http.js';

// GET /api/admin/audit — recent audit log entries (admin only)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await requireAdmin(req);
        const logs = await getDb().listAudit(100);
        return res.status(200).json({ logs });
    } catch (err) {
        return sendError(res, err);
    }
}
