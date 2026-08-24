-- Daily book snapshot — the per-position record behind each risk snapshot.
--
-- 0013 stored the day's aggregates (NAV, net, gross, beta) plus the evaluated
-- RiskModel, but the model carries only summaries: the largest position per
-- side and sector totals. It never held the position list itself.
--
-- Two things in the risk spec need per-position share counts and cannot be
-- reconstructed from aggregates after the fact:
--
--   * Drift-vs-trade breach classification, which compares today's share
--     counts against the prior day's to decide whether the market moved or
--     somebody traded. Without yesterday's counts the distinction is lost.
--   * Any position-level history — weights, cost basis, per-name contribution
--     to a breach.
--
-- Reconstructing either from current holdings yields the track record of a
-- portfolio we never owned, so this backfills nothing and starts accumulating
-- from the first run after deploy.

ALTER TABLE risk_snapshots
  ADD COLUMN IF NOT EXISTS positions jsonb,
  ADD COLUMN IF NOT EXISTS position_count integer,
  ADD COLUMN IF NOT EXISTS long_mv numeric,
  ADD COLUMN IF NOT EXISTS short_mv numeric;

COMMENT ON COLUMN risk_snapshots.positions IS
  'Array of {ticker, side, quantity, avgCost, price, marketValue, weight, sector} as of the close. Share counts drive drift-vs-trade breach classification.';

-- Positions are queried by ticker across days when tracing a single name's
-- history through the snapshot series.
CREATE INDEX IF NOT EXISTS risk_snapshots_positions_gin_idx
  ON risk_snapshots USING gin (positions);
