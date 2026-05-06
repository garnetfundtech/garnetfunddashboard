drop policy if exists "authenticated insert research tags" on public.research_tags;
create policy "authenticated insert own research tags"
on public.research_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.research_posts rp
    where rp.id = research_post_id
      and rp.created_by = (select auth.uid())
  )
);

drop policy if exists "developer admin manage profiles" on public.user_profiles;
create policy "developer admin insert profiles"
on public.user_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "developer admin update profiles"
on public.user_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "developer admin delete profiles"
on public.user_profiles
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

drop policy if exists "admins manage resources" on public.resources_files;
create policy "admins insert resources"
on public.resources_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "admins update resources"
on public.resources_files
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "admins delete resources"
on public.resources_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

drop policy if exists "admins manage file permissions" on public.file_permissions;
create policy "admins insert file permissions"
on public.file_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "admins update file permissions"
on public.file_permissions
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "admins delete file permissions"
on public.file_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

drop policy if exists "developer admin manage sync jobs" on public.sync_jobs;
create policy "developer admin insert sync jobs"
on public.sync_jobs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "developer admin update sync jobs"
on public.sync_jobs
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);
create policy "developer admin delete sync jobs"
on public.sync_jobs
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('developer', 'admin')
  )
);

create index if not exists idx_audit_events_actor_id on public.audit_events (actor_id);
create index if not exists idx_file_permissions_resource_file_id on public.file_permissions (resource_file_id);
create index if not exists idx_file_permissions_updated_by on public.file_permissions (updated_by);
create index if not exists idx_research_posts_created_by on public.research_posts (created_by);
create index if not exists idx_research_tags_research_post_id on public.research_tags (research_post_id);
create index if not exists idx_resources_files_created_by on public.resources_files (created_by);
create index if not exists idx_sync_logs_sync_job_id on public.sync_logs (sync_job_id);
