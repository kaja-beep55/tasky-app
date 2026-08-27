import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../_lib/db/index.js';
import { requireUser, sendError } from '../../_lib/http.js';

// GET /api/coins/history — the logged-in user's own coin history.
// Users can ONLY ever see their own transactions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { profile } = await requireUser(req);
        const transactions = await getDb().listCoinTransactions(profile.id, 200);
        return res.status(200).json({ transactions, balance: profile.coins });
    } catch (err) {
        return sendError(res, err);
    }
}
