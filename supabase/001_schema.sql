-- ============================================
-- XLMx402earn — Supabase Schema (ISOLATED)
-- Tables prefixed with earn_ to avoid conflicts
-- with existing ASG Card tables
-- ============================================

-- 1. Agents Registry
CREATE TABLE IF NOT EXISTS earn_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    wallet TEXT UNIQUE NOT NULL,
    reg_tx TEXT,
    reg_verified BOOLEAN DEFAULT false,
    total_earned NUMERIC DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earn_agents_wallet ON earn_agents(wallet);
CREATE INDEX IF NOT EXISTS idx_earn_agents_name ON earn_agents(name);

-- 2. Task Submissions
CREATE TABLE IF NOT EXISTS earn_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_title TEXT,
    agent_id TEXT,
    agent_wallet TEXT,
    proof TEXT NOT NULL,
    proof_type TEXT DEFAULT 'text',
    status TEXT DEFAULT 'pending',
    verify_type TEXT,
    verify_reason TEXT,
    verify_score NUMERIC,
    reward_amount NUMERIC,
    reward_asset TEXT DEFAULT 'XLM',
    payout_status TEXT,
    payout_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earn_submissions_agent ON earn_submissions(agent_wallet);
CREATE INDEX IF NOT EXISTS idx_earn_submissions_task ON earn_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_earn_submissions_status ON earn_submissions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_earn_unique_submission ON earn_submissions(task_id, agent_wallet)
  WHERE agent_wallet IS NOT NULL;

-- 3. Payout Log
CREATE TABLE IF NOT EXISTS earn_payouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID REFERENCES earn_submissions(id),
    task_id TEXT,
    agent_wallet TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    asset TEXT DEFAULT 'XLM',
    tx_hash TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earn_payouts_agent ON earn_payouts(agent_wallet);

-- 4. Feedback
CREATE TABLE IF NOT EXISTS earn_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_wallet TEXT,
    agent_name TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Waitlist
CREATE TABLE IF NOT EXISTS earn_waitlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT,
    agent_name TEXT,
    wallet TEXT,
    role TEXT DEFAULT 'agent',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RPC function: increment agent stats after payout
-- ============================================
CREATE OR REPLACE FUNCTION increment_agent_stats(p_wallet TEXT, p_earned NUMERIC)
RETURNS void AS $$
BEGIN
  UPDATE earn_agents SET
    tasks_completed = tasks_completed + 1,
    total_earned = total_earned + p_earned,
    updated_at = now()
  WHERE wallet = p_wallet;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS — Allow service_role full access
-- ============================================
ALTER TABLE earn_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE earn_waitlist ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, but add policies for anon reads
CREATE POLICY "earn_agents_public_read" ON earn_agents FOR SELECT USING (true);
CREATE POLICY "earn_agents_service_write" ON earn_agents FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "earn_submissions_service_all" ON earn_submissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "earn_submissions_public_read" ON earn_submissions FOR SELECT USING (true);

CREATE POLICY "earn_payouts_service_all" ON earn_payouts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "earn_feedback_service_all" ON earn_feedback FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "earn_feedback_public_read" ON earn_feedback FOR SELECT USING (true);

CREATE POLICY "earn_waitlist_service_all" ON earn_waitlist FOR ALL USING (auth.role() = 'service_role');
