create extension if not exists "pgcrypto";

create type public.app_role as enum ('developer', 'admin', 'analyst');
create type public.file_category as enum ('research', 'training', 'pitch', 'playbook');

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text,
  role public.app_role not null default 'analyst',
  created_at timestamptz not null default now()
);

create table if not exists public.holdings_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  ticker text not null,
  company_name text not null,
  sector text not null,
  market_value numeric(18, 2) not null,
  weight numeric(7, 4) not null
);

create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  portfolio_value numeric(12, 4) not null,
  benchmark_value numeric(12, 4) not null
);

create table if not exists public.research_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  ticker text,
  confidence text,
  file_path text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.resources_files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category public.file_category not null,
  file_path text not null,
  download_enabled boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.holdings_snapshots enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.research_posts enable row level security;
alter table public.resources_files enable row level security;

create policy "authenticated read profiles"
on public.user_profiles
for select
to authenticated
using (true);

create policy "developer admin manage profiles"
on public.user_profiles
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

create policy "authenticated read holdings"
on public.holdings_snapshots
for select
to authenticated
using (true);

create policy "developer admin insert holdings"
on public.holdings_snapshots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
);

create policy "authenticated read performance"
on public.performance_snapshots
for select
to authenticated
using (true);

create policy "developer admin insert performance"
on public.performance_snapshots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.role in ('developer', 'admin')
  )
);

create policy "authenticated read research"
on public.research_posts
for select
to authenticated
using (true);

create policy "authenticated create research"
on public.research_posts
for insert
to authenticated
with check (created_by = auth.uid());

create policy "admins manage resources"
on public.resources_files
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

create policy "authenticated read resources"
on public.resources_files
for select
to authenticated
using (true);
