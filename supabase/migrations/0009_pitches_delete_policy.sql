-- Allow deletes on pitches for owners or elevated roles.
-- This matches the authorization enforced in server actions.

create policy "authenticated delete pitches"
on public.pitches
for delete
to authenticated
using (
  analyst_id = (select auth.uid())
  or exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid()) and p.role in ('pm', 'admin', 'developer')
  )
);

