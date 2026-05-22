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

CREATE POLICY "alerts_select" ON stock_alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "alerts_insert" ON stock_alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "alerts_update" ON stock_alerts
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "alerts_delete" ON stock_alerts
  FOR DELETE TO authenticated USING (auth.uid() = created_by);
