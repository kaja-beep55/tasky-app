import type { VercelRequest, VercelResponse } from '@vercel/node';
import tasksData from '../src/data/tasks.json';

type Task = (typeof tasksData)[number];

export default function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        let tasks: Task[] = [...tasksData];

        // Optional filters via query params
        const { category, status, difficulty, tier, badge, network } = req.query;

        if (category && typeof category === 'string') {
            tasks = tasks.filter(t => t.category.toLowerCase() === category.toLowerCase());
        }

        if (status && typeof status === 'string') {
            tasks = tasks.filter(t => t.status.toUpperCase() === status.toUpperCase());
        }

        if (difficulty && typeof difficulty === 'string') {
            tasks = tasks.filter(t => t.difficulty.toLowerCase() === difficulty.toLowerCase());
        }

        if (tier && typeof tier === 'string') {
            tasks = tasks.filter(t => t.tier === parseInt(tier, 10));
        }

        if (badge && typeof badge === 'string') {
            tasks = tasks.filter(t => t.badge === badge.toLowerCase());
        }

        if (network && typeof network === 'string') {
            tasks = tasks.filter(t => t.network === network.toLowerCase());
        }

        // Separate active vs coming soon
        const active = tasks.filter(t => t.status !== 'COMING_SOON');
        const comingSoon = tasks.filter(t => t.status === 'COMING_SOON');

        // Strip sensitive verification config from public response
        // Agents should rely on task description, not reverse-engineer verify checks
        const stripSensitive = (t: Task) => {
            const { verify_config, acceptance_criteria, ...safe } = t as Task & { verify_config?: unknown; acceptance_criteria?: unknown };
            return {
                ...safe,
                proof_hint: typeof verify_config === 'object' && verify_config !== null && 'type' in verify_config
                    ? `Verification: ${(verify_config as { type: string }).type}`
                    : 'auto',
            };
        };

        return res.status(200).json({
            tasks: active.map(stripSensitive),
            coming_soon: comingSoon.map(stripSensitive),
            total_active: active.length,
            total_coming_soon: comingSoon.length,
            total_reward_xlm: active.reduce((sum, t) => sum + t.reward_amount, 0),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Error fetching tasks:', message);
        return res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
}
