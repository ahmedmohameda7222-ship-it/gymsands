-- AW-3B forward-only read-contract and payload-bound corrections.
-- Preserve every row and the released AW-3A marker while making the exact
-- detail FK one-to-one for PostgREST and bounding the public write authority.

do $aw3b_correction_preflight$
declare
  v_marker text;
  v_function record;
  v_function_definition text;
begin
  select migration_version into strict v_marker
  from public.release_schema_compatibility where singleton=true;
  if v_marker<>'20260722161542' then
    raise exception 'AW-3B correction requires the released AW-3A compatibility marker; found %.',v_marker using errcode='55000';
  end if;
  if to_regclass('public.exercise_log_set_details') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is not null then
    raise exception 'AW-3B correction requires the uncorrected structured-set authority.' using errcode='55000';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='active_workout_aw3b_production_hardening'
      and version in ('20260722224500','20260722224246')
  ) then
    raise exception 'AW-3B correction requires the reconciled hardening migration.' using errcode='55000';
  end if;
  select p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as definition
  into strict v_function
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='upsert_workout_set_logs_atomic'
    and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_session_id uuid, p_logs jsonb';
  v_function_definition:=v_function.definition;
  if not v_function.prosecdef
     or v_function.proconfig is distinct from array['search_path=""']::text[]
     or v_function_definition not like '%private.aw3b_core_upsert_workout_set_logs_atomic%'
     or v_function_definition not like '%private.workout_set_detail_snapshot%'
     or v_function_definition not like '%public.assert_workout_actor%'
     or v_function_definition !~* 'for\s+update'
     or not has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'AW-3B correction refused to privatize an unreviewed write authority.' using errcode='55000';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid='public.exercise_log_set_details'::regclass
      and conname='exercise_log_set_details_log_session_key'
  ) or to_regclass('public.exercise_log_set_details_log_session_idx') is null then
    raise exception 'AW-3B correction objects already exist or are partially applied.' using errcode='55000';
  end if;
  if exists (
    select 1 from public.exercise_log_set_details
    group by exercise_log_id,workout_session_id having count(*)>1
  ) then
    raise exception 'AW-3B detail rows violate the intended one-to-one read contract.' using errcode='23505';
  end if;
end
$aw3b_correction_preflight$;

create temporary table aw3b_correction_baseline on commit drop as
select
  (select migration_version from public.release_schema_compatibility where singleton=true) as marker,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(l)::text,'' order by l.id),''),'UTF8'),'sha256'),'hex')
    from public.exercise_logs l) as logs_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.exercise_log_id),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_details d) as details_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text,'' order by s.exercise_log_id,s.segment_order),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_segments s) as segments_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by m.id),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_segment_metric_values m) as segment_metrics_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' order by e.sequence_number,e.id),''),'UTF8'),'sha256'),'hex')
    from public.workout_session_timeline_events e) as timeline_hash;

drop index public.exercise_log_set_details_log_session_idx;
alter table public.exercise_log_set_details
  add constraint exercise_log_set_details_log_session_key
  unique (exercise_log_id,workout_session_id);

drop policy exercise_log_set_details_owner_select on public.exercise_log_set_details;
create policy exercise_log_set_details_owner_select
on public.exercise_log_set_details for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy exercise_log_set_segments_owner_select on public.exercise_log_set_segments;
create policy exercise_log_set_segments_owner_select
on public.exercise_log_set_segments for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy exercise_log_set_segment_metric_values_owner_select
on public.exercise_log_set_segment_metric_values;
create policy exercise_log_set_segment_metric_values_owner_select
on public.exercise_log_set_segment_metric_values for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

alter function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
  rename to aw3b_structured_upsert_workout_set_logs_atomic;
alter function public.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
  set schema private;
revoke all on function private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
from public,anon,authenticated,service_role;

create function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_logs jsonb:=coalesce(p_logs,'[]'::jsonb);
  v_existing_count bigint;
  v_final_count bigint;
  v_result jsonb;
begin
  if jsonb_typeof(v_logs)<>'array' then
    raise exception 'Workout set logs must be an array.' using errcode='23514';
  end if;
  if jsonb_array_length(v_logs)>500 then
    raise exception 'A workout set payload can contain at most 500 logs.' using errcode='22023';
  end if;
  if pg_column_size(v_logs)>16777216 then
    raise exception 'Workout set payload exceeds the 16 MiB limit.' using errcode='22023';
  end if;

  perform public.assert_workout_actor(p_user_id);
  perform 1 from public.workout_sessions
  where id=p_session_id and user_id=p_user_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode='P0002';
  end if;
  select count(*) into v_existing_count
  from public.exercise_logs where workout_session_id=p_session_id;
  if v_existing_count>500 then
    raise exception 'Workout session already exceeds the 500-log limit.' using errcode='23514';
  end if;
  if jsonb_path_exists(v_logs,'$[*].set_details ? (@.source == "backfill")'::jsonpath)
     or jsonb_path_exists(v_logs,'$[*].segments[*] ? (@.source == "backfill")'::jsonpath)
     or jsonb_path_exists(v_logs,'$[*].segments[*].performance_metrics[*] ? (@.source == "backfill")'::jsonpath) then
    raise exception 'Backfill provenance is reserved for forward migration history.' using errcode='42501';
  end if;

  v_result:=private.aw3b_structured_upsert_workout_set_logs_atomic(
    p_user_id,p_session_id,v_logs
  );

  select count(*) into v_final_count
  from public.exercise_logs where workout_session_id=p_session_id;
  if v_final_count>500 then
    raise exception 'A workout session can contain at most 500 set logs.' using errcode='22023';
  end if;
  return v_result;
end
$function$;

revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
from public,anon;
grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
to authenticated,service_role;

do $aw3b_correction_postflight$
declare
  v_baseline aw3b_correction_baseline%rowtype;
  v_hash text;
begin
  select * into strict v_baseline from aw3b_correction_baseline;
  if (select migration_version from public.release_schema_compatibility where singleton=true)<>v_baseline.marker then
    raise exception 'AW-3B correction unexpectedly changed the compatibility marker.' using errcode='23514';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.exercise_log_set_details'::regclass
      and c.conname='exercise_log_set_details_log_session_key'
      and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike 'unique (exercise_log_id, workout_session_id)%'
  ) or to_regclass('public.exercise_log_set_details_log_session_idx') is not null then
    raise exception 'AW-3B one-to-one read constraint or redundant-index cleanup failed.' using errcode='23514';
  end if;
  if to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('service_role','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'AW-3B bounded authority grants are invalid.' using errcode='42501';
  end if;
  if (select count(*) from pg_policies
      where schemaname='public'
        and policyname in (
          'exercise_log_set_details_owner_select',
          'exercise_log_set_segments_owner_select',
          'exercise_log_set_segment_metric_values_owner_select'
        ) and cmd='SELECT' and roles='{authenticated}'::name[])<>3 then
    raise exception 'AW-3B cached owner-read policies are incomplete.' using errcode='42501';
  end if;

  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(l)::text,'' order by l.id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_logs l;
  if v_hash<>v_baseline.logs_hash then raise exception 'AW-3B correction changed exercise logs.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.exercise_log_id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_details d;
  if v_hash<>v_baseline.details_hash then raise exception 'AW-3B correction changed set details.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text,'' order by s.exercise_log_id,s.segment_order),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_segments s;
  if v_hash<>v_baseline.segments_hash then raise exception 'AW-3B correction changed set segments.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by m.id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_segment_metric_values m;
  if v_hash<>v_baseline.segment_metrics_hash then raise exception 'AW-3B correction changed segment metrics.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' order by e.sequence_number,e.id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.workout_session_timeline_events e;
  if v_hash<>v_baseline.timeline_hash then raise exception 'AW-3B correction changed timeline events.' using errcode='23514'; end if;
end
$aw3b_correction_postflight$;

notify pgrst, 'reload schema';
