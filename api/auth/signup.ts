import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { HttpError, limitByIp, parseBody, sendError, setSessionCookie, SESSION_COOKIE } from '../_lib/http';
import { generateRecoveryCode, generateSessionToken, hashPassword, hashRecoveryCode, hashToken } from '../_lib/security';
import { asPassword, asString, ValidationError } from '../_lib/validate';

const USER_SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function baseUsername(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    return slug || 'user';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        limitByIp(req, 'signup', 10, 60 * 60_000); // 10 signups/hour/IP

        const body = parseBody<Record<string, unknown>>(req);
        const name = asString(body.name, 'name', { min: 2, max: 60 });
        const country = asString(body.country, 'country', { min: 2, max: 60 });
        const state = asString(body.state, 'state', { min: 1, max: 60 });
        const password = asPassword(body.password);

        const db = getDb();

        // Generate a unique username: <nameslug><4 random digits>
        let username = '';
        for (let attempt = 0; attempt < 8; attempt++) {
            const candidate = `${baseUsername(name)}${Math.floor(1000 + Math.random() * 9000)}`;
            if (!(await db.getProfileByUsername(candidate))) {
                username = candidate;
                break;
            }
        }
        if (!username) throw new HttpError(500, 'Could not allocate a username. Please retry.', 'USERNAME_ALLOC_FAILED');

        const profile = await db.createProfile({ name, country, state, username });

        await db.setIdentity({
            userId: profile.id,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // Recovery code: shown to the user exactly once, stored hashed.
        const recoveryCode = generateRecoveryCode();
        await db.setRecovery({
            userId: profile.id,
            codeHash: hashRecoveryCode(recoveryCode),
            createdAt: new Date().toISOString(),
        });

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
            actorUserId: profile.id, actorType: 'user', action: 'profile_created',
            targetType: 'profile', targetId: profile.id,
            meta: { username, userNumber: profile.userNumber },
        });

        // Session travels ONLY in the httpOnly cookie — never in the body.
        return res.status(201).json({ profile, recoveryCode });
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(400).json({ error: err.message, code: 'VALIDATION' });
        }
        return sendError(res, err);
    }
}
