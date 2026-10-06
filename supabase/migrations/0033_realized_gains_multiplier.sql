-- ============================================================
-- 0033: realized_gains — price multiplier, so bonds and options are in dollars
--
-- gain_loss was (fill_price − cost_basis) × shares_sold. Prices are quoted in
-- each instrument's own convention: a Treasury per 100 of par on a $1,000
-- unit, an option per share on a 100-share contract. So a bond sold at a
-- $600 loss was recorded as a $60 loss. `multiplier` converts the quoted
-- price to dollars per unit (1 for stock, 10 for a bond, 100 for an option)
-- and gain_loss now includes it. lib/realized-gains.ts sets it per sale.
--
-- A generated column's expression cannot be altered in place, so gain_loss is
-- dropped and re-added. Existing rows get multiplier 1, which is what they
-- were computed with; the next sync recomputes the ones in its window.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

alter table public.realized_gains
  add column if not exists multiplier numeric not null default 1;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'realized_gains'
      and column_name = 'gain_loss'
      and generation_expression ilike '%multiplier%'
  ) then
    alter table public.realized_gains drop column if exists gain_loss;
    alter table public.realized_gains
      add column gain_loss numeric
      generated always as ((fill_price - cost_basis) * shares_sold * multiplier) stored;
  end if;
end $$;
