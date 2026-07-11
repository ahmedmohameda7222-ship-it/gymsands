-- Read-only verification. Run after isolated migration application.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'billing_offerings',
    'billing_customers',
    'billing_subscriptions',
    'billing_event_ledger',
    'user_entitlements'
  )
order by tablename;

select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'user_entitlements';

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'billing_offerings',
    'billing_customers',
    'billing_subscriptions',
    'billing_event_ledger',
    'user_entitlements'
  )
order by table_name, grantee, privilege_type;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.billing_offerings'::regclass,
  'public.billing_customers'::regclass,
  'public.billing_subscriptions'::regclass,
  'public.billing_event_ledger'::regclass,
  'public.user_entitlements'::regclass
)
order by table_name::text, conname;

select
  (select count(*) from public.billing_offerings where status = 'approved') as approved_offerings,
  (select count(*) from public.user_entitlements) as entitlement_rows,
  (select count(*) from public.billing_event_ledger) as billing_events;
