// ── Input validation helpers ──────────────────────────────────
// Every API route validates and normalizes untrusted input here
// before it touches the data layer.

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export function asString(value: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
    if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
    const trimmed = value.trim();
    const min = opts.min ?? 0;
    const max = opts.max ?? 500;
    if (trimmed.length < min) throw new ValidationError(`${field} is too short`);
    if (trimmed.length > max) throw new ValidationError(`${field} is too long`);
    // Strip control characters (prevents log/terminal injection)
    // eslint-disable-next-line no-control-regex
    return trimmed.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

export function asOptionalString(value: unknown, field: string, opts: { max?: number } = {}): string {
    if (value === undefined || value === null || value === '') return '';
    return asString(value, field, opts);
}

export function asInt(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
        throw new ValidationError(`${field} must be an integer`);
    }
    if (opts.min !== undefined && n < opts.min) throw new ValidationError(`${field} is too small`);
    if (opts.max !== undefined && n > opts.max) throw new ValidationError(`${field} is too large`);
    return n;
}

export function asEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
    }
    return value as T;
}

// Only http(s) URLs are accepted for task targets/images.
// Blocks javascript:, data:, file:, protocol-relative, etc.
export function asHttpsUrl(value: unknown, field: string, opts: { allowRelative?: boolean } = {}): string {
    const s = asString(value, field, { min: 1, max: 2048 });
    if (opts.allowRelative && s.startsWith('/') && !s.startsWith('//')) {
        return s;
    }
    let url: URL;
    try {
        url = new URL(s);
    } catch {
        throw new ValidationError(`${field} must be a valid URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new ValidationError(`${field} must be an http(s) URL`);
    }
    return url.toString();
}

export function asIdempotencyKey(value: unknown): string {
    const s = asString(value, 'idempotencyKey', { min: 8, max: 128 });
    if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new ValidationError('idempotencyKey has invalid characters');
    return s;
}

export function asUsername(value: unknown): string {
    const s = asString(value, 'username', { min: 3, max: 32 }).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(s)) throw new ValidationError('username may only contain letters, numbers, underscore');
    return s;
}

export function asPassword(value: unknown): string {
    if (typeof value !== 'string') throw new ValidationError('password must be a string');
    if (value.length < 8) throw new ValidationError('password must be at least 8 characters');
    if (value.length > 128) throw new ValidationError('password is too long');
    return value;
}

export function asTaskNumber(value: unknown): string {
    const s = asString(value, 'taskNumber', { min: 1, max: 32 });
    if (!/^[A-Za-z0-9-]+$/.test(s)) throw new ValidationError('taskNumber may only contain letters, numbers and dashes');
    return s;
}

// Login identifier: username, user number, or UUID.
export function asLoginIdentifier(value: unknown): string {
    return asString(value, 'identifier', { min: 1, max: 64 }).toLowerCase();
}
