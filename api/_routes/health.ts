import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isSupabaseConfigured } from '../_lib/db/index.js';

// GET /api/health — liveness + which database driver is active.
// Exposes no secrets; 'local' vs 'supabase' is not sensitive.
export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    return res.status(200).json({
        ok: true,
        service: 'tasky',
        database: isSupabaseConfigured() ? 'supabase' : 'local',
    });
}
