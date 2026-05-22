-- Combined migrations 0009, 0010, 0011
-- Paste this entire file into Supabase Dashboard → SQL Editor and click Run.

-- ============================================================
-- 0009: Add company_name to research_posts
-- ============================================================
ALTER TABLE research_posts ADD COLUMN IF NOT EXISTS company_name TEXT;

-- ============================================================
-- 0010: Add coverage_sector to user_profiles
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS coverage_sector TEXT;

-- ============================================================
-- 0011: Stock alerts table with RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  company_name TEXT,
  sector TEXT NOT NULL,
  buy_limit NUMERIC,
  sell_limit NUMERIC,
  current_price NUMERIC,
  last_price_check TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  triggered_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_select" ON stock_alerts;
CREATE POLICY "alerts_select" ON stock_alerts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "alerts_insert" ON stock_alerts;
CREATE POLICY "alerts_insert" ON stock_alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "alerts_update" ON stock_alerts;
CREATE POLICY "alerts_update" ON stock_alerts
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "alerts_delete" ON stock_alerts;
CREATE POLICY "alerts_delete" ON stock_alerts
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- ============================================================
-- ONE-TIME: Promote yourself to developer so you can access /admin
-- Replace 'your-email@email.sc.edu' with your actual signup email below.
-- ============================================================
UPDATE user_profiles
SET role = 'developer'
WHERE email = 'your-email@email.sc.edu';

