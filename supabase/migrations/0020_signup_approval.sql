-- Self-signup with an admin gate: anyone with a USC address can create an
-- account, but it grants nothing until an admin approves it.

do $$ begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

-- Added with default 'approved' so every account that already had access keeps
-- it, then the default flips to 'pending' for everyone created from here on.
-- Splitting it this way also makes the migration safe to re-run: it can never
-- retroactively approve someone who is genuinely waiting.
alter table public.user_profiles
  add column if not exists status public.approval_status not null default 'approved';

alter table public.user_profiles
  alter column status set default 'pending';

alter table public.user_profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id);

create index if not exists user_profiles_status_idx on public.user_profiles (status);
