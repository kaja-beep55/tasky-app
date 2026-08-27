// ── Tasky local dev API server ────────────────────────────────
// Runs the Vercel-style api/*.ts handlers on a plain Node server
// so the whole product works locally WITHOUT Supabase credentials.
// The Vite dev server proxies /api to this port (see vite.config.ts).
//
//   npm run dev:api
//
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env (no dependency; simple KEY=VALUE parser)
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

type Handler = (req: unknown, res: unknown) => unknown;

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
    route('/api/health', () => import('../api/_routes/health')),
    route('/api/auth/signup', () => import('../api/_routes/auth/signup')),
    route('/api/auth/login', () => import('../api/_routes/auth/login')),
    route('/api/auth/logout', () => import('../api/_routes/auth/logout')),
    route('/api/auth/me', () => import('../api/_routes/auth/me')),
    route('/api/auth/recover', () => import('../api/_routes/auth/recover')),
    route('/api/tasks', () => import('../api/_routes/tasks/index')),
    route('/api/tasks/:taskNumber', () => import('../api/_routes/tasks/[taskNumber]')),
    route('/api/submissions', () => import('../api/_routes/submissions')),
    route('/api/coins/history', () => import('../api/_routes/coins/history')),
    route('/api/admin/unlock', () => import('../api/_routes/admin/unlock')),
    route('/api/admin/lock', () => import('../api/_routes/admin/lock')),
    route('/api/admin/tasks', () => import('../api/_routes/admin/tasks/index')),
    route('/api/admin/tasks/:taskNumber', () => import('../api/_routes/admin/tasks/[taskNumber]')),
    route('/api/admin/users', () => import('../api/_routes/admin/users')),
    route('/api/admin/coins', () => import('../api/_routes/admin/coins')),
    route('/api/admin/submissions', () => import('../api/_routes/admin/submissions')),
    route('/api/admin/audit', () => import('../api/_routes/admin/audit')),
];

// Minimal VercelResponse shim
function shimRes(res: ServerResponse) {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    return {
        status(code: number) { statusCode = code; return this; },
        setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
        json(body: unknown) {
            headers['content-type'] = 'application/json; charset=utf-8';
            res.writeHead(statusCode, headers);
            res.end(JSON.stringify(body));
        },
        end() {
            res.writeHead(statusCode, headers);
            res.end();
        },
    };
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;

    const matched = routes.find(r => r.pattern.test(path));
    if (!matched) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    // Parse JSON body
    let body: unknown = undefined;
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) {
            try {
                body = JSON.parse(raw);
            } catch {
                res.writeHead(400, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body', code: 'BAD_BODY' }));
                return;
            }
        } else {
            body = {};
        }
    }

    const match = path.match(matched.pattern)!;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    matched.keys.forEach((key, i) => { query[key] = decodeURIComponent(match[i + 1]); });

    const shimReq = {
        method: req.method,
        headers: req.headers,
        query,
        body,
    };

    // Same security headers as vercel.json (local parity).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    try {
        const mod = await matched.load();
        await mod.default(shimReq, shimRes(res));
    } catch (err) {
        console.error('[dev-api] handler crashed:', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' }));
        }
    }
});

const port = parseInt(process.env.DEV_API_PORT || '12001', 10);
server.listen(port, () => {
    console.log(`[dev-api] Tasky API listening on http://localhost:${port}`);
    import('../api/_lib/db').then(({ isSupabaseConfigured }) => {
        console.log(`[dev-api] database driver: ${isSupabaseConfigured() ? 'supabase' : 'local (json file)'}`);
    });
});
