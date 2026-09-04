-- Risk Dashboard — Wave 1 (Alerts & Position Monitoring, Fund Reporting).
--
-- Backs the build specification dated 9/2/26. Four things live here that the
-- brokerage feed cannot supply and the spec refuses to let us approximate:
--
--   1. risk_config          — Section 7. Every IPS limit as an editable row.
--   2. position_approvals   — Section 3.4. What the Risk Manager records at
--                             approval: size, stop reference, price target,
--                             conditions, assigned analyst, option flags.
--   3. risk_alert_episodes  — Section 4.3. Alerts are episodes, not checks:
--                             ten red days is one row, not ten.
--   4. nav_daily            — Section 8. Volatility, Sharpe and VaR all read
--                             the Fund's own NAV series, which cannot be
--                             reconstructed after the fact.

-- ── Section 7: the configuration table ───────────────────────────────────
-- Rule that overrides everything else in the spec: "Every limit value lives
-- in a single configuration table that the Risk Manager can edit without a
-- code change. Nothing in the IPS is hardcoded."
--
-- Defaults live in lib/risk-config.ts so a fresh database is already correct;
-- a row here is an override of one of those defaults. Numeric limits use
-- num_value; the blackout dates and sector list use json_value.
CREATE TABLE IF NOT EXISTS risk_config (
  key         text        PRIMARY KEY,
  num_value   numeric,
  json_value  jsonb,
  updated_by  uuid        REFERENCES user_profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON risk_config;
CREATE POLICY "admin_all" ON risk_config FOR ALL USING (true);

-- "every change must be logged with a timestamp and a reason (this feeds the
-- Decision Log)". The reason is NOT NULL on purpose: a config change with no
-- stated reason is exactly the change nobody can defend six months later.
CREATE TABLE IF NOT EXISTS risk_config_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  old_value   text,
  new_value   text        NOT NULL,
  reason      text        NOT NULL,
  changed_by  uuid        REFERENCES user_profiles(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_config_history_key_idx
  ON risk_config_history (key, changed_at DESC);

ALTER TABLE risk_config_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON risk_config_history;
CREATE POLICY "admin_all" ON risk_config_history FOR ALL USING (true);

-- ── Section 3.4: the Risk Manager entry form ─────────────────────────────
-- One row per position the Risk Manager has approved. Without it, roughly a
-- third of the Section 4.2 position table has nothing to display and the
-- price-target, defined-risk and option-expiry alerts can never fire.
--
-- Keyed by broker symbol rather than a feed position id because Schwab does
-- not carry a stable one across partial exits and re-entries. `closed_at`
-- lets the same ticker be approved again next semester without destroying
-- this semester's record: the partial unique index below keeps exactly one
-- open approval per symbol.
CREATE TABLE IF NOT EXISTS position_approvals (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol                   text        NOT NULL,
  -- Every position is tagged to exactly one team [IPS II.a, II.b]. Not in the
  -- feed. lib/risk-engine.ts falls back to asset class when this is absent.
  team                     text        CHECK (team IN ('equities', 'alternatives')),
  -- Overrides the GICS mapping when the Risk Manager disagrees with it.
  sector                   text,

  approved_size_pct        numeric,
  approval_date            date,
  approved_by              uuid        REFERENCES user_profiles(id),
  monitoring_conditions    text,

  -- The resting GTC stop the IPS requires at approval [IPS III.d].
  stop_order_confirmed     boolean     NOT NULL DEFAULT false,
  stop_order_ref           text,
  -- Alternatives defined-risk positions carry an explicit dollar max loss.
  defined_risk_max_loss    numeric,

  price_target             numeric,
  analyst_id               uuid        REFERENCES user_profiles(id),

  -- Long-premium options must be thesis-driven; one expiring inside the
  -- approval window needs explicit sign-off before execution [IPS III.b].
  thesis_driven            boolean     NOT NULL DEFAULT false,
  short_expiry_approved    boolean     NOT NULL DEFAULT false,

  -- Section 5.3 gain review: a gain unrelated to the thesis is a judgement
  -- call, so it is a manual flag rather than something we infer.
  gain_unrelated_to_thesis boolean     NOT NULL DEFAULT false,

  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  closed_at                timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS position_approvals_open_symbol_idx
  ON position_approvals (symbol) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS position_approvals_analyst_idx
  ON position_approvals (analyst_id);

ALTER TABLE position_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON position_approvals;
CREATE POLICY "admin_all" ON position_approvals FOR ALL USING (true);

-- ── Section 4.3: the alert log ───────────────────────────────────────────
-- "Alerts are episodes, not checks: an alert opens when a metric crosses into
-- yellow or red and closes when it returns to green. One row per episode. A
-- metric that stays red for ten days generates one row, not ten."
--
-- `subject` is the position symbol for a per-position monitor and NULL for a
-- portfolio-level one, so one open episode exists per (monitor, subject)
-- pair. Superseded risk_episodes (0017), which could only key on the monitor
-- and therefore could not track two positions breaching the same rule.
CREATE TABLE IF NOT EXISTS risk_alert_episodes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id       text        NOT NULL,
  monitor_label    text        NOT NULL,
  subject          text,
  status           text        NOT NULL CHECK (status IN ('yellow', 'red')),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  -- The reading that opened the episode, and the limit it crossed. Frozen at
  -- open: the compliance record has to say what was true when it fired.
  value_at_trigger numeric,
  threshold        text,
  -- Who the Section 4.4 routing table sent it to, or NULL for a yellow (which
  -- never notifies). Stored as sent, not re-derived, so the log stays true
  -- even after the routing rules change.
  notified         text[],
  notified_at      timestamptz,
  -- Peak excursion beyond the limit while the episode was open, for the
  -- Section 5.3 "maximum excursion" column.
  peak_value       numeric,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid        REFERENCES user_profiles(id),
  resolution_note  text
);

-- One open episode per monitor/subject pair. COALESCE because a NULL subject
-- would otherwise slip past a plain unique index every time.
CREATE UNIQUE INDEX IF NOT EXISTS risk_alert_episodes_open_idx
  ON risk_alert_episodes (monitor_id, (COALESCE(subject, ''))) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS risk_alert_episodes_opened_idx
  ON risk_alert_episodes (opened_at DESC);

ALTER TABLE risk_alert_episodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON risk_alert_episodes;
CREATE POLICY "admin_all" ON risk_alert_episodes FOR ALL USING (true);

-- ── Section 8: the daily NAV series ──────────────────────────────────────
-- "Volatility, Sharpe, VaR and beta are all computed from the Fund's own
-- daily NAV series, which cannot be reconstructed after the fact." Separate
-- from risk_snapshots because the Risk Manager's pre-go-live manual log
-- imports here on day one, and because external flows (donations) have to be
-- carried alongside NAV or every return that spans a donation is wrong.
CREATE TABLE IF NOT EXISTS nav_daily (
  captured_on    date        PRIMARY KEY,
  nav            numeric     NOT NULL,
  -- Donations in, disbursements out. Excluded from performance, per §6
  -- Returns: (NAV today − NAV yesterday − net external flows) ÷ NAV yesterday.
  external_flow  numeric     NOT NULL DEFAULT 0,
  source         text        NOT NULL DEFAULT 'broker' CHECK (source IN ('broker', 'manual')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nav_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON nav_daily;
CREATE POLICY "admin_all" ON nav_daily FOR ALL USING (true);

-- ── Section 5.3: stop-loss events and their post-mortems ─────────────────
-- Every automatic stop that fires requires a Senior Analyst post-mortem
-- [IPS V.a], so the event and the post-mortem checkbox live together.
CREATE TABLE IF NOT EXISTS stop_loss_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol                text        NOT NULL,
  detected_at           timestamptz NOT NULL DEFAULT now(),
  side                  text        CHECK (side IN ('long', 'short')),
  quantity              numeric,
  cost_basis            numeric,
  fill_price            numeric,
  realized_loss         numeric,
  pnl_pct               numeric,
  post_mortem_delivered boolean     NOT NULL DEFAULT false,
  post_mortem_by        uuid        REFERENCES user_profiles(id),
  post_mortem_at        timestamptz,
  post_mortem_note      text
);

CREATE INDEX IF NOT EXISTS stop_loss_events_detected_idx
  ON stop_loss_events (detected_at DESC);

ALTER TABLE stop_loss_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON stop_loss_events;
CREATE POLICY "admin_all" ON stop_loss_events FOR ALL USING (true);

-- ── risk_snapshots: the Wave 1 columns ───────────────────────────────────
-- "Store every daily snapshot ... historical figures must be reproducible
-- from stored data, not recomputed from live feeds." The columns below are
-- the ones Tab 2 charts as a time series; the full evaluated model still goes
-- into `model` so any report rebuilds verbatim.
ALTER TABLE risk_snapshots
  ADD COLUMN IF NOT EXISTS equities_pct      numeric,
  ADD COLUMN IF NOT EXISTS alternatives_pct  numeric,
  ADD COLUMN IF NOT EXISTS annualized_vol    numeric,
  ADD COLUMN IF NOT EXISTS var_95_dollars    numeric,
  ADD COLUMN IF NOT EXISTS var_95_pct        numeric,
  ADD COLUMN IF NOT EXISTS margin_debit      numeric,
  ADD COLUMN IF NOT EXISTS cash_pct          numeric,
  ADD COLUMN IF NOT EXISTS max_sector_pct    numeric,
  ADD COLUMN IF NOT EXISTS sector_exposure   jsonb,
  ADD COLUMN IF NOT EXISTS net_theta         numeric,
  ADD COLUMN IF NOT EXISTS net_vega          numeric,
  ADD COLUMN IF NOT EXISTS benchmark_yield   numeric,
  ADD COLUMN IF NOT EXISTS external_flow     numeric;
