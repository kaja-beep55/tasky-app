import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// ── Password hashing: scrypt with per-user random salt ────────
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    try {
        const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
        if (algo !== 'scrypt') return false;
        const salt = Buffer.from(saltB64, 'base64');
        const expected = Buffer.from(hashB64, 'base64');
        const actual = scryptSync(password, salt, expected.length, {
            N: parseInt(n, 10), r: parseInt(r, 10), p: parseInt(p, 10),
        });
        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

// ── Opaque session tokens ─────────────────────────────────────
export function generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

// ── Recovery codes ────────────────────────────────────────────
// Human-friendly 16-char code, grouped: XXXX-XXXX-XXXX-XXXX.
// Stored only as sha256(code + server pepper).
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

export function generateRecoveryCode(): string {
    const bytes = randomBytes(16);
    const chars: string[] = [];
    for (let i = 0; i < 16; i++) {
        chars.push(RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]);
    }
    return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}`;
}

export function hashRecoveryCode(code: string): string {
    const pepper = process.env.RECOVERY_CODE_PEPPER || '';
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return createHash('sha256').update(`${normalized}:${pepper}`).digest('hex');
}

// ── Constant-time string compare for short secrets ────────────
export function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) {
        // Compare against itself to keep timing roughly constant.
        timingSafeEqual(ba, ba);
        return false;
    }
    return timingSafeEqual(ba, bb);
}

export function randomId(): string {
    return randomBytes(16).toString('hex');
}
