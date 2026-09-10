-- ============================================================
-- 0028: Remember which re-auth warning we already sent
--
-- Schwab caps a refresh token at 7 days and will not extend it: once it
-- lapses, every live figure on the dashboard goes blank until a human walks
-- the OAuth flow again. Nothing warned anyone, so the first sign was always
-- the outage itself.
--
-- /api/schwab/token-alert now mails ahead of the cliff. It runs daily, but a
-- token is inside the warning window for two of those runs, so it needs to
-- remember what it has already said or it would send the same warning every
-- morning. These two columns are that memory:
--
--   reauth_alert_stage    'warning' (expiry approaching) or 'expired'
--   reauth_alert_sent_for the refresh_expires_at that warning was about
--
-- Keying on the expiry rather than on a date is what makes a re-auth reset
-- the alert automatically: a new token carries a new refresh_expires_at, so
-- the pair no longer matches and the next cycle warns afresh. The OAuth
-- callback clears both anyway (app/api/schwab/callback/route.ts) so a re-auth
-- takes effect without waiting for the cron.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

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
-- No trigger stood behind this column and neither the OAuth callback nor the
-- refresh path set it, so /admin reported "last refreshed" as the day the row
-- was first written — months stale while the connection refreshed every 30
-- minutes. The application code now stamps it on both paths; this trigger is
-- the backstop so a future write that forgets cannot make the column lie.
--
-- The correction runs first: the trigger would otherwise overwrite the
-- computed value with now().

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
