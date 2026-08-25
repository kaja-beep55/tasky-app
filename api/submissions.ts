import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited, getClientIp, isWalletCooldown } from './_lib/rateLimit';
import { autoVerify } from './_lib/autoVerify';
import { sendPayout } from './_lib/stellar';
import tasksData from '../src/data/tasks.json';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ESCROW_ADDRESS = process.env.STELLAR_ESCROW_PUBLIC_KEY || '';
// No daily caps on testnet — XLM is free via Friendbot
const MAX_REJECTIONS_PER_TASK = 3; // max failed attempts before lockout

interface SubmissionPayload {
  task_id: string;
  agent_id?: string;
  agent_wallet?: string;
  proof: string;
  proof_type?: string;
  website_url?: string; // honeypot
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return handleGetSubmissions(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Rate limiting (IP-level)
    const clientIp = getClientIp(req.headers);
    if (isRateLimited(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    const data = req.body as SubmissionPayload;

    // Rate limiting (wallet-level cooldown: 1 submission per 30s)
    if (data.agent_wallet && isWalletCooldown(data.agent_wallet)) {
      return res.status(429).json({ error: 'Please wait 30 seconds between submissions.' });
    }

    // Honeypot anti-spam
    if (data.website_url) {
      return res.status(200).json({ success: true, message: 'Submission received' });
    }

    // Validate required fields
    if (!data.task_id || !data.proof) {
      return res.status(400).json({ error: 'task_id and proof are required' });
    }

    // Find task from our data
    const task = (tasksData as Array<{
      id: string;
      title: string;
      status: string;
      reward_amount: number;
      verify_config: { type: string; check?: string; min_words?: number; required_keywords?: string[]; expected_strings?: string[] };
    }>).find((t) => t.id === data.task_id);

    if (!task) {
      return res.status(404).json({ error: `Task ${data.task_id} not found` });
    }

    if (task.status === 'COMING_SOON') {
      return res.status(400).json({ error: 'This task is not yet available. Complete all testnet tasks first.' });
    }

    // Block escrow self-submission
    if (data.agent_wallet && data.agent_wallet === ESCROW_ADDRESS) {
      return res.status(403).json({ error: 'Escrow address cannot submit tasks.' });
    }

    // Check duplicate submission (same agent + task)
    if (data.agent_wallet) {
      const { data: existing } = await supabase
        .from('earn_submissions')
        .select('id, status')
        .eq('task_id', data.task_id)
        .eq('agent_wallet', data.agent_wallet)
        .in('status', ['approved', 'pending_review'])
        .maybeSingle();

      if (existing) {
        const msg = existing.status === 'pending_review'
          ? 'This task is already pending review'
          : 'You already completed this task';
        return res.status(409).json({ error: msg });
      }

      // Per-task attempt cap: max N rejections before lockout
      const { count: rejectionCount } = await supabase
        .from('earn_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', data.task_id)
        .eq('agent_wallet', data.agent_wallet)
        .eq('status', 'rejected');

      if (rejectionCount !== null && rejectionCount >= MAX_REJECTIONS_PER_TASK) {
        return res.status(429).json({
          error: `Maximum ${MAX_REJECTIONS_PER_TASK} attempts reached for this task. Review the task description carefully.`,
        });
      }
    }

    // ──────────────────────────────────────
    // AUTO-VERIFY ENGINE
    // ──────────────────────────────────────
    const verifyResult = await autoVerify(
      data.task_id,
      task.verify_config,
      data.proof,
      data.agent_wallet
    );

    // Determine status
    let status: string;
    if (verifyResult.passed && verifyResult.type === 'auto') {
      // On-chain / API tasks → instant approval
      status = 'approved';
    } else if (verifyResult.passed && verifyResult.type === 'semi') {
      // Text content tasks → deferred approval (auto-approved by cron in 24h)
      status = 'pending_review';
    } else if (verifyResult.type === 'manual') {
      status = 'pending_review';
    } else {
      status = 'rejected';
    }

    // Insert submission
    const { data: submission, error: insertError } = await supabase
      .from('earn_submissions')
      .insert({
        task_id: data.task_id,
        task_title: task.title,
        agent_id: data.agent_id || null,
        agent_wallet: data.agent_wallet || null,
        proof: data.proof,
        proof_type: data.proof_type || 'text',
        proof_hash: createHash('sha256').update(data.proof.trim().toLowerCase()).digest('hex'),
        status,
        verify_type: verifyResult.type,
        verify_reason: verifyResult.reason || null,
        verify_score: verifyResult.score || null,
        reward_amount: task.reward_amount,
        reward_asset: 'XLM',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Submission insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save submission' });
    }

    // ──────────────────────────────────────
    // AUTO-PAYOUT (if approved + wallet provided)
    // ──────────────────────────────────────
    let payout = null;
    if (status === 'approved' && data.agent_wallet && task.reward_amount > 0) {
      // Testnet: no daily caps — XLM is free
      const payoutResult = await sendPayout(
        data.agent_wallet,
        String(task.reward_amount),
        `reward:${data.task_id}`
      );

      if (payoutResult.success) {
        // Record payout
        await supabase.from('earn_payouts').insert({
          submission_id: submission.id,
          task_id: data.task_id,
          agent_wallet: data.agent_wallet,
          amount: task.reward_amount,
          asset: 'XLM',
          tx_hash: payoutResult.txHash,
          status: 'completed',
        });

        // Update agent stats
        await supabase.rpc('increment_agent_stats', {
          p_wallet: data.agent_wallet,
          p_earned: task.reward_amount,
        });

        payout = {
          amount: task.reward_amount,
          asset: 'XLM',
          tx_hash: payoutResult.txHash,
        };
      } else {
        console.error('Payout failed:', payoutResult.error);
        // Mark submission as approved but payout pending
        await supabase
          .from('earn_submissions')
          .update({ payout_status: 'failed', payout_error: payoutResult.error })
          .eq('id', submission.id);
      }
    }

    // ──────────────────────────────────────
    // Response
    // ──────────────────────────────────────
    const response: Record<string, unknown> = {
      success: true,
      submission_id: submission.id,
      task_id: data.task_id,
      status,
      verify: {
        type: verifyResult.type,
        passed: verifyResult.passed,
        reason: verifyResult.reason,
      },
    };

    if (payout) {
      response.payout = payout;
      response.message = `✅ Task verified! ${payout.amount} XLM sent to your wallet.`;
    } else if (status === 'pending_review' && verifyResult.passed) {
      response.message = '✅ Content accepted! Your submission passed all checks and will be auto-approved within 24h. Payout follows automatically.';
    } else if (status === 'pending_review') {
      response.message = '⏳ Submitted for review. You will receive XLM once approved.';
    } else if (status === 'rejected') {
      response.message = `❌ Verification failed: ${verifyResult.reason}`;
    }

    return res.status(status === 'rejected' ? 400 : 200).json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Submission error:', message);
    return res.status(500).json({ error: 'Failed to process submission' });
  }
}

/**
 * GET /api/submissions?agent_wallet=G...
 */
async function handleGetSubmissions(req: VercelRequest, res: VercelResponse) {
  const wallet = req.query.agent_wallet as string;

  // Always fetch proof — it's needed for Journal page (approved content)
  let query = supabase
    .from('earn_submissions')
    .select('id, task_id, task_title, agent_wallet, proof, status, verify_type, reward_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (wallet) {
    query = query.eq('agent_wallet', wallet);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch submissions' });
  }

  // Without ?agent_wallet=, redact proof for non-approved submissions
  // Approved proofs are public content (shown on Journal page)
  // Pending/rejected proofs are hidden to prevent copy-paste attacks
  const submissions = wallet
    ? (data || [])
    : (data || []).map(s => ({
        ...s,
        proof: s.status === 'approved' ? s.proof : undefined,
      }));

  return res.status(200).json({ submissions });
}
