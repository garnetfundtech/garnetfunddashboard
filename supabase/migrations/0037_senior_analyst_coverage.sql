-- ============================================================
-- 0037: Coverage is edited by senior analysts and above
-- ============================================================
-- Until now anyone could add a ticker and remove or hand over their own, and
-- anyone could claim an unclaimed row. Coverage is now kept by senior
-- analysts, PMs, the Risk Manager and admins; analysts read it only.
--
-- Mirrors canEditCoverage in lib/roles.ts. Needs 0036 applied first.
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

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
      and p.role in ('senior_analyst', 'pm', 'risk_manager', 'admin', 'developer')
  );
$$;

revoke all on function public.can_manage_coverage_ticker(uuid) from public;
grant execute on function public.can_manage_coverage_ticker(uuid) to authenticated;

-- 0027 let anyone take an unclaimed row. Claiming is now an edit like any
-- other, so the extra `or analyst_id is null` goes.
drop policy if exists "coverage_tickers_update" on public.coverage_tickers;
create policy "coverage_tickers_update"
on public.coverage_tickers
for update
to authenticated
using (public.can_manage_coverage_ticker(analyst_id))
with check (public.can_manage_coverage_ticker(analyst_id));
