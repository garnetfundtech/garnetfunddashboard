-- The Risk Manager is its own seat on the Investment Committee (Gov. III.b),
-- not a flavour of PM: the IPS gives that one person sole edit rights over
-- limits and sole authority to approve position sizing [IPS I.a, IV.c step 5;
-- Spec §6 Access]. A PM who could quietly widen a limit they trade against
-- defeats the point of having the limit.
--
-- Kept in its own migration because `alter type ... add value` cannot run in
-- the same transaction as anything that then uses the new value. Mirrors 0019.
alter type public.app_role add value if not exists 'risk_manager';
