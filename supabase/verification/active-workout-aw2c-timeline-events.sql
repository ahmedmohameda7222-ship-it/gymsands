\set ON_ERROR_STOP on
begin;
set local transaction read only;

create or replace function pg_temp.aw2c_assert(p_condition boolean,p_message text)
returns void language plpgsql as $function$
begin if not coalesce(p_condition,false) then raise exception '%',p_message; end if; end
$function$;

select pg_temp.aw2c_assert(to_regclass('public.workout_session_timeline_events') is not null,'AW-2C timeline table is missing.');
select pg_temp.aw2c_assert(
  (select array_agg(column_name||':'||udt_name||':'||is_nullable order by ordinal_position)
   from information_schema.columns where table_schema='public' and table_name='workout_session_timeline_events') = array[
    'id:uuid:NO','workout_session_id:uuid:NO','user_id:uuid:NO','sequence_number:int8:NO',
    'event_type:text:NO','occurred_at:timestamptz:NO','source:text:NO','command_id:uuid:YES',
    'exercise_log_id:uuid:YES','snapshot_item_id:uuid:YES','payload_version:int2:NO',
    'payload:jsonb:NO','idempotency_key:text:NO','created_at:timestamptz:NO'
  ],'AW-2C timeline column contract differs.');
select pg_temp.aw2c_assert((select relrowsecurity from pg_class where oid='public.workout_session_timeline_events'::regclass),'AW-2C timeline RLS is disabled.');
select pg_temp.aw2c_assert(
  has_table_privilege('authenticated','public.workout_session_timeline_events','SELECT')
  and not has_table_privilege('authenticated','public.workout_session_timeline_events','INSERT')
  and not has_table_privilege('authenticated','public.workout_session_timeline_events','UPDATE')
  and not has_table_privilege('authenticated','public.workout_session_timeline_events','DELETE')
  and not has_table_privilege('anon','public.workout_session_timeline_events','SELECT'),
  'AW-2C timeline ACL is not read-only owner access.');
select pg_temp.aw2c_assert(
  (select count(*)=1 from pg_policy where polrelid='public.workout_session_timeline_events'::regclass and polcmd='r')
  and not exists(select 1 from pg_policy where polrelid='public.workout_session_timeline_events'::regclass and polcmd in ('a','w','d')),
  'AW-2C timeline RLS policies are incorrect.');
select pg_temp.aw2c_assert(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='workout_session_timeline_events_user_time_idx')
  and exists(select 1 from pg_indexes where schemaname='public' and indexname='workout_session_timeline_events_session_sequence_idx')
  and exists(select 1 from pg_indexes where schemaname='public' and indexname='workout_session_timeline_events_command_type_idx'),
  'AW-2C timeline indexes are missing.');
select pg_temp.aw2c_assert(
  not has_function_privilege('authenticated','private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)','EXECUTE')
  and not has_function_privilege('service_role','private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)','EXECUTE'),
  'AW-2C private append helper is exposed.');
select pg_temp.aw2c_assert(
  exists(select 1 from pg_enum where enumtypid='public.workout_session_status'::regtype and enumlabel='cancelled')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='workout_sessions' and column_name='cancelled_at')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='workout_sessions' and column_name='cancel_reason'),
  'AW-2C cancellation schema is incomplete.');
select pg_temp.aw2c_assert(
  exists(select 1 from pg_trigger where tgrelid='public.workout_sessions'::regclass and tgname='workout_sessions_terminal_delete_guard' and tgenabled<>'D'),
  'AW-2C delete compatibility bridge is missing.');
select pg_temp.aw2c_assert(
  (select version='2' and migration_version='20260721224813' from public.release_schema_compatibility where singleton),
  'AW-2C changed the compatibility marker.');
select pg_temp.aw2c_assert(
  not exists(select 1 from public.workout_session_timeline_events event join public.workout_sessions session on session.id=event.workout_session_id where event.user_id<>session.user_id),
  'AW-2C timeline owner mismatch exists.');
select pg_temp.aw2c_assert(
  not exists(select 1 from public.workout_session_timeline_events where source='migration_backfill' and event_type in ('session_paused','session_resumed','rest_started','rest_ended','set_edited','exercise_skipped','session_cancelled')),
  'AW-2C backfill contains unprovable events.');
select pg_temp.aw2c_assert(
  not exists(select 1 from public.workout_session_timeline_events where payload ?| array['ip','ipAddress','userAgent','browserFingerprint','accessToken','refreshToken','databaseCredentials','controllerDeviceId','requestHash','notes']),
  'AW-2C timeline contains forbidden privacy fields.');
select pg_temp.aw2c_assert(
  to_regprocedure('public.cancel_workout_session_atomic(uuid,uuid,text)') is not null
  and to_regprocedure('public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text)') is not null
  and to_regprocedure('public.skip_workout_day_atomic(uuid,uuid,text,text,text)') is not null,
  'AW-2C public authorities are missing.');
select pg_temp.aw2c_assert(
  not exists(
    select 1 from pg_proc p
    where p.oid in (
      to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)'),
      to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)'),
      to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'),
      to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'),
      to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)'),
      to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)'),
      to_regprocedure('public.skip_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text)'),
      to_regprocedure('public.cancel_workout_session_atomic(uuid,uuid,text)'),
      to_regprocedure('public.skip_workout_day_atomic(uuid,uuid,text,text,text)')
    ) and (not p.prosecdef or coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%')
  ),'AW-2C public write authority hardening is incomplete.');
rollback;
