-- Senior analysts keep the coverage map: they may add, remove and hand over
-- any coverage ticker. Everywhere else they are analysts.
--
-- Kept in its own migration because `alter type ... add value` cannot run in
-- the same transaction as anything that then uses the new value. Mirrors 0021.
-- Run this one first, then 0037.
alter type public.app_role add value if not exists 'senior_analyst';
