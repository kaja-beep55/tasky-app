import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../../_lib/db';
import { limitByIp, parseBody, requireAdmin, sendError } from '../../../_lib/http';
import { validateTaskPayload } from '../../../_lib/taskInput';
import { ValidationError } from '../../../_lib/validate';

// GET  /api/admin/tasks        — list every task (any status)
// POST /api/admin/tasks        — create a new task (unique taskNumber)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const admin = await requireAdmin(req);
        const db = getDb();

        if (req.method === 'GET') {
            const tasks = await db.listAllTasks();
            return res.status(200).json({ tasks });
        }

        if (req.method === 'POST') {
            limitByIp(req, 'admin-task-create', 30, 60_000);
            const input = validateTaskPayload(parseBody<Record<string, unknown>>(req));
            const task = await db.createTask(input);
            await db.audit({
                actorUserId: null, actorType: 'admin', action: 'task_created',
                targetType: 'task', targetId: task.id,
                meta: { taskNumber: task.taskNumber, title: task.title },
            });
            return res.status(201).json({ task, adminSession: admin.tokenHash.slice(0, 8) });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        if (err instanceof Error && err.message === 'DUPLICATE_TASK_NUMBER') {
            return res.status(409).json({ error: 'A task with this task number already exists', code: 'DUPLICATE_TASK_NUMBER' });
        }
        return sendError(res, err);
    }
}
