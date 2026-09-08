-- Close direct client access to the risk and accounting tables.
--
-- Every one of these tables carried `CREATE POLICY "admin_all" ... FOR ALL
-- USING (true)`. With RLS enabled that reads as "locked down", but the policy
-- grants the check to every role including `anon`, so the publishable key that
-- ships in the page source was enough to read *and write* them. Verified
-- against production before writing this: an unauthenticated client inserted a
-- row into nav_daily and deleted it again.
--
-- What that exposed:
--   risk_config          — the §7 limit table. Raise the sector cap from a
--                          browser console and every monitor turns green.
--   nav_daily            — the NAV series §8 says "cannot be reconstructed
--                          after the fact".
--   risk_alert_episodes  — breach history, including closing an open breach.
--   position_approvals   — §3.4 approval records, the audit trail for sizing.
--   risk_snapshots       — daily positions and P&L for the whole fund.
--   realized_gains,
--   order_history        — trade-level history.
--
-- The fix is simply to stop granting it. Every read and write to these tables
-- goes through `createAdminClient()` in server code — verified across lib/ and
-- app/, with no client component and no browser-side query touching any of
-- them. The service role bypasses RLS, so removing the policy costs the
-- application nothing; the §6 role gate that governs who may write still lives
-- in `requireRiskManager()`, where it can check a profile.
--
-- RLS stays enabled with no policy at all, which denies every non-service
-- role by default. The REVOKE is belt-and-braces: without table grants, a
-- policy added carelessly later still will not open these up on its own.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Wave 1 (0022)
    'risk_config', 'risk_config_history', 'position_approvals',
    'risk_alert_episodes', 'nav_daily', 'stop_loss_events',
    -- Earlier risk and accounting tables carrying the same policy
    'risk_snapshots', 'realized_gains', 'order_history',
    -- Superseded by the Wave 1 tables above, but still holding rows
    'risk_thresholds', 'risk_threshold_history', 'risk_episodes',
    'risk_breach_log', 'risk_notifications'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON public.%I', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END
$$;
