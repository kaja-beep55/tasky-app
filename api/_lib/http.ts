import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './db';
import type { Profile, Session } from './db/types';
import { hashToken } from './security';
import { getClientIp, isRateLimited } from './rateLimit';

// ── HTTP helpers for Tasky API routes ─────────────────────────

export class HttpError extends Error {
    constructor(
        public status: number,
        message: string,
        public code: string = 'ERROR',
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
    res.setHeader('Allow', allowed.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
}

export function sendError(res: VercelResponse, err: unknown) {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
    }
    // Never leak internals to the client.
    console.error('[api] unexpected error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
}

export function parseBody<T>(req: VercelRequest): T {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object', 'BAD_BODY');
    }
    return body as T;
}

// ── Sessions ──────────────────────────────────────────────────
export const SESSION_COOKIE = 'tasky_session';
export const ADMIN_COOKIE = 'tasky_admin';

function extractToken(req: VercelRequest, cookieName: string): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === cookieName) return decodeURIComponent(rest.join('='));
    }
    return null;
}

export async function getSession(req: VercelRequest, cookieName: string): Promise<Session | null> {
    const token = extractToken(req, cookieName);
    if (!token) return null;
    return getDb().getSession(hashToken(token));
}

export async function requireUser(req: VercelRequest): Promise<{ session: Session; profile: Profile }> {
    const session = await getSession(req, SESSION_COOKIE);
    if (!session || session.scope !== 'user' || !session.userId) {
        throw new HttpError(401, 'Please log in to continue', 'UNAUTHORIZED');
    }
    const profile = await getDb().getProfile(session.userId);
    if (!profile) throw new HttpError(401, 'Account not found', 'UNAUTHORIZED');
    if (profile.status !== 'active') throw new HttpError(403, 'Account is suspended', 'SUSPENDED');
    return { session, profile };
}

export async function requireAdmin(req: VercelRequest): Promise<Session> {
    const session = await getSession(req, ADMIN_COOKIE);
    if (!session || session.scope !== 'admin') {
        throw new HttpError(401, 'Admin unlock required', 'ADMIN_REQUIRED');
    }
    return session;
}

const IS_PROD = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

export function setSessionCookie(res: VercelResponse, name: string, token: string, maxAgeSec: number) {
    const parts = [
        `${name}=${encodeURIComponent(token)}`,
        'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`,
    ];
    if (IS_PROD) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: VercelResponse, name: string) {
    res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ── Rate-limit convenience wrappers ───────────────────────────
export function limitByIp(req: VercelRequest, bucket: string, maxRequests: number, windowMs: number) {
    const ip = getClientIp(req.headers);
    if (isRateLimited(`${bucket}:ip:${ip}`, maxRequests, windowMs)) {
        throw new HttpError(429, 'Too many requests. Please wait and try again.', 'RATE_LIMITED');
    }
}
