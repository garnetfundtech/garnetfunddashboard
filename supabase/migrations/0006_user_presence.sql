create table if not exists public.user_presence (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_user_presence_last_seen_at on public.user_presence (last_seen_at);

alter table public.user_presence enable row level security;

create policy "authenticated read presence"
on public.user_presence
for select
to authenticated
using (true);

create policy "users insert own presence"
on public.user_presence
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "users update own presence"
on public.user_presence
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
