-- Faculty advisors are neither students nor staff of the fund: they need the
-- same read access as an analyst, but they are not analysts and shouldn't be
-- counted or filtered as one. Mirrors 0007's pattern for adding 'pm'.
alter type public.app_role add value if not exists 'faculty';
