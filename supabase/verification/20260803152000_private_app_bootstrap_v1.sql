-- Read-only catalog verification for PCS-2. Behavioral owner-isolation is covered by the focused integration test.

select
  routine_name,
  data_type,
  security_type,
  external_language,
  routine_definition is not null as has_definition
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'get_private_app_bootstrap_v1';

select
  p.proname,
  p.pronargs,
  p.provolatile,
  p.prosecdef,
  pg_get_function_result(p.oid) as result_type,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_private_app_bootstrap_v1';
