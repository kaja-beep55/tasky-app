import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { limitByIp, sendError } from '../../_lib/http.js';

// GET /api/tasks — public list of published tasks
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'tasks-list', 120, 60_000);
        const tasks = await getDb().listPublishedTasks();
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ tasks });
    } catch (err) {
        return sendError(res, err);
    }
}
