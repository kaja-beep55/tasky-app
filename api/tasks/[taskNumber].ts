import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { HttpError, limitByIp, sendError } from '../_lib/http';
import { asTaskNumber, ValidationError } from '../_lib/validate';

// GET /api/tasks/:taskNumber — public detail of a published task
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'task-detail', 120, 60_000);
        const taskNumber = asTaskNumber(req.query.taskNumber);
        const task = await getDb().getTaskByNumber(taskNumber);
        if (!task || task.status !== 'published') {
            throw new HttpError(404, 'Task not found', 'NOT_FOUND');
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ task });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
