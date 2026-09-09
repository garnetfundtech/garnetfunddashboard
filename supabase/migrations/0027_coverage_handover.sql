-- ============================================================
-- 0027: Coverage survives the person who added it
--
-- coverage_tickers.analyst_id was NOT NULL and cascaded on delete, so removing
-- a graduating member silently took every name they covered with them — the
-- one moment a student fund most needs the coverage map intact.
--
-- The column now goes null instead: the ticker stays on the board as
-- unclaimed, and anyone can pick it up (or a PM can hand it to someone).
-- Paired with the transfer actions in app/(dashboard)/coverage/actions.ts.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

alter table public.coverage_tickers alter column analyst_id drop not null;

-- Dropped by lookup rather than by name. The name is
-- coverage_tickers_analyst_id_fkey today, but a "drop constraint if exists"
-- that misses would leave the old ON DELETE CASCADE in place beside the new
-- constraint, and the graduating-member bug would survive this migration
-- silently.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'coverage_tickers'
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = rel.oid and attname = 'analyst_id')
      ]
  loop
    execute format(
      'alter table public.coverage_tickers drop constraint %I', constraint_name
    );
  end loop;
end
$$;

alter table public.coverage_tickers
  add constraint coverage_tickers_analyst_id_fkey
  foreign key (analyst_id) references public.user_profiles (id) on delete set null;

-- coverage_tickers_analyst_ticker_key can't police unclaimed rows: null is
-- distinct from null in a unique index, so two unclaimed AAPLs would both fit.
create unique index if not exists coverage_tickers_unclaimed_ticker_key
  on public.coverage_tickers (ticker)
  where analyst_id is null;

-- ── Claiming ────────────────────────────────────────────────────────────────
-- An unclaimed row has no owner to match on, so the existing update policy
-- would leave it stuck for everyone but a pm/admin. Anyone signed in may take
-- one; the WITH CHECK still decides who they're allowed to hand it to.
drop policy if exists "coverage_tickers_update" on public.coverage_tickers;
create policy "coverage_tickers_update"
on public.coverage_tickers
for update
to authenticated
using (public.can_manage_coverage_ticker(analyst_id) or analyst_id is null)
with check (public.can_manage_coverage_ticker(analyst_id));
