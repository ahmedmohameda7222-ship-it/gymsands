-- AW-3B final logic hardening.
-- Forward-only correction. Preserves all user rows and the released AW-3A marker.
-- This migration establishes actor-bound structured provenance and makes the
-- public set RPC the final timeline authority after the complete set graph exists.

do $aw3b_final_preflight$
declare
  v_marker text;
  v_definition text;
begin
  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton = true;

  if v_marker <> '20260722161542' then
    raise exception 'AW-3B final hardening requires released AW-3A marker 20260722161542; found %.',
      v_marker using errcode = '55000';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'active_workout_aw3b_structured_set_details'
      and version in ('20260722210312','20260722223426')
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'active_workout_aw3b_production_hardening'
      and version in ('20260722224500','20260722224246')
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations
    where name = 'active_workout_aw3b_read_and_payload_corrections'
      and version in ('20260723010500','20260722232817')
  ) then
    raise exception 'AW-3B final hardening requires all three immutable reconciled AW-3B migrations.'
      using errcode = '55000';
  end if;

  if to_regclass('public.exercise_log_set_details') is null
     or to_regclass('public.exercise_log_set_segments') is null
     or to_regclass('public.exercise_log_set_segment_metric_values') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('private.workout_set_detail_snapshot(uuid)') is null
     or to_regprocedure('private.workout_performance_metric_snapshot(uuid)') is null
     or to_regprocedure('private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)') is null then
    raise exception 'AW-3B final hardening prerequisites are incomplete.' using errcode = '55000';
  end if;

  if to_regprocedure('private.aw3b_canonicalize_actor_set_payload(jsonb,text)') is not null
     or to_regprocedure('private.aw3b_timeline_structured_summary(uuid)') is not null then
    raise exception 'AW-3B final hardening is already or partially applied.' using errcode = '55000';
  end if;

  select pg_get_functiondef('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%private.aw3b_structured_upsert_workout_set_logs_atomic%'
     or v_definition not like '%public.assert_workout_actor%'
     or v_definition !~* 'for\s+update' then
    raise exception 'AW-3B final hardening refused an unreviewed public set authority.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%private.aw2c_core_complete_workout_session_atomic%' then
    raise exception 'AW-3B completion authority no longer converges on the reviewed core.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.exercise_log_set_details d
    left join public.exercise_logs l
      on l.id = d.exercise_log_id and l.workout_session_id = d.workout_session_id
    left join public.workout_sessions s
      on s.id = d.workout_session_id and s.user_id = d.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1
    from public.exercise_log_set_segments segment
    left join public.exercise_logs l
      on l.id = segment.exercise_log_id
     and l.workout_session_id = segment.workout_session_id
    left join public.workout_sessions s
      on s.id = segment.workout_session_id and s.user_id = segment.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1
    from public.exercise_log_set_segment_metric_values metric
    left join public.exercise_log_set_segments segment
      on segment.id = metric.segment_id
     and segment.exercise_log_id = metric.exercise_log_id
     and segment.workout_session_id = metric.workout_session_id
     and segment.user_id = metric.user_id
    where segment.id is null
  ) then
    raise exception 'AW-3B final hardening found an ownership-path violation.'
      using errcode = '23514';
  end if;
end
$aw3b_final_preflight$;

create temporary table aw3b_final_baseline on commit drop as
select
  (select migration_version from public.release_schema_compatibility where singleton = true) as marker,
  (select count(*) from public.exercise_logs) as log_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(l)::text, '' order by l.id), ''), 'UTF8'), 'sha256'), 'hex')
     from public.exercise_logs l) as log_hash,
  (select count(*) from public.exercise_log_set_details) as detail_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text, '' order by d.exercise_log_id), ''), 'UTF8'), 'sha256'), 'hex')
     from public.exercise_log_set_details d) as detail_hash,
  (select count(*) from public.exercise_log_set_segments) as segment_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text, '' order by s.exercise_log_id,s.segment_order,s.id), ''), 'UTF8'), 'sha256'), 'hex')
     from public.exercise_log_set_segments s) as segment_hash,
  (select count(*) from public.exercise_log_set_segment_metric_values) as segment_metric_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text, '' order by m.segment_id,m.metric_key,m.metric_version,m.side,m.id), ''), 'UTF8'), 'sha256'), 'hex')
     from public.exercise_log_set_segment_metric_values m) as segment_metric_hash,
  (select count(*) from public.workout_session_timeline_events) as timeline_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text, '' order by e.workout_session_id,e.sequence_number,e.id), ''), 'UTF8'), 'sha256'), 'hex')
     from public.workout_session_timeline_events e) as timeline_hash;

create function private.aw3b_canonicalize_actor_set_payload(
  p_logs jsonb,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_details jsonb;
  v_segments jsonb;
  v_segment jsonb;
  v_metrics jsonb;
  v_metric jsonb;
begin
  if jsonb_typeof(p_logs) <> 'array' then
    raise exception 'Workout set logs must be an array.' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Workout set payload entries must be objects.' using errcode = '22023';
    end if;

    if coalesce(p_actor_role, 'authenticated') <> 'service_role' then
      if v_item ? 'set_details' and jsonb_typeof(v_item->'set_details') = 'object' then
        v_details := (v_item->'set_details') || jsonb_build_object(
          'source', 'manual',
          'source_provider', 'plaivra',
          'source_version', 'aw3b-v1'
        );
        v_item := jsonb_set(v_item, '{set_details}', v_details, true);
      end if;

      if v_item ? 'segments' and jsonb_typeof(v_item->'segments') = 'array' then
        v_segments := '[]'::jsonb;
        for v_segment in select value from jsonb_array_elements(v_item->'segments')
        loop
          if jsonb_typeof(v_segment) <> 'object' then
            raise exception 'Workout set segments must be objects.' using errcode = '22023';
          end if;
          v_segment := v_segment || jsonb_build_object(
            'source', 'manual',
            'source_provider', 'plaivra',
            'source_version', 'aw3b-v1'
          );

          if v_segment ? 'performance_metrics'
             and jsonb_typeof(v_segment->'performance_metrics') = 'array' then
            v_metrics := '[]'::jsonb;
            for v_metric in select value from jsonb_array_elements(v_segment->'performance_metrics')
            loop
              if jsonb_typeof(v_metric) <> 'object' then
                raise exception 'Workout set segment metrics must be objects.' using errcode = '22023';
              end if;
              v_metric := v_metric || jsonb_build_object(
                'source', 'manual',
                'source_provider', 'plaivra',
                'source_version', 'aw3b-v1'
              );
              v_metrics := v_metrics || jsonb_build_array(v_metric);
            end loop;
            v_segment := jsonb_set(v_segment, '{performance_metrics}', v_metrics, true);
          end if;
          v_segments := v_segments || jsonb_build_array(v_segment);
        end loop;
        v_item := jsonb_set(v_item, '{segments}', v_segments, true);
      end if;
    else
      if jsonb_path_exists(v_item, '$.set_details ? (@.source == "backfill")'::jsonpath)
         or jsonb_path_exists(v_item, '$.segments[*] ? (@.source == "backfill")'::jsonpath)
         or jsonb_path_exists(v_item, '$.segments[*].performance_metrics[*] ? (@.source == "backfill")'::jsonpath) then
        raise exception 'Backfill provenance is reserved for forward migration history.'
          using errcode = '42501';
      end if;
    end if;

    v_result := v_result || jsonb_build_array(v_item);
  end loop;
  return v_result;
end
$function$;

revoke all on function private.aw3b_canonicalize_actor_set_payload(jsonb,text)
from public, anon, authenticated, service_role;

create function private.aw3b_timeline_structured_summary(p_exercise_log_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_snapshot jsonb;
  v_details jsonb;
  v_safe_details jsonb;
  v_safe_graph jsonb;
  v_segment_count integer;
  v_segment_metric_count integer;
  v_digest text;
begin
  v_snapshot := private.workout_set_detail_snapshot(p_exercise_log_id);
  v_details := v_snapshot->'details';
  v_safe_details := case
    when v_details is null or v_details = 'null'::jsonb then 'null'::jsonb
    else (v_details - 'notes') || jsonb_build_object(
      'note_present',
      coalesce(nullif(v_details->>'notes', ''), '') <> ''
    )
  end;
  v_safe_graph := jsonb_build_object(
    'details', v_safe_details,
    'segments', coalesce(v_snapshot->'segments', '[]'::jsonb)
  );

  select count(*)::integer into v_segment_count
  from public.exercise_log_set_segments segment
  where segment.exercise_log_id = p_exercise_log_id;

  select count(*)::integer into v_segment_metric_count
  from public.exercise_log_set_segment_metric_values metric
  where metric.exercise_log_id = p_exercise_log_id;

  v_digest := encode(
    extensions.digest(convert_to(v_safe_graph::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'detailPresent', v_safe_details <> 'null'::jsonb,
    'details', v_safe_details,
    'segmentCount', v_segment_count,
    'segmentMetricCount', v_segment_metric_count,
    'nonNoteGraphDigest', v_digest
  );
end
$function$;

revoke all on function private.aw3b_timeline_structured_summary(uuid)
from public, anon, authenticated, service_role;

create or replace function private.append_workout_session_timeline_event(
  p_workout_session_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_source text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default null,
  p_exercise_log_id uuid default null,
  p_snapshot_item_id uuid default null,
  p_payload_version smallint default 1
)
returns public.workout_session_timeline_events
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_inserted public.workout_session_timeline_events%rowtype;
  v_existing public.workout_session_timeline_events%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select session.user_id into v_owner
  from public.workout_sessions session
  where session.id = p_workout_session_id;
  if v_owner is null then
    raise exception 'Timeline root workout session does not exist.' using errcode='23503';
  end if;
  if p_user_id is null or v_owner <> p_user_id then
    raise exception 'Timeline owner must equal the root workout-session owner.' using errcode='42501';
  end if;
  if p_event_type not in (
    'session_started','session_paused','session_resumed','rest_started','rest_ended',
    'set_completed','set_edited','exercise_skipped','exercise_replaced',
    'session_completed','session_skipped','session_cancelled'
  ) then
    raise exception 'Unsupported workout timeline event type.' using errcode='22023';
  end if;
  if p_source not in ('runtime','migration_backfill') then
    raise exception 'Unsupported workout timeline source.' using errcode='22023';
  end if;
  if p_occurred_at is null then
    raise exception 'Timeline occurrence time is required.' using errcode='22023';
  end if;
  if p_payload_version <> 1 then
    raise exception 'Unsupported workout timeline payload version.' using errcode='22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Workout timeline payload must be a JSON object.' using errcode='22023';
  end if;
  if octet_length(v_payload::text) > 8192 then
    raise exception 'Workout timeline payload exceeds the 8192-byte limit.' using errcode='22023';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 200
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$' then
    raise exception 'Workout timeline idempotency key is invalid.' using errcode='22023';
  end if;
  if p_exercise_log_id is not null and not exists (
    select 1 from public.exercise_logs log
    where log.id = p_exercise_log_id
      and log.workout_session_id = p_workout_session_id
  ) then
    raise exception 'Timeline exercise log must belong to the root workout session.'
      using errcode='23514';
  end if;
  if p_snapshot_item_id is not null and not exists (
    select 1
    from public.workout_session_muscle_snapshot_items item
    join public.workout_session_muscle_snapshots snapshot
      on snapshot.id = item.snapshot_id
    where item.id = p_snapshot_item_id
      and item.user_id = p_user_id
      and snapshot.workout_session_id = p_workout_session_id
  ) then
    raise exception 'Timeline snapshot item must belong to the root workout session.'
      using errcode='23514';
  end if;

  -- The public AW-3B wrapper captures before-state, asks the private legacy
  -- authorities to commit the graph with this transaction-local flag, and then
  -- emits exactly one final event from the complete after-state. The suppressed
  -- private return value is ignored by every reviewed caller.
  if current_setting('plaivra.aw3b_defer_set_timeline', true) = 'on'
     and coalesce(current_setting('plaivra.aw3b_emit_set_timeline', true), 'off') <> 'on'
     and p_source = 'runtime'
     and p_event_type in ('set_completed','set_edited')
     and p_exercise_log_id is not null then
    return null;
  end if;

  insert into public.workout_session_timeline_events(
    workout_session_id,user_id,event_type,occurred_at,source,command_id,
    exercise_log_id,snapshot_item_id,payload_version,payload,idempotency_key
  ) values (
    p_workout_session_id,p_user_id,p_event_type,p_occurred_at,p_source,p_command_id,
    p_exercise_log_id,p_snapshot_item_id,p_payload_version,v_payload,p_idempotency_key
  )
  on conflict (workout_session_id,idempotency_key) do nothing
  returning * into v_inserted;
  if found then return v_inserted; end if;

  select * into strict v_existing
  from public.workout_session_timeline_events event
  where event.workout_session_id = p_workout_session_id
    and event.idempotency_key = p_idempotency_key;
  if v_existing.user_id is distinct from p_user_id
     or v_existing.event_type is distinct from p_event_type
     or v_existing.occurred_at is distinct from p_occurred_at
     or v_existing.source is distinct from p_source
     or v_existing.command_id is distinct from p_command_id
     or v_existing.exercise_log_id is distinct from p_exercise_log_id
     or v_existing.snapshot_item_id is distinct from p_snapshot_item_id
     or v_existing.payload_version is distinct from p_payload_version
     or v_existing.payload is distinct from v_payload then
    raise exception 'Workout timeline idempotency key collided with a different event identity.'
      using errcode='23505';
  end if;
  return v_existing;
end
$function$;

revoke all on function private.append_workout_session_timeline_event(
  uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint
) from public, anon, authenticated, service_role;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_logs jsonb := coalesce(p_logs, '[]'::jsonb);
  v_actor_role text := coalesce(auth.role(), 'authenticated');
  v_item jsonb;
  v_key text;
  v_duplicate_count integer;
  v_existing_count bigint;
  v_final_count bigint;
  v_before_by_key jsonb := '{}'::jsonb;
  v_before_log jsonb;
  v_before_metrics jsonb;
  v_before_structured jsonb;
  v_after public.exercise_logs%rowtype;
  v_after_metrics jsonb;
  v_after_structured jsonb;
  v_before_completed boolean;
  v_after_completed boolean;
  v_core_changed boolean;
  v_structured_changed boolean;
  v_changed boolean;
  v_notes_changed boolean;
  v_changed_fields text[];
  v_summary jsonb;
  v_payload jsonb;
  v_change_token uuid;
  v_completion_token text;
  v_result jsonb;
begin
  if jsonb_typeof(v_logs) <> 'array' then
    raise exception 'Workout set logs must be an array.' using errcode='23514';
  end if;
  if jsonb_array_length(v_logs) > 500 then
    raise exception 'A workout set payload can contain at most 500 logs.' using errcode='22023';
  end if;
  if pg_column_size(v_logs) > 16777216 then
    raise exception 'Workout set payload exceeds the 16 MiB limit.' using errcode='22023';
  end if;

  perform public.assert_workout_actor(p_user_id);
  perform 1 from public.workout_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode='P0002';
  end if;

  select count(*) into v_existing_count
  from public.exercise_logs
  where workout_session_id = p_session_id;
  if v_existing_count > 500 then
    raise exception 'Workout session already exceeds the 500-log limit.' using errcode='23514';
  end if;

  select count(*) into v_duplicate_count
  from (
    select
      coalesce(
        nullif(value->>'plan_exercise_id',''),
        'order:' || coalesce(value->>'exercise_order','')
      ) as exercise_key,
      value->>'set_number' as set_key
    from jsonb_array_elements(v_logs)
    group by 1,2
    having count(*) > 1
  ) duplicate_keys;
  if v_duplicate_count > 0 then
    raise exception 'Workout set payload contains duplicate stable keys.' using errcode='23505';
  end if;

  v_logs := private.aw3b_canonicalize_actor_set_payload(v_logs, v_actor_role);

  for v_item in select value from jsonb_array_elements(v_logs)
  loop
    v_before_log := null;
    v_before_metrics := null;
    v_before_structured := null;
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key := 'plan:' || (v_item->>'plan_exercise_id')
        || ':set:' || coalesce(v_item->>'set_number','');
      select to_jsonb(log),
             private.workout_performance_metric_snapshot(log.id),
             private.workout_set_detail_snapshot(log.id)
      into v_before_log,v_before_metrics,v_before_structured
      from public.exercise_logs log
      where log.workout_session_id = p_session_id
        and log.plan_exercise_id = (v_item->>'plan_exercise_id')::uuid
        and log.set_number = (v_item->>'set_number')::integer
      for update;
    else
      v_key := 'order:' || coalesce(v_item->>'exercise_order','')
        || ':set:' || coalesce(v_item->>'set_number','');
      select to_jsonb(log),
             private.workout_performance_metric_snapshot(log.id),
             private.workout_set_detail_snapshot(log.id)
      into v_before_log,v_before_metrics,v_before_structured
      from public.exercise_logs log
      where log.workout_session_id = p_session_id
        and log.plan_exercise_id is null
        and log.exercise_order = (v_item->>'exercise_order')::integer
        and log.set_number = (v_item->>'set_number')::integer
      for update;
    end if;

    v_before_by_key := jsonb_set(
      v_before_by_key,
      array[v_key],
      jsonb_build_object(
        'log', coalesce(v_before_log, 'null'::jsonb),
        'metrics', coalesce(v_before_metrics, '[]'::jsonb),
        'structured', coalesce(v_before_structured, 'null'::jsonb)
      ),
      true
    );
  end loop;

  perform set_config('plaivra.aw3b_defer_set_timeline', 'on', true);
  perform set_config('plaivra.aw3b_emit_set_timeline', 'off', true);

  v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(
    p_user_id,p_session_id,v_logs
  );

  perform set_config('plaivra.aw3b_emit_set_timeline', 'on', true);

  for v_item in select value from jsonb_array_elements(v_logs)
  loop
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key := 'plan:' || (v_item->>'plan_exercise_id')
        || ':set:' || coalesce(v_item->>'set_number','');
      select * into strict v_after
      from public.exercise_logs log
      where log.workout_session_id = p_session_id
        and log.plan_exercise_id = (v_item->>'plan_exercise_id')::uuid
        and log.set_number = (v_item->>'set_number')::integer;
    else
      v_key := 'order:' || coalesce(v_item->>'exercise_order','')
        || ':set:' || coalesce(v_item->>'set_number','');
      select * into strict v_after
      from public.exercise_logs log
      where log.workout_session_id = p_session_id
        and log.plan_exercise_id is null
        and log.exercise_order = (v_item->>'exercise_order')::integer
        and log.set_number = (v_item->>'set_number')::integer;
    end if;

    v_before_log := v_before_by_key->v_key->'log';
    v_before_metrics := coalesce(v_before_by_key->v_key->'metrics','[]'::jsonb);
    v_before_structured := v_before_by_key->v_key->'structured';
    v_after_metrics := private.workout_performance_metric_snapshot(v_after.id);
    v_after_structured := private.workout_set_detail_snapshot(v_after.id);
    v_before_completed := coalesce(
      v_before_log is not null
      and v_before_log <> 'null'::jsonb
      and (v_before_log->>'completed_at') is not null,
      false
    );
    v_after_completed := v_after.completed_at is not null;

    if v_before_log is null or v_before_log = 'null'::jsonb then
      v_core_changed := true;
    else
      v_core_changed :=
        (v_before_log->>'reps')::integer is distinct from v_after.reps
        or (v_before_log->>'weight_kg')::numeric is distinct from v_after.weight_kg
        or (v_before_log->>'completed_at')::timestamptz is distinct from v_after.completed_at
        or v_before_log->>'set_type' is distinct from v_after.set_type
        or v_before_log->>'notes' is distinct from v_after.notes
        or v_before_log->>'exercise_name' is distinct from v_after.exercise_name
        or (v_before_log->>'exercise_order')::integer is distinct from v_after.exercise_order
        or (v_before_log->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id
        or v_before_metrics is distinct from v_after_metrics;
    end if;
    v_structured_changed := v_before_structured is distinct from v_after_structured;
    v_changed := v_core_changed or v_structured_changed;
    v_summary := private.aw3b_timeline_structured_summary(v_after.id);

    if not v_before_completed and v_after_completed then
      v_completion_token := (
        extract(epoch from v_after.completed_at) * 1000000
      )::bigint::text;
      v_payload := jsonb_build_object(
        'schemaVersion', 1,
        'exerciseOrder', v_after.exercise_order,
        'planExerciseId', v_after.plan_exercise_id,
        'exerciseNameSnapshot', v_after.exercise_name,
        'setNumber', v_after.set_number,
        'reps', v_after.reps,
        'weightKg', v_after.weight_kg,
        'completedAt', v_after.completed_at,
        'setType', v_after.set_type,
        'performanceMetrics', v_after_metrics,
        'structuredSet', v_summary
      );
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_completed',v_after.completed_at,'runtime',
        'runtime:set_completed:' || v_after.id::text || ':aw3b-v1:' || v_completion_token,
        v_payload,null,v_after.id,null,1::smallint
      );
    elsif v_before_completed and v_after_completed and v_changed then
      v_notes_changed :=
        v_before_log->>'notes' is distinct from v_after.notes
        or (v_before_structured->'details'->>'notes')
          is distinct from (v_after_structured->'details'->>'notes');
      v_changed_fields := array_remove(array[
        case when (v_before_log->>'reps')::integer is distinct from v_after.reps then 'reps' end,
        case when (v_before_log->>'weight_kg')::numeric is distinct from v_after.weight_kg then 'weightKg' end,
        case when (v_before_log->>'completed_at')::timestamptz is distinct from v_after.completed_at then 'completedAt' end,
        case when v_before_log->>'set_type' is distinct from v_after.set_type then 'setType' end,
        case when v_notes_changed then 'notes' end,
        case when v_before_metrics is distinct from v_after_metrics then 'performanceMetrics' end,
        case when v_structured_changed then 'structuredSetDetails' end
      ], null);
      v_payload := jsonb_build_object(
        'schemaVersion', 1,
        'exerciseOrder', v_after.exercise_order,
        'planExerciseId', v_after.plan_exercise_id,
        'exerciseNameSnapshot', v_after.exercise_name,
        'setNumber', v_after.set_number,
        'changedFields', to_jsonb(v_changed_fields),
        'notesChanged', v_notes_changed,
        'setTypeChanged',
          (v_before_structured->'details'->>'set_type')
          is distinct from (v_after_structured->'details'->>'set_type'),
        'rpeChanged',
          (v_before_structured->'details'->>'rpe')
          is distinct from (v_after_structured->'details'->>'rpe'),
        'rirChanged',
          (v_before_structured->'details'->>'rir')
          is distinct from (v_after_structured->'details'->>'rir'),
        'sideModeChanged',
          (v_before_structured->'details'->>'side_mode')
          is distinct from (v_after_structured->'details'->>'side_mode'),
        'tempoChanged',
          jsonb_build_array(
            v_before_structured->'details'->>'planned_tempo',
            v_before_structured->'details'->>'performed_tempo',
            v_before_structured->'details'->>'tempo_adherence'
          ) is distinct from jsonb_build_array(
            v_after_structured->'details'->>'planned_tempo',
            v_after_structured->'details'->>'performed_tempo',
            v_after_structured->'details'->>'tempo_adherence'
          ),
        'performanceMetrics', v_after_metrics,
        'structuredSet', v_summary
      );
      v_change_token := gen_random_uuid();
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_edited',clock_timestamp(),'runtime',
        'runtime:set_edited:' || v_after.id::text || ':aw3b-v1:' || v_change_token::text,
        v_payload,null,v_after.id,null,1::smallint
      );
    end if;
  end loop;

  perform set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
  perform set_config('plaivra.aw3b_emit_set_timeline', 'off', true);

  select count(*) into v_final_count
  from public.exercise_logs
  where workout_session_id = p_session_id;
  if v_final_count > 500 then
    raise exception 'A workout session can contain at most 500 set logs.' using errcode='22023';
  end if;

  return v_result;
end
$function$;

revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
from public, anon;
grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
to authenticated, service_role;

do $aw3b_final_postflight$
declare
  v_baseline aw3b_final_baseline%rowtype;
  v_count bigint;
  v_hash text;
  v_definition text;
begin
  select * into strict v_baseline from aw3b_final_baseline;

  if (select migration_version from public.release_schema_compatibility where singleton = true)
     <> v_baseline.marker then
    raise exception 'AW-3B final hardening changed the compatibility marker.'
      using errcode = '23514';
  end if;

  if has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','private.aw3b_canonicalize_actor_set_payload(jsonb,text)','EXECUTE')
     or has_function_privilege('authenticated','private.aw3b_canonicalize_actor_set_payload(jsonb,text)','EXECUTE')
     or has_function_privilege('service_role','private.aw3b_canonicalize_actor_set_payload(jsonb,text)','EXECUTE')
     or has_function_privilege('anon','private.aw3b_timeline_structured_summary(uuid)','EXECUTE')
     or has_function_privilege('authenticated','private.aw3b_timeline_structured_summary(uuid)','EXECUTE')
     or has_function_privilege('service_role','private.aw3b_timeline_structured_summary(uuid)','EXECUTE') then
    raise exception 'AW-3B final hardening grants are invalid.' using errcode = '42501';
  end if;

  select pg_get_functiondef('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%private.aw3b_canonicalize_actor_set_payload%'
     or v_definition not like '%plaivra.aw3b_defer_set_timeline%'
     or v_definition not like '%private.aw3b_timeline_structured_summary%'
     or v_definition not like '%runtime:set_completed:%aw3b-v1:%'
     or v_definition not like '%runtime:set_edited:%aw3b-v1:%' then
    raise exception 'AW-3B final public authority is incomplete.' using errcode = '23514';
  end if;

  select pg_get_functiondef(
    'private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)'::regprocedure
  ) into strict v_definition;
  if v_definition not like '%plaivra.aw3b_defer_set_timeline%'
     or v_definition not like '%return null%' then
    raise exception 'AW-3B deferred timeline gate is incomplete.' using errcode = '23514';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(l)::text, '' order by l.id), ''), 'UTF8'), 'sha256'), 'hex')
    into v_count,v_hash
  from public.exercise_logs l;
  if v_count <> v_baseline.log_count or v_hash <> v_baseline.log_hash then
    raise exception 'AW-3B final hardening changed exercise logs.' using errcode = '23514';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text, '' order by d.exercise_log_id), ''), 'UTF8'), 'sha256'), 'hex')
    into v_count,v_hash
  from public.exercise_log_set_details d;
  if v_count <> v_baseline.detail_count or v_hash <> v_baseline.detail_hash then
    raise exception 'AW-3B final hardening changed set details.' using errcode = '23514';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text, '' order by s.exercise_log_id,s.segment_order,s.id), ''), 'UTF8'), 'sha256'), 'hex')
    into v_count,v_hash
  from public.exercise_log_set_segments s;
  if v_count <> v_baseline.segment_count or v_hash <> v_baseline.segment_hash then
    raise exception 'AW-3B final hardening changed set segments.' using errcode = '23514';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text, '' order by m.segment_id,m.metric_key,m.metric_version,m.side,m.id), ''), 'UTF8'), 'sha256'), 'hex')
    into v_count,v_hash
  from public.exercise_log_set_segment_metric_values m;
  if v_count <> v_baseline.segment_metric_count or v_hash <> v_baseline.segment_metric_hash then
    raise exception 'AW-3B final hardening changed segment metrics.' using errcode = '23514';
  end if;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text, '' order by e.workout_session_id,e.sequence_number,e.id), ''), 'UTF8'), 'sha256'), 'hex')
    into v_count,v_hash
  from public.workout_session_timeline_events e;
  if v_count <> v_baseline.timeline_count or v_hash <> v_baseline.timeline_hash then
    raise exception 'AW-3B final hardening changed existing timeline history.' using errcode = '23514';
  end if;
end
$aw3b_final_postflight$;

notify pgrst, 'reload schema';
