import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, sendError } from '../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { profile } = await requireUser(req);
        return res.status(200).json({ profile });
    } catch (err) {
        return sendError(res, err);
    }
}
