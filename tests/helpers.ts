// Test helper: invoke Vercel-style handlers directly.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface TestResponse {
    status: number;
    body: Record<string, unknown>;
    headers: Record<string, string>;
    cookies: Record<string, string>;
}

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

export async function call(
    handler: Handler,
    opts: {
        method?: string;
        body?: unknown;
        query?: Record<string, string>;
        headers?: Record<string, string>;
        cookies?: Record<string, string>;
    } = {},
): Promise<TestResponse> {
    let status = 200;
    let body: Record<string, unknown> = {};
    const headers: Record<string, string> = {};

    const req = {
        method: opts.method ?? 'GET',
        query: opts.query ?? {},
        body: opts.body,
        headers: opts.headers ?? {},
    } as unknown as VercelRequest;

    const cookieHeader = opts.cookies
        ? Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
        : undefined;
    if (cookieHeader) (req as { headers: Record<string, string> }).headers.cookie = cookieHeader;

    const res = {
        status(code: number) { status = code; return this; },
        setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
        json(payload: unknown) { body = payload as Record<string, unknown>; return this; },
        end() { return this; },
    } as unknown as VercelResponse;

    await handler(req, res);

    // Parse Set-Cookie into a cookie jar
    const cookies: Record<string, string> = {};
    const setCookie = headers['set-cookie'];
    if (setCookie) {
        const [pair] = setCookie.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) {
            const value = decodeURIComponent(pair.slice(idx + 1));
            if (value) cookies[pair.slice(0, idx)] = value;
        }
    }

    return { status, body, headers, cookies };
}
