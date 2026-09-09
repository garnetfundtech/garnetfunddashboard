-- ============================================================
-- 0026: Folder deletes are pm/admin/developer only
--
-- The app stopped letting a team's own members delete folders (see
-- canDeleteFolder in lib/team-files.ts): a folder delete cascades to every
-- file beneath it, so one wrong click could remove a season of a team's work.
--
-- 0014 gave team_folders the same delete policy as every other write —
-- can_write_team_sector — which left the database more permissive than the
-- app. This narrows it so both layers say the same thing. Uploads, folder
-- creation and renames are unchanged and still run on the team check.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- ============================================================

create or replace function public.can_delete_team_folder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role in ('pm', 'admin', 'developer')
  );
$$;

revoke all on function public.can_delete_team_folder() from public;
grant execute on function public.can_delete_team_folder() to authenticated;

drop policy if exists "team_folders_delete" on public.team_folders;
create policy "team_folders_delete"
on public.team_folders
for delete
to authenticated
using (public.can_delete_team_folder());

-- team_files rows are removed by the folder cascade, which runs as the
-- deleting user — but the cascade is a foreign key action and is not subject
-- to the child table's RLS, so no matching change is needed there. Direct
-- file deletes keep their existing policy.
