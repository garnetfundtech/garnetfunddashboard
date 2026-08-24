-- Persisted order history — the orders page previously pulled the full window
-- live from Schwab on every cold cache (two sequential API calls, up to 120
-- days), which is what made it slow to load. Historical fills never change
-- once filled, so there is no reason to keep re-fetching them: backfill once,
-- then append only what's new.
CREATE TABLE IF NOT EXISTS order_history (
  order_id    text        PRIMARY KEY,
  ticker      text        NOT NULL,
  side        text        NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity    numeric     NOT NULL,
  fill_price  numeric     NOT NULL,
  status      text        NOT NULL,
  order_time  timestamptz NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_history_order_time_idx
  ON order_history (order_time DESC);

ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;

-- Written by the service role (sync cron / backfill endpoint); readable app-side.
CREATE POLICY "admin_all" ON order_history FOR ALL USING (true);
