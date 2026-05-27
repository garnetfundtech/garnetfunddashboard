-- Track realized P&L from closed/sold positions
CREATE TABLE IF NOT EXISTS realized_gains (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker      text        NOT NULL,
  shares_sold numeric     NOT NULL,
  fill_price  numeric     NOT NULL,
  cost_basis  numeric     NOT NULL,
  gain_loss   numeric     GENERATED ALWAYS AS ((fill_price - cost_basis) * shares_sold) STORED,
  filled_at   timestamptz NOT NULL,
  order_id    text        UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE realized_gains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON realized_gains FOR ALL USING (true);

-- Add cost-basis columns to holdings_snapshots so future syncs can supply
-- avg_cost for realized-gain computation when a position later disappears
ALTER TABLE holdings_snapshots
  ADD COLUMN IF NOT EXISTS avg_cost numeric,
  ADD COLUMN IF NOT EXISTS quantity  numeric;
