-- ============================================================
-- 0032: Meeting overviews — the Resources page's write-up of each meeting
--
-- One row per meeting: the date it was held, a title, and a free-text
-- overview of what was covered and decided. Shown newest meeting first on the
-- Meeting Overview tab of /resources.
--
-- `author_role` is recorded at write time for the same reason
-- resources_files.uploader_role is: edit and delete rights follow
-- canManageContent() (the author, or anyone senior to the author's role).
--
-- Same access model as the risk tables (0023): RLS on, no policy, no grants.
-- Every read and write goes through createAdminClient() in server code, after
-- requireApprovedProfile() has checked the viewer is a member.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create table if not exists public.meeting_overviews (
  id            uuid primary key default gen_random_uuid(),
  meeting_date  date not null,
  title         text not null,
  overview      text not null,
  created_by    uuid references public.user_profiles(id) on delete set null,
  author_role   text not null default 'analyst',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists meeting_overviews_date_idx
  on public.meeting_overviews (meeting_date desc, created_at desc);

alter table public.meeting_overviews enable row level security;

revoke all on public.meeting_overviews from anon, authenticated;

comment on table public.meeting_overviews is
  'Written overviews of fund meetings, for the Resources page. Service role only; see 0032.';
