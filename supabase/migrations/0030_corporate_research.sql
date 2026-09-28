-- ============================================================
-- 0030: Corporate Research — sell-side emails imported from the fund's inbox
--
-- Truist (and later BofA) send research to a Gmail inbox the fund controls.
-- /api/corporate-research/sync logs into that inbox over IMAP, picks out the
-- messages from each firm, and stores every email as one row here. The
-- Corporate Research tab reads them back and shows each one inside the
-- dashboard, with no download link: the research is licensed to the fund,
-- and passing the file around is exactly what the page is built not to do.
--
-- One row per email. `firm` is the slug from lib/corporate-research.ts, so a
-- new firm is a code change and never a schema change. `message_id` is the
-- email's own Message-ID header and is what keeps a re-run of the import from
-- storing the same email twice.
--
-- Attachments, when a firm sends any, live in the private
-- `corporate-research` storage bucket; `attachments` lists them as
-- [{ name, contentType, size, path }] in the order the email carried them.
--
-- Same access model as the risk tables (0023): RLS on, no policy, no grants.
-- Every read and write goes through createAdminClient() in server code, after
-- requireApprovedProfile() has checked the viewer is a member.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create table if not exists public.corporate_research_emails (
  id           uuid primary key default gen_random_uuid(),
  firm         text not null,
  message_id   text not null,
  from_name    text,
  from_address text,
  subject      text not null default '',
  received_at  timestamptz not null,
  html_body    text,
  text_body    text,
  attachments  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create unique index if not exists corporate_research_emails_message_id_key
  on public.corporate_research_emails (message_id);

-- The page lists one firm at a time, newest first.
create index if not exists corporate_research_emails_firm_received_idx
  on public.corporate_research_emails (firm, received_at desc);

alter table public.corporate_research_emails enable row level security;

revoke all on public.corporate_research_emails from anon, authenticated;

comment on table public.corporate_research_emails is
  'Sell-side research emails imported from the fund inbox. Service role only; see 0030.';
