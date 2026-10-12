-- ============================================================
-- 0034: corporate_research_emails — sector and industry, for the sector tabs
--
-- Each research email carries a coverage label above its buttons, e.g.
-- "Industrials Machinery". lib/corporate-research.ts (sectorFromBody) reads
-- it into `sector` ("Industrials") and `industry` ("Machinery"), and the
-- Corporate Research tab groups emails into sector sub-tabs by it.
--
--   sector null  not read yet. The import fills it for new emails; existing
--                rows are filled the first time the page lists them.
--   sector ''    read, and no label was found. Shown under "Other".
--
-- To re-read every email after the parser changes, set sector back to null.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

alter table public.corporate_research_emails
  add column if not exists sector text,
  add column if not exists industry text;
