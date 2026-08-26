// Minimal local stand-in for `@vercel/node` request/response types.
// The real package is a dev-only dependency whose transitive deps
// (undici, path-to-regexp, ajv) carry open CVEs. Our API handlers only
// use a tiny surface (method/query/body/headers on req; status/json/
// setHeader on res), so we declare exactly that surface here and drop
// the package. Vercel compiles these functions with its own toolchain
// at deploy time; these types are structural and compile identically.
declare module '@vercel/node' {
    import type { IncomingMessage, ServerResponse } from 'node:http';

    export interface VercelRequest extends IncomingMessage {
        query: Record<string, string | string[]>;
        body?: unknown;
        cookies: Record<string, string>;
    }

    export interface VercelResponse extends ServerResponse {
        status(code: number): VercelResponse;
        json(payload: unknown): void;
        send(payload: unknown): void;
    }
}
