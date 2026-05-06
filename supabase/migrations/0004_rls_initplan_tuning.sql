drop policy if exists "developer admin insert holdings" on public.holdings_snapshots;
create policy "developer admin insert holdings"
on public.holdings_snapshots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

drop policy if exists "developer admin insert performance" on public.performance_snapshots;
create policy "developer admin insert performance"
on public.performance_snapshots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

drop policy if exists "authenticated create research" on public.research_posts;
create policy "authenticated create research"
on public.research_posts
for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "developer only schwab tokens" on public.schwab_tokens;
create policy "developer only schwab tokens"
on public.schwab_tokens
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'developer'
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'developer'
  )
);

drop policy if exists "developer admin insert sync logs" on public.sync_logs;
create policy "developer admin insert sync logs"
on public.sync_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
