begin;

-- Forward security correction for production ACL drift discovered during
-- migration-history reconciliation. This migration does not replay
-- 20260712195000_nutrition_target_date_overrides.sql and changes no data.
--
-- PostgreSQL 17 introduces the MAINTAIN table privilege, so it must be
-- revoked explicitly alongside the other non-CRUD privileges.
revoke truncate, trigger, references, maintain
  on table public.user_nutrition_target_date_overrides
  from authenticated;

-- Reassert the intended member contract without changing service-role or
-- owner administration.
grant select, insert, update, delete
  on table public.user_nutrition_target_date_overrides
  to authenticated;

do $acl_contract$
declare
  actual_privileges text[];
  expected_privileges constant text[] := array['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
begin
  select coalesce(array_agg(distinct acl.privilege_type order by acl.privilege_type), '{}'::text[])
  into actual_privileges
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  cross join lateral aclexplode(coalesce(
    relation.relacl,
    acldefault('r', relation.relowner)
  )) acl
  join pg_roles grantee on grantee.oid = acl.grantee
  where namespace.nspname = 'public'
    and relation.relname = 'user_nutrition_target_date_overrides'
    and grantee.rolname = 'authenticated';

  if actual_privileges is distinct from expected_privileges then
    raise exception
      'Authenticated ACL mismatch for public.user_nutrition_target_date_overrides. Expected %, found %.',
      expected_privileges,
      actual_privileges;
  end if;
end
$acl_contract$;

commit;
