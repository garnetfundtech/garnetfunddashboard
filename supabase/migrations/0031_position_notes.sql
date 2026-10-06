-- ============================================================
-- 0031: Position notes — why we trimmed, added to, or exited a name
--
-- A short write-up attached to one position, entered from the Risk board.
-- The point is the record: months later, anyone reading the book can see
-- what the fund decided on a name, who wrote it up, and when. `created_at`
-- is the timestamp the board shows, so it is set by the database rather than
-- taken from the browser.
--
-- `symbol` is free text rather than a foreign key: the note has to outlive
-- the position, and a name the fund has fully exited is exactly the one whose
-- notes someone will want to read.
--
-- Same access model as the other risk tables (0023): RLS on, no policy, no
-- grants. Every read and write goes through createAdminClient() in server
-- code, behind the role check in app/(dashboard)/risk/actions.ts.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create table if not exists public.position_notes (
  id          uuid primary key default gen_random_uuid(),
  symbol      text not null,
  action      text not null check (action in ('add', 'trim', 'initiate', 'exit', 'hold', 'other')),
  note        text not null,
  created_by  uuid references public.user_profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists position_notes_symbol_created_idx
  on public.position_notes (symbol, created_at desc);

create index if not exists position_notes_created_idx
  on public.position_notes (created_at desc);

alter table public.position_notes enable row level security;

revoke all on public.position_notes from anon, authenticated;

comment on table public.position_notes is
  'Dated write-ups on why a position was trimmed, added to or exited. Service role only; see 0031.';
