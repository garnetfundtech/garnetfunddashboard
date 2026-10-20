-- ============================================================
-- 0038: Recruiting as a Resources category
-- ============================================================
-- The Resources library filters by All, Training, Pitch, Meeting Overview and
-- Recruiting. Recruiting files are uploaded like any other resource, so the
-- category has to be one the column accepts.
--
-- Mirrors RESOURCE_CATEGORIES in lib/types.ts. Until this is applied, saving a
-- file as Recruiting is refused by the database.
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

alter type public.file_category add value if not exists 'recruiting';
