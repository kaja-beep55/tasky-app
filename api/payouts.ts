import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendPayout } from './_lib/stellar';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return handleGetPayouts(req, res);
  }

  if (req.method === 'POST') {
    return handleRetryPayout(req, res);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

/**
 * GET /api/payouts — List payout history
 */
async function handleGetPayouts(req: VercelRequest, res: VercelResponse) {
  const wallet = req.query.agent_wallet as string;

  let query = supabase
    .from('earn_payouts')
    .select('id, submission_id, task_id, agent_wallet, amount, asset, tx_hash, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (wallet) {
    query = query.eq('agent_wallet', wallet);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch payouts' });
  }

  const totalPaid = (data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  return res.status(200).json({
    payouts: data || [],
    count: data?.length || 0,
    total_paid_xlm: totalPaid,
  });
}

/**
 * POST /api/payouts — Retry a failed payout (admin use)
 * Body: { submission_id }
 */
async function handleRetryPayout(req: VercelRequest, res: VercelResponse) {
  const { submission_id } = req.body || {};

  if (!submission_id) {
    return res.status(400).json({ error: 'submission_id required' });
  }

  // Fetch submission
  const { data: submission, error: fetchError } = await supabase
    .from('earn_submissions')
    .select('*')
    .eq('id', submission_id)
    .single();

  if (fetchError || !submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  if (submission.status !== 'approved') {
    return res.status(400).json({ error: 'Submission is not approved' });
  }

  if (!submission.agent_wallet) {
    return res.status(400).json({ error: 'No wallet address on submission' });
  }

  // Check if already paid
  const { data: existingPayout } = await supabase
    .from('earn_payouts')
    .select('id')
    .eq('submission_id', submission_id)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingPayout) {
    return res.status(409).json({ error: 'Already paid out' });
  }

  // Send payout
  const result = await sendPayout(
    submission.agent_wallet,
    String(submission.reward_amount),
    `reward:${submission.task_id}`
  );

  if (result.success) {
    await supabase.from('earn_payouts').insert({
      submission_id,
      task_id: submission.task_id,
      agent_wallet: submission.agent_wallet,
      amount: submission.reward_amount,
      asset: 'XLM',
      tx_hash: result.txHash,
      status: 'completed',
    });

    await supabase.rpc('increment_agent_stats', {
      p_wallet: submission.agent_wallet,
      p_earned: submission.reward_amount,
    });

    return res.status(200).json({
      success: true,
      payout: {
        amount: submission.reward_amount,
        asset: 'XLM',
        tx_hash: result.txHash,
      },
    });
  }

  return res.status(500).json({ error: `Payout failed: ${result.error}` });
}
