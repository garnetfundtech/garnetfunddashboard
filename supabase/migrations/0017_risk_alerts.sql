-- Risk Alert System — thresholds-as-config, episode tracking, and the breach
-- log the risk framework doc requires. Everything here is additive over the
-- hardcoded defaults in lib/risk-parameters.ts: a missing row means "use the
-- code default," so this ships with zero rows and changes nothing until
-- someone actually edits a threshold.

-- ── Threshold overrides ──────────────────────────────────────────────────
-- One row per limit id that's been tuned away from its code default. Yellow
-- values are the risk manager's to adjust; red values are meant to become
-- committee-ratified and immovable without a vote once that process exists —
-- for now, edits to either are logged the same way and the UI is the only
-- gate.
CREATE TABLE IF NOT EXISTS risk_thresholds (
  limit_id          text        PRIMARY KEY,
  green             numeric,
  yellow            numeric,
  range_green_low   numeric,
  range_green_high  numeric,
  range_yellow_low  numeric,
  range_yellow_high numeric,
  updated_by        uuid        REFERENCES user_profiles(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON risk_thresholds FOR ALL USING (true);

-- ── Threshold change audit ───────────────────────────────────────────────
-- Every edit, permanent. This is what makes "only I can change a threshold"
-- mean something — a framework that can be quietly edited in the moment
-- isn't a framework.
CREATE TABLE IF NOT EXISTS risk_threshold_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_id    text        NOT NULL,
  field       text        NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  uuid        REFERENCES user_profiles(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_threshold_history_limit_idx
  ON risk_threshold_history (limit_id, changed_at DESC);

ALTER TABLE risk_threshold_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON risk_threshold_history FOR ALL USING (true);

-- ── Episode state ────────────────────────────────────────────────────────
-- One row per limit id, tracking its current colored state. This is what
-- makes "one notification per episode, not per check" possible: a status
-- change is a new episode only when it differs from what's stored here.
-- Escalating yellow → red on the same item is a new episode (genuinely new
-- information); the episode resets the moment the item returns to green.
CREATE TABLE IF NOT EXISTS risk_episodes (
  limit_id           text        PRIMARY KEY,
  status             text        NOT NULL,
  entered_at         timestamptz NOT NULL DEFAULT now(),
  last_notified_at   timestamptz,
  -- Net exposure's red state carries a 2-trading-day countdown per the spec;
  -- this is when it expires. Null for every other item.
  countdown_expires_at timestamptz
);

ALTER TABLE risk_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON risk_episodes FOR ALL USING (true);

-- ── Breach log ───────────────────────────────────────────────────────────
-- Every red, permanently. This is the audit trail the bylaws need, and what
-- next year's risk manager inherits instead of reconstructing the reasoning
-- from scratch.
CREATE TABLE IF NOT EXISTS risk_breach_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_id        text        NOT NULL,
  limit_label     text        NOT NULL,
  fired_at        timestamptz NOT NULL DEFAULT now(),
  target          text,
  actual_value    numeric,
  -- Drift = market moved, share counts unchanged, rebalance within 2 days.
  -- Trade = a trade caused it, unwind first and discuss after. Determined by
  -- diffing today's risk_snapshots.positions against the prior day's.
  drift_or_trade  text        CHECK (drift_or_trade IN ('drift', 'trade', 'unknown')),
  resolved_at     timestamptz,
  note            text,
  decided_by      uuid        REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS risk_breach_log_fired_at_idx
  ON risk_breach_log (fired_at DESC);

ALTER TABLE risk_breach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON risk_breach_log FOR ALL USING (true);

-- ── Notification log ─────────────────────────────────────────────────────
-- What was actually sent, to whom-shaped-channel, and when. Separate from
-- the breach log because notifications include the four yellow-notifying
-- items (2, 4, 7, 9), while the breach log is red-only per the framework doc.
CREATE TABLE IF NOT EXISTS risk_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_id    text        NOT NULL,
  status      text        NOT NULL,
  message     text        NOT NULL,
  channel     text        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_notifications_sent_at_idx
  ON risk_notifications (sent_at DESC);

ALTER TABLE risk_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON risk_notifications FOR ALL USING (true);
