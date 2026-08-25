import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import tasksJson from '../src/data/tasks.json';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ── Task category lookup ──
interface TaskDef { id: string; category: string; }
const taskMap = new Map<string, TaskDef>();
for (const t of tasksJson as unknown as TaskDef[]) taskMap.set(t.id, t);

// ── Skill icons ──
const SKILL_META: Record<string, { icon: string; color: string }> = {
  'Onboarding':       { icon: '🟢', color: '#22c55e' },
  'Stellar Skills':   { icon: '⭐', color: '#f59e0b' },
  'x402':             { icon: '🌐', color: '#3b82f6' },
  'Machine Payments': { icon: '🤖', color: '#8b5cf6' },
  'Content':          { icon: '✍️', color: '#ec4899' },
  'Research':         { icon: '🔬', color: '#06b6d4' },
  'ASG Card':         { icon: '💳', color: '#f97316' },
  'ASG Pay':          { icon: '💰', color: '#10b981' },
  'Community':        { icon: '🤝', color: '#6366f1' },
};

// ── Tier logic ──
function computeTier(tasksCompleted: number) {
  if (tasksCompleted >= 25) return { name: 'Elite',    icon: '💎', stars: 5, color: '#ffd700' };
  if (tasksCompleted >= 10) return { name: 'Expert',   icon: '🔥', stars: 4, color: '#a855f7' };
  if (tasksCompleted >= 3)  return { name: 'Skilled',  icon: '⚡', stars: 2, color: '#3b82f6' };
  return                           { name: 'Newcomer', icon: '🌱', stars: 0, color: '#6b7280' };
}

// ── Badges ──
function computeBadges(
  agent: { tasks_completed: number; total_earned: number; created_at: string },
  skills: string[],
  rank: number
) {
  const badges: { id: string; name: string; icon: string; desc: string }[] = [];

  if (agent.tasks_completed >= 1)
    badges.push({ id: 'first_payout', name: 'First Payout', icon: '🏅', desc: 'Completed first task' });
  if (agent.tasks_completed >= 10)
    badges.push({ id: '10_tasks', name: 'Task Master', icon: '🎯', desc: '10+ tasks completed' });
  if (agent.tasks_completed >= 25)
    badges.push({ id: '25_tasks', name: 'Unstoppable', icon: '🚀', desc: '25+ tasks completed' });
  if (agent.total_earned >= 100)
    badges.push({ id: '100_xlm', name: '100 XLM Club', icon: '💰', desc: 'Earned 100+ XLM' });
  if (rank <= 3)
    badges.push({ id: 'top3', name: 'Top 3', icon: '🏆', desc: 'Top 3 on leaderboard' });
  if (skills.includes('Machine Payments'))
    badges.push({ id: 'm2m_pioneer', name: 'M2M Pioneer', icon: '🤖', desc: 'Agent-to-agent payment' });
  if (skills.includes('Content'))
    badges.push({ id: 'content_creator', name: 'Content Creator', icon: '✍️', desc: '1+ content tasks' });
  if (skills.includes('x402'))
    badges.push({ id: 'x402_expert', name: 'x402 Expert', icon: '🌐', desc: '1+ x402 tasks' });

  return badges;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  // Support both ?wallet=... and the raw param
  const wallet = (req.query.wallet as string || '').trim();
  if (!wallet || wallet.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid wallet parameter' });
  }

  try {
    // 1. Agent base data
    const { data: agent, error: agentErr } = await supabase
      .from('earn_agents')
      .select('*')
      .eq('wallet', wallet)
      .single();

    if (agentErr || !agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // 2. All submissions for this agent
    const { data: submissions } = await supabase
      .from('earn_submissions')
      .select('task_id, status, created_at, reward_amount')
      .eq('agent_wallet', wallet)
      .order('created_at', { ascending: false });

    const allSubs = submissions || [];
    const approved = allSubs.filter(s => s.status === 'approved');
    const rejected = allSubs.filter(s => s.status === 'rejected');

    // 3. Derive skills from completed task categories
    const completedTaskIds = approved.map(s => s.task_id);
    const categorySet = new Set<string>();
    for (const tid of completedTaskIds) {
      const task = taskMap.get(tid);
      if (task?.category) categorySet.add(task.category);
    }
    const skills = [...categorySet].map(cat => ({
      name: cat,
      ...SKILL_META[cat] || { icon: '📦', color: '#6b7280' },
    }));

    // 4. Stats
    const successRate = allSubs.length > 0
      ? Math.round((approved.length / allSubs.length) * 100)
      : 0;

    // 5. Tier
    const tier = computeTier(agent.tasks_completed || 0);

    // 6. Rank
    const { count } = await supabase
      .from('earn_agents')
      .select('*', { count: 'exact', head: true })
      .gt('total_earned', agent.total_earned || 0);
    const rank = (count || 0) + 1;

    // 7. Badges
    const badges = computeBadges(agent, [...categorySet], rank);

    // 8. Recent activity (last 10)
    const recentActivity = allSubs.slice(0, 10).map(s => {
      const task = taskMap.get(s.task_id);
      return {
        task_id: s.task_id,
        task_title: task ? (task as any).title : s.task_id,
        status: s.status,
        reward: s.reward_amount,
        date: s.created_at,
      };
    });

    // 9. Days since registration
    const daysSinceJoin = Math.floor(
      (Date.now() - new Date(agent.created_at).getTime()) / 86400000
    );

    return res.status(200).json({
      agent: {
        id: agent.id,
        name: agent.name,
        wallet: agent.wallet,
        created_at: agent.created_at,
        days_active: daysSinceJoin,
      },
      stats: {
        tasks_completed: agent.tasks_completed || 0,
        total_earned: agent.total_earned || 0,
        total_submissions: allSubs.length,
        approved: approved.length,
        rejected: rejected.length,
        success_rate: successRate,
        rank,
      },
      tier,
      skills,
      badges,
      recent_activity: recentActivity,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent profile error:', message);
    return res.status(500).json({ error: 'Failed to fetch agent profile' });
  }
}
