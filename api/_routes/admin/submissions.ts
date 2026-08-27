import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { HttpError, limitByIp, parseBody, requireAdmin, sendError } from '../../_lib/http.js';
import { asEnum, asOptionalString, asString, ValidationError } from '../../_lib/validate.js';

// GET  /api/admin/submissions?status=pending — list submissions (enriched)
// POST /api/admin/submissions { submissionId, decision, rejectionReason? }
//   approve → grants the task's reward coins EXACTLY ONCE via a stable
//   idempotency key derived from the submission id.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await requireAdmin(req);
        const db = getDb();

        if (req.method === 'GET') {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined;
            const validStatus = status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined;
            const submissions = await db.listAllSubmissions(validStatus);
            const tasks = await db.listAllTasks();
            const enriched = await Promise.all(submissions.map(async s => {
                const profile = await db.getProfile(s.userId);
                const task = tasks.find(t => t.id === s.taskId) || null;
                return {
                    ...s,
                    user: profile ? {
                        name: profile.name, username: profile.username,
                        userNumber: profile.userNumber,
                    } : null,
                    task: task ? {
                        taskNumber: task.taskNumber, title: task.title, rewardCoins: task.rewardCoins,
                    } : null,
                };
            }));
            return res.status(200).json({ submissions: enriched });
        }

        if (req.method === 'POST') {
            limitByIp(req, 'admin-review', 60, 60_000);
            const body = parseBody<Record<string, unknown>>(req);
            const submissionId = asString(body.submissionId, 'submissionId', { min: 8, max: 64 });
            const decision = asEnum(body.decision, 'decision', ['approve', 'reject'] as const);
            const rejectionReason = asOptionalString(body.rejectionReason, 'rejectionReason', { max: 300 });

            const all = await db.listAllSubmissions();
            const submission = all.find(s => s.id === submissionId);
            if (!submission) throw new HttpError(404, 'Submission not found', 'NOT_FOUND');
            if (submission.status !== 'pending') {
                return res.status(200).json({ submission, alreadyReviewed: true });
            }

            const reviewed = await db.reviewSubmission(
                submissionId,
                decision === 'approve' ? 'approved' : 'rejected',
                null,
                decision === 'reject' ? (rejectionReason || 'Rejected by admin') : null,
            );

            let reward = null;
            if (decision === 'approve' && reviewed) {
                const tasks = await db.listAllTasks();
                const task = tasks.find(t => t.id === submission.taskId);
                if (task) {
                    const { txn } = await db.applyCoinTransaction({
                        userId: submission.userId,
                        actionType: 'task_reward',
                        amount: task.rewardCoins,
                        reason: `Task ${task.taskNumber} verified`,
                        adminId: null,
                        referenceTaskId: task.id,
                        // Stable key: a retried approval can never double-pay.
                        idempotencyKey: `submission-reward:${submission.id}`,
                    });
                    reward = txn;
                }
            }

            await db.audit({
                actorUserId: null, actorType: 'admin',
                action: `submission_${decision}d`,
                targetType: 'submission', targetId: submissionId,
                meta: { userId: submission.userId, taskId: submission.taskId },
            });

            return res.status(200).json({ submission: reviewed, reward });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ error: 'Balance error', code: 'INSUFFICIENT_BALANCE' });
        }
        return sendError(res, err);
    }
}
