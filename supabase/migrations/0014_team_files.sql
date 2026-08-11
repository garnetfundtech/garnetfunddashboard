-- ============================================================
-- 0014: Team file workspace — nested folders per coverage sector
--
-- Top-level "teams" are the GICS coverage sectors already used by
-- user_profiles.coverage_sector and /coverage. Folders nest arbitrarily deep
-- inside a sector (e.g. Technology > Apple), and every file lives either at a
-- sector root (folder_id null) or inside one folder.
--
-- Access model: every authenticated user can READ every sector. Writes are
-- limited to your own coverage_sector; pm/admin/developer may write anywhere.
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create table if not exists public.team_folders (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  parent_id uuid references public.team_folders (id) on delete cascade,
  name text not null,
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_folders_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.team_files (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  folder_id uuid references public.team_folders (id) on delete cascade,
  title text not null,
  file_path text not null,
  file_size bigint,
  mime_type text,
  download_enabled boolean not null default true,
  created_by uuid references public.user_profiles (id) on delete set null,
  uploader_name text,
  uploader_role public.app_role not null default 'analyst',
  created_at timestamptz not null default now(),
  constraint team_files_title_not_blank check (length(btrim(title)) > 0)
);

-- Sibling folder names are unique, case-insensitively. Split into two partial
-- indexes because a plain unique constraint would treat every null parent_id
-- (i.e. every sector root) as distinct and allow duplicate top-level names.
create unique index if not exists team_folders_root_name_key
  on public.team_folders (sector, lower(name))
  where parent_id is null;

create unique index if not exists team_folders_child_name_key
  on public.team_folders (parent_id, lower(name))
  where parent_id is not null;

create index if not exists team_folders_parent_idx
  on public.team_folders (parent_id);
create index if not exists team_folders_sector_idx
  on public.team_folders (sector);
create index if not exists team_files_folder_idx
  on public.team_files (folder_id);
create index if not exists team_files_sector_idx
  on public.team_files (sector);

-- ── Integrity: a child folder always carries its parent's sector ────────────
create or replace function public.team_folders_inherit_sector()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_sector text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select sector into parent_sector
  from public.team_folders
  where id = new.parent_id;

  if parent_sector is null then
    raise exception 'parent folder % not found', new.parent_id;
  end if;

  -- Silently adopt rather than reject: keeps the tree consistent even if a
  -- caller passes a stale sector alongside a valid parent.
  new.sector := parent_sector;
  return new;
end;
$$;

drop trigger if exists team_folders_inherit_sector_trg on public.team_folders;
create trigger team_folders_inherit_sector_trg
  before insert or update of parent_id, sector on public.team_folders
  for each row execute function public.team_folders_inherit_sector();

-- ── Integrity: a file always carries its folder's sector ────────────────────
create or replace function public.team_files_inherit_sector()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_sector text;
begin
  if new.folder_id is null then
    return new;
  end if;

  select sector into folder_sector
  from public.team_folders
  where id = new.folder_id;

  if folder_sector is null then
    raise exception 'folder % not found', new.folder_id;
  end if;

  new.sector := folder_sector;
  return new;
end;
$$;

drop trigger if exists team_files_inherit_sector_trg on public.team_files;
create trigger team_files_inherit_sector_trg
  before insert or update of folder_id, sector on public.team_files
  for each row execute function public.team_files_inherit_sector();

-- ── Write gate: own sector, or any sector for pm/admin/developer ────────────
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
        p.role in ('pm', 'admin', 'developer')
        or p.coverage_sector = target_sector
      )
  );
$$;

revoke all on function public.can_write_team_sector(text) from public;
grant execute on function public.can_write_team_sector(text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.team_folders enable row level security;
alter table public.team_files enable row level security;

drop policy if exists "team_folders_select" on public.team_folders;
create policy "team_folders_select"
on public.team_folders
for select
to authenticated
using (true);

drop policy if exists "team_folders_insert" on public.team_folders;
create policy "team_folders_insert"
on public.team_folders
for insert
to authenticated
with check (public.can_write_team_sector(sector));

drop policy if exists "team_folders_update" on public.team_folders;
create policy "team_folders_update"
on public.team_folders
for update
to authenticated
using (public.can_write_team_sector(sector))
with check (public.can_write_team_sector(sector));

drop policy if exists "team_folders_delete" on public.team_folders;
create policy "team_folders_delete"
on public.team_folders
for delete
to authenticated
using (public.can_write_team_sector(sector));

drop policy if exists "team_files_select" on public.team_files;
create policy "team_files_select"
on public.team_files
for select
to authenticated
using (true);

drop policy if exists "team_files_insert" on public.team_files;
create policy "team_files_insert"
on public.team_files
for insert
to authenticated
with check (public.can_write_team_sector(sector));

drop policy if exists "team_files_update" on public.team_files;
create policy "team_files_update"
on public.team_files
for update
to authenticated
using (public.can_write_team_sector(sector))
with check (public.can_write_team_sector(sector));

drop policy if exists "team_files_delete" on public.team_files;
create policy "team_files_delete"
on public.team_files
for delete
to authenticated
using (public.can_write_team_sector(sector));
