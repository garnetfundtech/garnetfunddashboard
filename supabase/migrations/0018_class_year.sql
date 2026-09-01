-- Class standing for fund members (Freshman .. Graduate, plus Alumni for
-- members who have graduated but still hold an account). Free-form text rather
-- than an enum so the roster can absorb a new value without a migration.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS class_year TEXT;
