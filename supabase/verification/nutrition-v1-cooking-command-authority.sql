-- Disposable verification for Nutrition V1 Cooking command-authority hardening.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_cooking_authority_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

grant execute on function pg_temp.nv1_cooking_authority_assert(boolean, text) to public;

select pg_temp.nv1_cooking_authority_assert(
  has_table_privilege('authenticated', 'public.nutrition_cooking_sessions', 'SELECT')
  and has_table_privilege('authenticated', 'public.nutrition_cooking_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_sessions', 'DELETE'),
  'Authenticated Cooking Session table privileges bypass or break the canonical command surface.'
);

select pg_temp.nv1_cooking_authority_assert(
  has_table_privilege('authenticated', 'public.nutrition_cooking_action_states', 'SELECT')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_action_states', 'INSERT')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_action_states', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_action_states', 'DELETE'),
  'Authenticated Cooking action-state writes must be RPC-only.'
);

select pg_temp.nv1_cooking_authority_assert(
  has_table_privilege('authenticated', 'public.nutrition_cooking_timers', 'SELECT')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_timers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_timers', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.nutrition_cooking_timers', 'DELETE'),
  'Authenticated Cooking timer writes must be RPC-only.'
);

select pg_temp.nv1_cooking_authority_assert(
  has_table_privilege('service_role', 'public.nutrition_cooking_sessions', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.nutrition_cooking_action_states', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.nutrition_cooking_timers', 'INSERT,UPDATE,DELETE'),
  'Cooking command hardening must not remove trusted service-role maintenance authority.'
);

select pg_temp.nv1_cooking_authority_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nutrition_cooking_sessions'
      and policyname in ('nutrition_cooking_sessions_insert_own', 'nutrition_cooking_sessions_delete_own')
  )
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('nutrition_cooking_action_states', 'nutrition_cooking_timers')
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'Obsolete authenticated Cooking write policies remain after RPC command hardening.'
);

rollback;
