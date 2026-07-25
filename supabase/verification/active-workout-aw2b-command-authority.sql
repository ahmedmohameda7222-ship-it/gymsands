\set ON_ERROR_STOP on

begin;

select migration_version as aw2b_marker_baseline
from public.release_schema_compatibility
where singleton
\gset

create or replace function pg_temp.aw2b_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

select pg_temp.aw2b_assert(:'aw2b_marker_baseline' <> '20260722013000',
  'AW-2B verification encountered invalid repository-only compatibility marker.');
select pg_temp.aw2b_assert(to_regclass('public.workout_session_execution_commands') is not null,
  'AW-2B command receipt table is missing.');
select pg_temp.aw2b_assert(
  to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is not null,
  'AW-2B atomic command RPC is missing.');
select pg_temp.aw2b_assert(
  (select prosecdef from pg_proc where oid=to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)')),
  'AW-2B RPC is not SECURITY DEFINER.');
select pg_temp.aw2b_assert(
  coalesce((select array_to_string(proconfig, ',') from pg_proc where oid=to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)')), '') = 'search_path=""',
  'AW-2B RPC search_path is not empty.');
select pg_temp.aw2b_assert(
  (select pg_get_userbyid(proowner) in ('postgres','supabase_admin') from pg_proc where oid=to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)')),
  'AW-2B RPC owner is not trusted.');
select pg_temp.aw2b_assert(
  not has_function_privilege('public','public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)','EXECUTE'),
  'AW-2B RPC ACL is not exact.');
select pg_temp.aw2b_assert(
  has_table_privilege('authenticated','public.workout_session_execution_states','SELECT')
  and not has_table_privilege('authenticated','public.workout_session_execution_states','UPDATE')
  and not has_table_privilege('authenticated','public.workout_session_execution_states','INSERT')
  and not has_table_privilege('authenticated','public.workout_session_execution_states','DELETE'),
  'Authenticated execution-state authority is not read-only.');
select pg_temp.aw2b_assert(
  not has_table_privilege('authenticated','public.workout_session_execution_commands','SELECT')
  and not has_table_privilege('authenticated','public.workout_session_execution_commands','INSERT')
  and not has_table_privilege('authenticated','public.workout_session_execution_commands','UPDATE')
  and not has_table_privilege('authenticated','public.workout_session_execution_commands','DELETE'),
  'Authenticated clients retain direct command-receipt access.');
select pg_temp.aw2b_assert(
  not exists (select 1 from pg_policy where polrelid='public.workout_session_execution_states'::regclass and polcmd='w'),
  'Authenticated execution-state UPDATE policy still exists.');
select pg_temp.aw2b_assert(
  (select relrowsecurity from pg_class where oid='public.workout_session_execution_commands'::regclass),
  'AW-2B command table RLS is disabled.');
select pg_temp.aw2b_assert(
  (select confdeltype='c' from pg_constraint where conrelid='public.workout_session_execution_commands'::regclass and confrelid='public.workout_session_execution_states'::regclass and contype='f'),
  'AW-2B receipts do not cascade with execution state.');
select pg_temp.aw2b_assert(
  (select confdeltype='c' from pg_constraint where conrelid='public.workout_session_execution_commands'::regclass and confrelid='public.profiles'::regclass and contype='f'),
  'AW-2B receipts do not cascade with profiles.');
select pg_temp.aw2b_assert(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_execution_commands_user_idx'),
  'AW-2B command ownership index is missing.');
select pg_temp.aw2b_assert(
  exists (select 1 from pg_trigger where tgrelid='public.workout_session_execution_states'::regclass and tgname='workout_session_execution_states_integrity_guard' and tgenabled<>'D')
  and exists (select 1 from pg_trigger where tgrelid='public.workout_sessions'::regclass and tgname='workout_session_execution_state_terminal_cleanup' and tgenabled<>'D')
  and exists (select 1 from pg_trigger where tgrelid='public.workout_session_muscle_snapshots'::regclass and tgname='workout_session_execution_state_snapshot_initializer' and tgenabled<>'D'),
  'AW-2A lifecycle triggers are not all enabled.');
select pg_temp.aw2b_assert(
  (select version='2' and migration_version=:'aw2b_marker_baseline' from public.release_schema_compatibility where singleton),
  'AW-2B changed the compatibility marker from its transaction baseline.');
select pg_temp.aw2b_assert(
  not exists (
    select 1 from public.workout_sessions session
    left join public.workout_session_execution_states state on state.workout_session_id=session.id
    where session.status='started' and state.workout_session_id is null
  ),
  'An open session is missing execution state.');
select pg_temp.aw2b_assert(
  not exists (
    select 1 from public.workout_session_execution_states state
    join public.workout_sessions session on session.id=state.workout_session_id
    where session.status<>'started' or state.user_id<>session.user_id
  ),
  'Execution-state lifecycle or ownership is inconsistent.');

rollback;
