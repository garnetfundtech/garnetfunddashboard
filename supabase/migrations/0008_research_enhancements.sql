alter table public.research_posts
  add column if not exists sector text,
  add column if not exists thesis_status text not null default 'active',
  add column if not exists analyst_name text,
  add column if not exists author_override text,
  add column if not exists download_enabled boolean not null default false,
  add column if not exists uploader_role public.app_role;

-- Backfill uploader_role for legacy rows
update public.research_posts
set uploader_role = coalesce(uploader_role, 'analyst'::public.app_role)
where uploader_role is null;

alter table public.research_posts
  drop constraint if exists research_posts_thesis_status_check;

alter table public.research_posts
  add constraint research_posts_thesis_status_check
  check (thesis_status in ('active', 'under_review', 'became_position', 'rejected'));
