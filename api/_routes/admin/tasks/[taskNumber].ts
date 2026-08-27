import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../../_lib/db/index.js';
import { HttpError, limitByIp, parseBody, requireAdmin, sendError } from '../../../_lib/http.js';
import { validateTaskPatch } from '../../../_lib/taskInput.js';
import { asTaskNumber, ValidationError } from '../../../_lib/validate.js';

// PATCH  /api/admin/tasks/:taskNumber — edit a task
// DELETE /api/admin/tasks/:taskNumber — archive a task (soft delete;
//   historical submissions and coin transactions keep their references)
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await requireAdmin(req);
        const db = getDb();
        const taskNumber = asTaskNumber(req.query.taskNumber);

        if (req.method === 'PATCH') {
            limitByIp(req, 'admin-task-edit', 60, 60_000);
            const patch = validateTaskPatch(parseBody<Record<string, unknown>>(req));
            const task = await db.updateTask(taskNumber, patch);
            if (!task) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
            await db.audit({
                actorUserId: null, actorType: 'admin', action: 'task_updated',
                targetType: 'task', targetId: task.id,
                meta: { taskNumber, fields: Object.keys(patch) },
            });
            return res.status(200).json({ task });
        }

        if (req.method === 'DELETE') {
            limitByIp(req, 'admin-task-delete', 30, 60_000);
            const task = await db.archiveTask(taskNumber);
            if (!task) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
            await db.audit({
                actorUserId: null, actorType: 'admin', action: 'task_archived',
                targetType: 'task', targetId: task.id,
                meta: { taskNumber },
            });
            return res.status(200).json({ task });
        }

        res.setHeader('Allow', 'PATCH, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
