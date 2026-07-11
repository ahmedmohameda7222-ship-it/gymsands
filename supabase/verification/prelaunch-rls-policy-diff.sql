-- Capture on the isolated database before and after migrations and diff the JSON output.
select jsonb_agg(to_jsonb(snapshot) order by snapshot.schemaname, snapshot.tablename, snapshot.policyname)
from (
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where schemaname in ('public', 'private')
) snapshot;

select jsonb_agg(to_jsonb(grants_snapshot) order by grants_snapshot.table_schema, grants_snapshot.table_name, grants_snapshot.grantee, grants_snapshot.privilege_type)
from (
  select table_schema, table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
    and grantee in ('anon', 'authenticated', 'service_role')
) grants_snapshot;

select n.nspname as schema_name, p.proname as function_name, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prosecdef
order by n.nspname, p.proname, arguments;
