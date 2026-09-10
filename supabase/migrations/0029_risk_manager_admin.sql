-- ============================================================
-- 0029: The Risk Manager administers content, but not membership
--
-- The fund's decision: the Risk Manager should have an administrator's reach
-- over everything except who is in the fund. In the app that is
-- canAdministerContent() vs canAdministerUsers() in lib/roles.ts — the first
-- now includes risk_manager, the second deliberately does not.
--
-- Two database functions encode the same role lists and would otherwise
-- disagree with the app, leaving the Risk Manager able to do a thing in the
-- UI that the database then refuses (or, worse, the reverse):
--
--   can_write_team_sector()   0014 — write into any team's files
--   can_delete_team_folder()  0026 — delete a folder and everything under it
--
-- Nothing here touches user_profiles or any policy governing it, which is
-- what keeps membership out of the Risk Manager's remit at the database
-- level too.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create or replace function public.can_write_team_sector(target_sector text)
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
      and (
        p.role in ('pm', 'risk_manager', 'admin', 'developer')
        or p.coverage_sector = target_sector
      )
  );
$$;

create or replace function public.can_delete_team_folder()
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
      and p.role in ('pm', 'risk_manager', 'admin', 'developer')
  );
$$;

revoke all on function public.can_write_team_sector(text) from public;
grant execute on function public.can_write_team_sector(text) to authenticated;
revoke all on function public.can_delete_team_folder() from public;
grant execute on function public.can_delete_team_folder() to authenticated;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect both to list risk_manager alongside pm/admin/developer.
select
  p.proname,
  pg_get_functiondef(p.oid) like '%risk_manager%' as includes_risk_manager
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_write_team_sector', 'can_delete_team_folder')
order by p.proname;
