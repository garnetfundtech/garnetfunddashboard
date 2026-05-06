-- PM role for portfolio managers
alter type public.app_role add value if not exists 'pm';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'pitch_stage' and n.nspname = 'public'
  ) then
    create type public.pitch_stage as enum (
      'idea',
      'in_research',
      'pitched',
      'voted',
      'position',
      'rejected'
    );
  end if;
end$$;

create table if not exists public.pitches (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  analyst_id uuid not null references public.user_profiles (id) on delete cascade,
  thesis text not null default '',
  stage public.pitch_stage not null default 'idea',
  research_id uuid references public.research_posts (id) on delete set null,
  position_symbol text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pitches_analyst_id on public.pitches (analyst_id);
create index if not exists idx_pitches_stage on public.pitches (stage);
create index if not exists idx_pitches_research_id on public.pitches (research_id);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  added_by uuid not null references public.user_profiles (id) on delete cascade,
  pitch_id uuid references public.pitches (id) on delete set null,
  analyst_target text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_watchlist_items_added_by on public.watchlist_items (added_by);
create index if not exists idx_watchlist_items_pitch_id on public.watchlist_items (pitch_id);

alter table public.pitches enable row level security;
alter table public.watchlist_items enable row level security;

create policy "authenticated read pitches"
on public.pitches
for select
to authenticated
using (true);

create policy "authenticated insert own pitches"
on public.pitches
for insert
to authenticated
with check (analyst_id = (select auth.uid()));

-- Updates: owner or PM/admin/developer. Terminal stage transitions are enforced in server actions.
create policy "authenticated update pitches"
on public.pitches
for update
to authenticated
using (
  analyst_id = (select auth.uid())
  or exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('pm', 'admin', 'developer')
  )
)
with check (true);

create policy "authenticated read watchlist"
on public.watchlist_items
for select
to authenticated
using (true);

create policy "authenticated insert watchlist"
on public.watchlist_items
for insert
to authenticated
with check (added_by = (select auth.uid()));

create policy "authenticated update own watchlist"
on public.watchlist_items
for update
to authenticated
using (
  added_by = (select auth.uid())
  or exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('pm', 'admin', 'developer')
  )
)
with check (true);

create policy "authenticated delete own watchlist"
on public.watchlist_items
for delete
to authenticated
using (
  added_by = (select auth.uid())
  or exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('pm', 'admin', 'developer')
  )
);
