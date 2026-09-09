-- ============================================================
-- 0025: Coverage tickers — the names each person actually covers
--
-- Until now /coverage inferred a sector's ticker list from research_posts, so
-- a name you were working on didn't appear anywhere until you had uploaded a
-- write-up on it. This table lets anyone add the tickers they cover directly.
--
-- A row is owned by the person who added it (analyst_id) and tagged with a
-- coverage team (see lib/sectors.ts). Reads are open to every signed-in user —
-- the coverage map is fund-wide, same as team files — and a row may be edited
-- or removed by its owner, or by pm/admin/developer.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create table if not exists public.coverage_tickers (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  company_name text,
  sector text not null,
  analyst_id uuid not null references public.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Stored already-normalized so the unique index below is a plain equality
  -- match and every reader can compare without lowering/uppering first.
  constraint coverage_tickers_ticker_normalized
    check (ticker = upper(ticker) and ticker = btrim(ticker)),
  constraint coverage_tickers_ticker_length
    check (length(ticker) between 1 and 12)
);

-- One row per person per ticker. Two people may cover the same name — that is
-- shared coverage, not a duplicate — so the uniqueness is per analyst.
create unique index if not exists coverage_tickers_analyst_ticker_key
  on public.coverage_tickers (analyst_id, ticker);

create index if not exists coverage_tickers_sector_idx
  on public.coverage_tickers (sector);
create index if not exists coverage_tickers_ticker_idx
  on public.coverage_tickers (ticker);

-- ── Write gate: your own rows, or anyone's for pm/admin/developer ───────────
create or replace function public.can_manage_coverage_ticker(target_analyst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and (p.role in ('pm', 'admin', 'developer') or p.id = target_analyst)
  );
$$;

revoke all on function public.can_manage_coverage_ticker(uuid) from public;
grant execute on function public.can_manage_coverage_ticker(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.coverage_tickers enable row level security;

drop policy if exists "coverage_tickers_select" on public.coverage_tickers;
create policy "coverage_tickers_select"
on public.coverage_tickers
for select
to authenticated
using (true);

drop policy if exists "coverage_tickers_insert" on public.coverage_tickers;
create policy "coverage_tickers_insert"
on public.coverage_tickers
for insert
to authenticated
with check (public.can_manage_coverage_ticker(analyst_id));

drop policy if exists "coverage_tickers_update" on public.coverage_tickers;
create policy "coverage_tickers_update"
on public.coverage_tickers
for update
to authenticated
using (public.can_manage_coverage_ticker(analyst_id))
with check (public.can_manage_coverage_ticker(analyst_id));

drop policy if exists "coverage_tickers_delete" on public.coverage_tickers;
create policy "coverage_tickers_delete"
on public.coverage_tickers
for delete
to authenticated
using (public.can_manage_coverage_ticker(analyst_id));
