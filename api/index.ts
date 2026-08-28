// ── Tasky catch-all API function ────────────────────────────────
// Vercel Hobby allows max 12 serverless functions per deployment,
// so every route lives in this single function. Paths under
// api/_routes/ are plain modules — Vercel ignores directories that
// start with an underscore.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import health from './_routes/health.js';
import signup from './_routes/auth/signup.js';
import login from './_routes/auth/login.js';
import logout from './_routes/auth/logout.js';
import me from './_routes/auth/me.js';
import recover from './_routes/auth/recover.js';
import tasksIndex from './_routes/tasks/index.js';
import taskDetail from './_routes/tasks/[taskNumber].js';
import submissions from './_routes/submissions.js';
import coinsHistory from './_routes/coins/history.js';
import adminUnlock from './_routes/admin/unlock.js';
import adminLock from './_routes/admin/lock.js';
import adminTasks from './_routes/admin/tasks/index.js';
import adminTaskItem from './_routes/admin/tasks/[taskNumber].js';
import adminUsers from './_routes/admin/users.js';
import adminCoins from './_routes/admin/coins.js';
import adminSubmissions from './_routes/admin/submissions.js';
import adminAudit from './_routes/admin/audit.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

interface Route {
    pattern: RegExp;
    keys: string[];
    handler: Handler;
}

function route(path: string, handler: Handler): Route {
    const keys: string[] = [];
    const pattern = new RegExp(
        '^' + path.replace(/:[^/]+/g, (m) => {
            keys.push(m.slice(1));
            return '([^/]+)';
        }) + '/?$'
    );
    return { pattern, keys, handler };
}

const routes: Route[] = [
    route('/api/health', health),
    route('/api/auth/signup', signup),
    route('/api/auth/login', login),
    route('/api/auth/logout', logout),
    route('/api/auth/me', me),
    route('/api/auth/recover', recover),
    route('/api/tasks', tasksIndex),
    route('/api/tasks/:taskNumber', taskDetail),
    route('/api/submissions', submissions),
    route('/api/coins/history', coinsHistory),
    route('/api/admin/unlock', adminUnlock),
    route('/api/admin/lock', adminLock),
    route('/api/admin/tasks', adminTasks),
    route('/api/admin/tasks/:taskNumber', adminTaskItem),
    route('/api/admin/users', adminUsers),
    route('/api/admin/coins', adminCoins),
    route('/api/admin/submissions', adminSubmissions),
    route('/api/admin/audit', adminAudit),
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const path = (req.url || '/').split('?')[0];
    const matched = routes.find(r => r.pattern.test(path));
    if (!matched) {
        return res.status(404).json({ error: 'Not found' });
    }

    const match = path.match(matched.pattern)!;
    const query = { ...(req.query as Record<string, string | string[]>) };
    matched.keys.forEach((key, i) => {
        query[key] = decodeURIComponent(match[i + 1]);
    });
    (req as { query: unknown }).query = query;

    try {
        return await matched.handler(req, res);
    } catch (err) {
        console.error('[api] handler crashed:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
    }
}
