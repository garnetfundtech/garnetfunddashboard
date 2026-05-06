create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_tags (
  id uuid primary key default gen_random_uuid(),
  research_post_id uuid not null references public.research_posts (id) on delete cascade,
  ticker text not null
);

create table if not exists public.file_permissions (
  id uuid primary key default gen_random_uuid(),
  resource_file_id uuid not null references public.resources_files (id) on delete cascade,
  can_download boolean not null default false,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.schwab_tokens (
  id text primary key,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text not null default '',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  needs_reauth boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid references public.sync_jobs (id) on delete set null,
  level text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;
alter table public.research_tags enable row level security;
alter table public.file_permissions enable row level security;
alter table public.schwab_tokens enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_logs enable row level security;

create policy "authenticated read audit events"
on public.audit_events
for select
to authenticated
using (true);

create policy "authenticated read research tags"
on public.research_tags
for select
to authenticated
using (true);

create policy "authenticated insert research tags"
on public.research_tags
for insert
to authenticated
with check (true);

create policy "authenticated read file permissions"
on public.file_permissions
for select
to authenticated
using (true);

create policy "admins manage file permissions"
on public.file_permissions
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
);

create policy "developer only schwab tokens"
on public.schwab_tokens
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role = 'developer'
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role = 'developer'
  )
);

create policy "authenticated read sync jobs"
on public.sync_jobs
for select
to authenticated
using (true);

create policy "developer admin manage sync jobs"
on public.sync_jobs
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
);

create policy "authenticated read sync logs"
on public.sync_logs
for select
to authenticated
using (true);

create policy "developer admin insert sync logs"
on public.sync_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
);
