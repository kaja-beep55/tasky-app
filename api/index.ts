// ── Tasky catch-all API function ────────────────────────────────
// Vercel Hobby allows max 12 serverless functions per deployment,
// so every route lives in this single function. Paths under
// api/_routes/ are plain modules — Vercel ignores directories that
// start with an underscore.
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

interface Route {
    pattern: RegExp;
    keys: string[];
    load: () => Promise<{ default: Handler }>;
}

function route(path: string, load: () => Promise<{ default: Handler }>): Route {
    const keys: string[] = [];
    const pattern = new RegExp(
        '^' + path.replace(/:[^/]+/g, (m) => {
            keys.push(m.slice(1));
            return '([^/]+)';
        }) + '/?$'
    );
    return { pattern, keys, load };
}

const routes: Route[] = [
    route('/api/health', () => import('./_routes/health.js')),
    route('/api/auth/signup', () => import('./_routes/auth/signup.js')),
    route('/api/auth/login', () => import('./_routes/auth/login.js')),
    route('/api/auth/logout', () => import('./_routes/auth/logout.js')),
    route('/api/auth/me', () => import('./_routes/auth/me.js')),
    route('/api/auth/recover', () => import('./_routes/auth/recover.js')),
    route('/api/tasks', () => import('./_routes/tasks/index.js')),
    route('/api/tasks/:taskNumber', () => import('./_routes/tasks/[taskNumber].js')),
    route('/api/submissions', () => import('./_routes/submissions.js')),
    route('/api/coins/history', () => import('./_routes/coins/history.js')),
    route('/api/admin/unlock', () => import('./_routes/admin/unlock.js')),
    route('/api/admin/lock', () => import('./_routes/admin/lock.js')),
    route('/api/admin/tasks', () => import('./_routes/admin/tasks/index.js')),
    route('/api/admin/tasks/:taskNumber', () => import('./_routes/admin/tasks/[taskNumber].js')),
    route('/api/admin/users', () => import('./_routes/admin/users.js')),
    route('/api/admin/coins', () => import('./_routes/admin/coins.js')),
    route('/api/admin/submissions', () => import('./_routes/admin/submissions.js')),
    route('/api/admin/audit', () => import('./_routes/admin/audit.js')),
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
        const mod = await matched.load();
        return await mod.default(req, res);
    } catch (err) {
        console.error('[api] handler crashed:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
    }
}
