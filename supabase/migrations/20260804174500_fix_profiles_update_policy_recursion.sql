begin;

-- Onboarding completion updates the authenticated user's profile after all
-- onboarding-owned rows have been validated and written. The historical
-- profiles_update_own_basic WITH CHECK queried public.profiles directly from
-- the policy on public.profiles, which makes PostgreSQL recurse into the same
-- RLS policy and reject the statement.
--
-- Keep the original privilege boundary (an owner may update basic fields but
-- may not change their role) through a narrowly scoped SECURITY DEFINER helper.
-- The helper executes as its owner, and profiles does not FORCE ROW LEVEL
-- SECURITY, so its owner-scoped lookup does not recursively evaluate the
-- caller's profiles policy.

create or replace function private.profile_role_unchanged(
  candidate_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = candidate_role
  );
$$;

revoke all on function private.profile_role_unchanged(public.user_role)
  from public, anon;
grant execute on function private.profile_role_unchanged(public.user_role)
  to authenticated, service_role;
grant usage on schema private to authenticated, service_role;

comment on function private.profile_role_unchanged(public.user_role) is
  'RLS helper that confirms an authenticated actor preserves their existing profile role without recursively evaluating profiles policies.';

drop policy if exists profiles_update_own_basic on public.profiles;
create policy profiles_update_own_basic
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
)
with check (
  id = (select auth.uid())
  and private.profile_role_unchanged(role)
);

comment on policy profiles_update_own_basic on public.profiles is
  'Allows authenticated owners to update their profile while preserving the existing role through a non-recursive security-definer check.';

commit;
