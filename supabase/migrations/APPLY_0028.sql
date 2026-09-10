-- ============================================================
-- APPLY_0028 — everything the Schwab re-auth reminder needs.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Idempotent: safe to run again, and safe to run twice by accident.
--
-- Verified against the live project before writing this: migrations 0013,
-- 0016, 0017, 0018, 0020, 0022 and 0025–0027 are already applied, so 0028 is
-- the only outstanding change the deployed code depends on.
--
-- The direct-to-storage upload work needs NO schema change — it uses the
-- existing team_files table and the buckets' existing 20 MB limits.
--
-- Scroll to the bottom for a verification query.
-- ============================================================

-- ── 0028: remember which re-auth warning we already sent ───────────────────
--
-- Schwab caps a refresh token at 7 days and will not extend it: once it
-- lapses, every live figure on the dashboard goes blank until a human walks
-- the OAuth flow again. Nothing warned anyone, so the first sign was always
-- the outage itself.
--
-- /api/schwab/token-alert now mails ahead of the cliff. It runs daily, but a
-- token sits inside the 48-hour warning window for two of those runs, so it
-- has to remember what it already said or it would send the same warning
-- every morning until someone acted — which is how an alert stops being read.
--
--   reauth_alert_stage    'warning' (expiry approaching) or 'expired'
--   reauth_alert_sent_for the refresh_expires_at that warning was about
--
-- Keying on the expiry rather than on a date is what makes a re-auth reset
-- the alert automatically: a new token carries a new refresh_expires_at, so
-- the pair no longer matches and the next cycle warns afresh. The OAuth
-- callback clears both as well, so a re-auth takes effect immediately instead
-- of waiting for the next cron.

alter table public.schwab_tokens
  add column if not exists reauth_alert_stage text,
  add column if not exists reauth_alert_sent_for timestamptz;

-- Only the two stages the alert actually sends. Null is the healthy state:
-- either nothing has been sent, or a re-auth cleared it.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schwab_tokens_reauth_alert_stage_check'
  ) then
    alter table public.schwab_tokens
      add constraint schwab_tokens_reauth_alert_stage_check
      check (reauth_alert_stage in ('warning', 'expired'));
  end if;
end $$;

comment on column public.schwab_tokens.reauth_alert_stage is
  'Stage of the last re-auth email sent for this token: warning | expired | null (none/reset).';
comment on column public.schwab_tokens.reauth_alert_sent_for is
  'The refresh_expires_at that reauth_alert_stage refers to. A new token clears both.';

-- ── updated_at was never being maintained ──────────────────────────────────
--
-- There is no trigger behind this column, and neither the OAuth callback nor
-- the token-refresh path was setting it, so /admin reported "last refreshed"
-- as the day the row was first written — four months stale on this project
-- while the connection had in fact been refreshing every 30 minutes.
--
-- The application code now stamps it on both paths. This trigger is the
-- backstop, so any future write that forgets cannot make the column lie
-- again.

-- One-time correction so the panel stops showing May. Uses the access token's
-- own expiry as the best available evidence of when the row was last touched:
-- expires_at is written on every refresh, and a Schwab access token lives 30
-- minutes, so expires_at minus 30 minutes is close to the real moment.
--
-- Deliberately runs BEFORE the trigger is created. The trigger sets
-- updated_at = now() on every update, so with it already in place this
-- statement's computed value would be overwritten by now() and the
-- calculation would be pointless.
update public.schwab_tokens
set updated_at = greatest(updated_at, expires_at - interval '30 minutes')
where updated_at < expires_at - interval '1 day';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists schwab_tokens_touch_updated_at on public.schwab_tokens;
create trigger schwab_tokens_touch_updated_at
  before update on public.schwab_tokens
  for each row
  execute function public.touch_updated_at();

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect: two new columns listed, one trigger, and a token row whose
-- reauth_alert_stage is null (nothing sent yet) with a sane updated_at.

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'schwab_tokens'
      and column_name in ('reauth_alert_stage', 'reauth_alert_sent_for')) as new_columns_found,
  (select count(*) from pg_trigger
    where tgname = 'schwab_tokens_touch_updated_at') as trigger_found,
  (select reauth_alert_stage from public.schwab_tokens where id = 'trader') as alert_stage,
  (select refresh_expires_at from public.schwab_tokens where id = 'trader') as refresh_expires_at,
  (select updated_at from public.schwab_tokens where id = 'trader') as updated_at;
