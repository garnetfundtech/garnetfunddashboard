-- ============================================================
-- 0035: corporate_research_emails — the report PDF, fetched from the portal
--
-- Truist research emails carry a "PDF" link to the report on BlueMatrix, the
-- platform Truist distributes through. The import follows that link and
-- stores the PDF in the private corporate-research bucket as one more entry
-- of `attachments`, so members read the report in the in-page viewer instead
-- of someone downloading it and posting it by hand. See
-- lib/corporate-research-pdf.ts.
--
--   pdf_status null      not tried yet. Covers every email stored before
--                        0035, so the import fills those in over a few runs.
--   pdf_status 'saved'   the PDF is in `attachments`.
--   pdf_status 'none'    the email has no PDF link (macro notes, events).
--   pdf_status 'failed'  the link did not give a PDF. Tried again on later
--                        runs until pdf_attempts reaches 3.
--
-- To try every email again, set pdf_status back to null and pdf_attempts to 0.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

alter table public.corporate_research_emails
  add column if not exists pdf_status text,
  add column if not exists pdf_attempts integer not null default 0;
