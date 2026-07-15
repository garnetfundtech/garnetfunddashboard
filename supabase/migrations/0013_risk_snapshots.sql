-- Daily risk snapshots — the historical backbone for drawdown-from-high,
-- trend tracking, and the monthly board report. One row per calendar day.
CREATE TABLE IF NOT EXISTS risk_snapshots (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_on        date        NOT NULL UNIQUE,
  nav                numeric,
  net_pct            numeric,
  gross_pct          numeric,
  net_beta           numeric,
  var_95             numeric,
  cvar_95            numeric,
  realized_vol       numeric,
  sharpe             numeric,
  drawdown_from_high numeric,
  worst_stress       numeric,
  red_count          integer,
  yellow_count       integer,
  green_count        integer,
  -- Full evaluated RiskModel for the day, so reports can be rebuilt verbatim.
  model              jsonb,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_snapshots_captured_on_idx
  ON risk_snapshots (captured_on DESC);

ALTER TABLE risk_snapshots ENABLE ROW LEVEL SECURITY;

-- Written by the service role (cron / snapshot endpoint); readable app-side.
CREATE POLICY "admin_all" ON risk_snapshots FOR ALL USING (true);
