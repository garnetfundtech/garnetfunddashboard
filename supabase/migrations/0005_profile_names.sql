alter table public.user_profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.user_profiles
set first_name = split_part(full_name, ' ', 1),
    last_name = nullif(trim(replace(full_name, split_part(full_name, ' ', 1), '')), '')
where full_name is not null
  and (first_name is null or last_name is null);
