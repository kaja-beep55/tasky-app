import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { HttpError, limitByIp, parseBody, requireUser, sendError } from './_lib/http';
import { asTaskNumber, ValidationError } from './_lib/validate';

// POST /api/submissions { taskNumber } — register a pending submission
//   when the user taps "Send video on WhatsApp". Metadata only:
//   the video itself never enters Tasky.
// GET  /api/submissions — the logged-in user's own submissions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        if (req.method === 'GET') {
            const { profile } = await requireUser(req);
            const submissions = await getDb().listSubmissionsForUser(profile.id);
            return res.status(200).json({ submissions });
        }

        if (req.method === 'POST') {
            limitByIp(req, 'submit', 30, 60_000);
            const { profile } = await requireUser(req);
            const body = parseBody<Record<string, unknown>>(req);
            const taskNumber = asTaskNumber(body.taskNumber);

            const db = getDb();
            const task = await db.getTaskByNumber(taskNumber);
            if (!task || task.status !== 'published') {
                throw new HttpError(404, 'Task not found', 'NOT_FOUND');
            }

            const submission = await db.createSubmission(profile.id, task.id);
            await db.audit({
                actorUserId: profile.id, actorType: 'user',
                action: submission ? 'submission_created' : 'submission_duplicate_ignored',
                targetType: 'task', targetId: task.id,
                meta: { taskNumber: task.taskNumber },
            });

            return res.status(submission ? 201 : 200).json({
                submission,
                alreadySubmitted: !submission,
            });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
