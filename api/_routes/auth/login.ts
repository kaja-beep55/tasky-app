import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db';
import type { Profile } from '../../_lib/db/types';
import { HttpError, limitByIp, parseBody, sendError, setSessionCookie, SESSION_COOKIE } from '../../_lib/http';
import { assertNotLocked, recordFailure, recordSuccess } from '../../_lib/lockout';
import { generateSessionToken, hashToken, verifyPassword } from '../../_lib/security';
import { asLoginIdentifier, asPassword, ValidationError } from '../../_lib/validate';

const USER_SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

async function findProfile(identifier: string): Promise<Profile | null> {
    const db = getDb();
    if (/^\d+$/.test(identifier)) {
        const byNumber = await db.getProfileByUserNumber(parseInt(identifier, 10));
        if (byNumber) return byNumber;
    }
    return db.getProfileByUsername(identifier);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'login', 20, 10 * 60_000);

        const body = parseBody<Record<string, unknown>>(req);
        const identifier = asLoginIdentifier(body.identifier);
        const password = asPassword(body.password);

        const lockKey = `login:${identifier}`;
        await assertNotLocked(lockKey);

        const db = getDb();
        let profile: Profile | null;
        let identity = null;
        let ok: boolean;

        // Publishable-key mode: password hashes are never selectable and
        // profiles may not be readable without a session; verification
        // happens via the database (tasky_login_lookup) and is
        // authoritative — no profile pre-lookup needed.
        if ('verifyLogin' in db && typeof (db as { verifyLogin?: unknown }).verifyLogin === 'function') {
            let r: { profile: Profile } | null = null;
            try {
                r = await (db as unknown as { verifyLogin(i: string, p: string): Promise<{ profile: Profile } | null> }).verifyLogin(identifier, password);
            } catch (e) {
                if (e instanceof Error && e.message === 'SUSPENDED') {
                    throw new HttpError(403, 'Account is suspended. Contact support.', 'SUSPENDED');
                }
                throw e;
            }
            if (!r) {
                await recordFailure(lockKey);
                throw new HttpError(401, 'Invalid username or password', 'BAD_CREDENTIALS');
            }
            profile = r.profile;
            identity = { userId: profile.id, passwordHash: '', createdAt: '', updatedAt: '' };
            ok = true;
        } else {
            profile = await findProfile(identifier);
            identity = profile ? await db.getIdentity(profile.id) : null;
            // Same work either way — no user-enumeration via timing or message.
            ok = identity ? verifyPassword(password, identity.passwordHash) : verifyPassword(password, DUMMY_HASH);
        }

        if (!profile || !identity || !ok) {
            await recordFailure(lockKey);
            if (profile) {
                await db.audit({
                    actorUserId: profile.id, actorType: 'user', action: 'login_failed',
                    targetType: 'profile', targetId: profile.id, meta: null,
                });
            }
            throw new HttpError(401, 'Invalid username or password', 'BAD_CREDENTIALS');
        }

        if (profile.status !== 'active') {
            throw new HttpError(403, 'Account is suspended. Contact support.', 'SUSPENDED');
        }

        await recordSuccess(lockKey);

        const token = generateSessionToken();
        await db.createSession({
            tokenHash: hashToken(token),
            userId: profile.id,
            scope: 'user',
            expiresAt: new Date(Date.now() + USER_SESSION_TTL_SEC * 1000).toISOString(),
            createdAt: new Date().toISOString(),
        });
        setSessionCookie(res, SESSION_COOKIE, token, USER_SESSION_TTL_SEC);

        await db.audit({
            actorUserId: profile.id, actorType: 'user', action: 'login_success',
            targetType: 'profile', targetId: profile.id, meta: null,
        });

        // Session travels ONLY in the httpOnly cookie — never in the body.
        return res.status(200).json({ profile });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}

// A valid-format hash so failed lookups cost the same as real checks.
const DUMMY_HASH = (() => {
    // scrypt$16384$8$1$<16B salt>$<64B hash> — fixed dummy value.
    const salt = Buffer.alloc(16).toString('base64');
    const hash = Buffer.alloc(64).toString('base64');
    return `scrypt$16384$8$1$${salt}$${hash}`;
})();
