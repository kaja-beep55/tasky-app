// Thin fetch wrapper. Same-origin requests; session travels in an
// httpOnly cookie. Tokens are never written to localStorage.

export class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, message: string, code: string = 'ERROR') {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(path, {
            credentials: 'same-origin',
            headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
            ...options,
        });
    } catch {
        throw new ApiError(0, 'Network error. Check your connection and try again.', 'NETWORK');
    }

    let data: Record<string, unknown> = {};
    try {
        data = await res.json();
    } catch {
        // non-JSON response
    }

    if (!res.ok) {
        throw new ApiError(
            res.status,
            typeof data.error === 'string' ? data.error : 'Request failed',
            typeof data.code === 'string' ? data.code : 'ERROR',
        );
    }
    return data as T;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) =>
        request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Stable idempotency key for one user intent (created once per form open). */
export function newIdempotencyKey(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}
