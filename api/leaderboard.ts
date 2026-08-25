import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const { data: agents, error } = await supabase
      .from('earn_agents')
      .select('id, name, wallet, total_earned, tasks_completed, created_at')
      .order('total_earned', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Add rank
    const ranked = (agents || []).map((agent, i) => ({
      rank: i + 1,
      ...agent,
    }));

    // Global stats
    const totalAgents = ranked.length;
    const totalEarned = ranked.reduce((sum, a) => sum + (a.total_earned || 0), 0);
    const totalTasks = ranked.reduce((sum, a) => sum + (a.tasks_completed || 0), 0);

    return res.status(200).json({
      leaderboard: ranked,
      stats: {
        total_agents: totalAgents,
        total_xlm_earned: totalEarned,
        total_tasks_completed: totalTasks,
        top_agent: ranked[0]?.name || 'none',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Leaderboard error:', message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
}
