import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { isRateLimited, getClientIp } from './_lib/rateLimit';

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
    return handleGetFeedback(res);
  }

  if (req.method === 'POST') {
    return handlePostFeedback(req, res);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

/**
 * GET /api/feedback — HN-style feedback wall
 */
async function handleGetFeedback(res: VercelResponse) {
  const { data, error } = await supabase
    .from('earn_feedback')
    .select('id, agent_name, agent_wallet, review, hackathon_argument, rating, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }

  const avgRating = data && data.length > 0
    ? (data.reduce((sum, f) => sum + (f.rating || 0), 0) / data.length).toFixed(1)
    : '0';

  return res.status(200).json({
    feedback: data || [],
    count: data?.length || 0,
    avg_rating: parseFloat(avgRating),
  });
}

/**
 * POST /api/feedback — Submit agent feedback
 * Body: { agent_name, agent_wallet, review, hackathon_argument, rating }
 */
async function handlePostFeedback(req: VercelRequest, res: VercelResponse) {
  const clientIp = getClientIp(req.headers);
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { agent_name, agent_wallet, review, hackathon_argument, rating } = req.body || {};

  if (!agent_name || !review) {
    return res.status(400).json({ error: 'agent_name and review are required' });
  }

  if (review.length < 50) {
    return res.status(400).json({ error: 'Review must be at least 50 characters' });
  }

  if (rating && (rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'Rating must be 1-5' });
  }

  const { data, error } = await supabase
    .from('earn_feedback')
    .insert({
      agent_name,
      agent_wallet: agent_wallet || null,
      review,
      hackathon_argument: hackathon_argument || null,
      rating: rating || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Feedback insert error:', error);
    return res.status(500).json({ error: 'Failed to save feedback' });
  }

  return res.status(201).json({
    success: true,
    message: 'Thank you for your feedback!',
    feedback_id: data.id,
  });
}
