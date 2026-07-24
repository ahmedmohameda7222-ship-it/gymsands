-- AW-3B post-apply logic corrections.
-- Forward-only correction after the immutable applied final-hardening migration.
-- Preserves every user row and keeps the released AW-3A compatibility marker unchanged.

DO $aw3b_post_apply_preflight$
DECLARE
  v_marker text;
  v_definition text;
BEGIN
  SELECT migration_version INTO STRICT v_marker
  FROM public.release_schema_compatibility
  WHERE singleton = true;
  IF v_marker <> '20260722161542' THEN
    RAISE EXCEPTION 'AW-3B post-apply correction requires released AW-3A marker 20260722161542; found %.', v_marker
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE name = 'active_workout_aw3b_final_logic_hardening'
      AND version IN ('20260724013000','20260724002022')
  ) THEN
    RAISE EXCEPTION 'AW-3B post-apply correction requires the immutable applied final-hardening migration.'
      USING ERRCODE = '55000';
  END IF;

  IF to_regprocedure('private.aw3b_canonicalize_actor_set_payload(jsonb,text)') IS NULL
     OR to_regprocedure('private.aw3b_timeline_structured_summary(uuid)') IS NULL
     OR to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('private.workout_set_detail_snapshot(uuid)') IS NULL
     OR to_regprocedure('private.workout_performance_metric_snapshot(uuid)') IS NULL
     OR to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'AW-3B post-apply correction prerequisites are incomplete.' USING ERRCODE = '55000';
  END IF;
  IF to_regprocedure('private.aw3b_graph_revision(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'AW-3B post-apply correction is already or partially applied.' USING ERRCODE = '55000';
  END IF;

  SELECT pg_get_functiondef('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'::regprocedure)
    INTO STRICT v_definition;
  IF v_definition NOT LIKE '%private.aw3b_canonicalize_actor_set_payload%'
     OR v_definition NOT LIKE '%private.aw3b_timeline_structured_summary%'
     OR v_definition NOT LIKE '%plaivra.aw3b_defer_set_timeline%'
     OR NOT has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'AW-3B post-apply correction refused an unexpected public authority.' USING ERRCODE = '55000';
  END IF;
END
$aw3b_post_apply_preflight$;

CREATE TEMPORARY TABLE aw3b_post_apply_baseline ON COMMIT DROP AS
SELECT
  (SELECT migration_version FROM public.release_schema_compatibility WHERE singleton = true) AS marker,
  (SELECT count(*) FROM public.exercise_logs) AS log_count,
  (SELECT count(*) FROM public.exercise_log_metric_values) AS metric_count,
  (SELECT count(*) FROM public.exercise_log_set_details) AS detail_count,
  (SELECT count(*) FROM public.exercise_log_set_segments) AS segment_count,
  (SELECT count(*) FROM public.exercise_log_set_segment_metric_values) AS segment_metric_count,
  (SELECT count(*) FROM public.workout_session_timeline_events) AS timeline_count,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') FROM public.exercise_logs t) AS logs_hash,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') FROM public.exercise_log_metric_values t) AS metrics_hash,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.exercise_log_id), ''), 'UTF8'), 'sha256'), 'hex') FROM public.exercise_log_set_details t) AS details_hash,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.exercise_log_id, t.segment_order), ''), 'UTF8'), 'sha256'), 'hex') FROM public.exercise_log_set_segments t) AS segments_hash,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') FROM public.exercise_log_set_segment_metric_values t) AS segment_metrics_hash,
  (SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.workout_session_id, t.sequence_number, t.id), ''), 'UTF8'), 'sha256'), 'hex') FROM public.workout_session_timeline_events t) AS timeline_hash;

CREATE FUNCTION private.aw3b_graph_revision(p_exercise_log_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'log', pg_catalog.to_jsonb(l),
          'performanceMetrics', private.workout_performance_metric_snapshot(l.id),
          'structuredSet', private.workout_set_detail_snapshot(l.id)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  FROM public.exercise_logs l
  WHERE l.id = p_exercise_log_id
$function$;

REVOKE ALL ON FUNCTION private.aw3b_graph_revision(uuid) FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_logs jsonb := coalesce(p_logs, '[]'::jsonb);
  v_canonical_logs jsonb := '[]'::jsonb;
  v_item jsonb;
  v_details jsonb;
  v_normalized_details jsonb;
  v_existing_details jsonb;
  v_segments jsonb;
  v_segment jsonb;
  v_normalized_segment jsonb;
  v_existing_segment jsonb;
  v_metrics jsonb;
  v_metric jsonb;
  v_normalized_metric jsonb;
  v_existing_metric jsonb;
  v_before_by_key jsonb := '{}'::jsonb;
  v_before_log jsonb;
  v_before_metrics jsonb;
  v_before_structured jsonb;
  v_after public.exercise_logs%rowtype;
  v_after_metrics jsonb;
  v_after_structured jsonb;
  v_structured_summary jsonb;
  v_key text;
  v_role text := coalesce(auth.role(), '');
  v_existing_count bigint;
  v_final_count bigint;
  v_before_completed boolean;
  v_after_completed boolean;
  v_core_changed boolean;
  v_structured_changed boolean;
  v_notes_changed boolean;
  v_changed_fields text[];
  v_payload jsonb;
  v_result jsonb;
  v_revision text;
  v_completion_revision bigint;
BEGIN
  IF jsonb_typeof(v_logs) <> 'array' THEN
    RAISE EXCEPTION 'Workout set logs must be an array.' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(v_logs) > 500 THEN
    RAISE EXCEPTION 'A workout set payload can contain at most 500 logs.' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(v_logs) > 16777216 THEN
    RAISE EXCEPTION 'Workout set payload exceeds the 16 MiB limit.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_workout_actor(p_user_id);
  PERFORM 1 FROM public.workout_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workout session not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exercise_logs WHERE workout_session_id = p_session_id;
  IF v_existing_count > 500 THEN
    RAISE EXCEPTION 'Workout session already exceeds the 500-log limit.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_path_exists(v_logs, '$[*].set_details ? (@.source == "backfill")'::jsonpath)
     OR jsonb_path_exists(v_logs, '$[*].segments[*] ? (@.source == "backfill")'::jsonpath)
     OR jsonb_path_exists(v_logs, '$[*].segments[*].performance_metrics[*] ? (@.source == "backfill")'::jsonpath) THEN
    RAISE EXCEPTION 'Backfill provenance is reserved for forward migration history.' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_logs)
  LOOP
    v_before_log := NULL;
    v_before_metrics := NULL;
    v_before_structured := NULL;

    IF nullif(v_item->>'plan_exercise_id', '') IS NOT NULL THEN
      v_key := 'plan:' || (v_item->>'plan_exercise_id') || ':set:' || coalesce(v_item->>'set_number', '');
      SELECT to_jsonb(l), private.workout_performance_metric_snapshot(l.id), private.workout_set_detail_snapshot(l.id)
      INTO v_before_log, v_before_metrics, v_before_structured
      FROM public.exercise_logs l
      WHERE l.workout_session_id = p_session_id
        AND l.plan_exercise_id = (v_item->>'plan_exercise_id')::uuid
        AND l.set_number = (v_item->>'set_number')::integer
      FOR UPDATE;
    ELSE
      v_key := 'order:' || coalesce(v_item->>'exercise_order', '') || ':set:' || coalesce(v_item->>'set_number', '');
      SELECT to_jsonb(l), private.workout_performance_metric_snapshot(l.id), private.workout_set_detail_snapshot(l.id)
      INTO v_before_log, v_before_metrics, v_before_structured
      FROM public.exercise_logs l
      WHERE l.workout_session_id = p_session_id
        AND l.plan_exercise_id IS NULL
        AND l.exercise_order = (v_item->>'exercise_order')::integer
        AND l.set_number = (v_item->>'set_number')::integer
      FOR UPDATE;
    END IF;

    v_before_by_key := jsonb_set(v_before_by_key, ARRAY[v_key], jsonb_build_object(
      'log', coalesce(v_before_log, 'null'::jsonb),
      'metrics', coalesce(v_before_metrics, '[]'::jsonb),
      'structured', coalesce(v_before_structured, 'null'::jsonb)
    ), true);

    IF v_role <> 'service_role' AND v_item ? 'set_details' AND jsonb_typeof(v_item->'set_details') = 'object' THEN
      v_details := v_item->'set_details';
      v_existing_details := v_before_structured->'details';
      v_normalized_details := jsonb_build_object(
        'schema_version', coalesce(nullif(v_details->>'schema_version', '')::smallint, 1),
        'set_type', nullif(v_details->>'set_type', ''),
        'rpe', nullif(v_details->>'rpe', '')::numeric,
        'rir', nullif(v_details->>'rir', '')::numeric,
        'notes', nullif(v_details->>'notes', ''),
        'side_mode', coalesce(nullif(v_details->>'side_mode', ''), 'none'),
        'planned_tempo', nullif(v_details->>'planned_tempo', ''),
        'performed_tempo', nullif(v_details->>'performed_tempo', ''),
        'tempo_adherence', coalesce(nullif(v_details->>'tempo_adherence', ''), 'not_recorded')
      );
      IF v_existing_details IS NOT NULL
         AND (v_existing_details - ARRAY['source','source_provider','source_version']) = v_normalized_details THEN
        v_details := v_details || jsonb_build_object(
          'source', v_existing_details->>'source',
          'source_provider', v_existing_details->'source_provider',
          'source_version', v_existing_details->'source_version'
        );
      ELSE
        v_details := v_details || jsonb_build_object(
          'source', 'manual',
          'source_provider', 'plaivra',
          'source_version', 'aw3b-v1'
        );
      END IF;
      v_item := jsonb_set(v_item, '{set_details}', v_details, true);
    END IF;

    IF v_role <> 'service_role' AND v_item ? 'segments' AND jsonb_typeof(v_item->'segments') = 'array' THEN
      v_segments := '[]'::jsonb;
      FOR v_segment IN SELECT value FROM jsonb_array_elements(v_item->'segments')
      LOOP
        v_existing_segment := (
          SELECT value FROM jsonb_array_elements(coalesce(v_before_structured->'segments', '[]'::jsonb))
          WHERE (value->>'segment_order')::integer = nullif(v_segment->>'segment_order', '')::integer
          LIMIT 1
        );
        v_normalized_segment := jsonb_build_object(
          'segment_order', nullif(v_segment->>'segment_order', '')::integer,
          'segment_kind', nullif(v_segment->>'segment_kind', ''),
          'side', coalesce(nullif(v_segment->>'side', ''), 'none'),
          'completed_at', nullif(v_segment->>'completed_at', '')::timestamptz
        );
        IF v_existing_segment IS NOT NULL
           AND (v_existing_segment - ARRAY['source','source_provider','source_version','metrics']) = v_normalized_segment THEN
          v_segment := v_segment || jsonb_build_object(
            'source', v_existing_segment->>'source',
            'source_provider', v_existing_segment->'source_provider',
            'source_version', v_existing_segment->'source_version'
          );
        ELSE
          v_segment := v_segment || jsonb_build_object(
            'source', 'manual',
            'source_provider', 'plaivra',
            'source_version', 'aw3b-v1'
          );
        END IF;

        v_metrics := '[]'::jsonb;
        FOR v_metric IN SELECT value FROM jsonb_array_elements(coalesce(v_segment->'performance_metrics', '[]'::jsonb))
        LOOP
          v_existing_metric := (
            SELECT value FROM jsonb_array_elements(coalesce(v_existing_segment->'metrics', '[]'::jsonb))
            WHERE value->>'metric_key' = v_metric->>'metric_key'
              AND coalesce(nullif(value->>'metric_version', ''), '1') = coalesce(nullif(v_metric->>'metric_version', ''), '1')
              AND coalesce(nullif(value->>'side', ''), 'none') = coalesce(nullif(v_metric->>'side', ''), 'none')
            LIMIT 1
          );
          v_normalized_metric := jsonb_build_object(
            'metric_key', nullif(v_metric->>'metric_key', ''),
            'metric_version', coalesce(nullif(v_metric->>'metric_version', '')::smallint, 1),
            'side', coalesce(nullif(v_metric->>'side', ''), 'none'),
            'value', nullif(v_metric->>'value', '')::numeric,
            'captured_at', coalesce(
              nullif(v_metric->>'captured_at', '')::timestamptz,
              nullif(v_existing_metric->>'captured_at', '')::timestamptz,
              nullif(v_segment->>'completed_at', '')::timestamptz
            )
          );
          IF v_existing_metric IS NOT NULL
             AND (v_existing_metric - ARRAY['source','source_provider','source_version']) = v_normalized_metric THEN
            v_metric := v_metric || jsonb_build_object(
              'source', v_existing_metric->>'source',
              'source_provider', v_existing_metric->'source_provider',
              'source_version', v_existing_metric->'source_version'
            );
          ELSE
            v_metric := v_metric || jsonb_build_object(
              'source', 'manual',
              'source_provider', 'plaivra',
              'source_version', 'aw3b-v1'
            );
          END IF;
          v_metrics := v_metrics || jsonb_build_array(v_metric);
        END LOOP;
        v_segment := jsonb_set(v_segment, '{performance_metrics}', v_metrics, true);
        v_segments := v_segments || jsonb_build_array(v_segment);
      END LOOP;
      v_item := jsonb_set(v_item, '{segments}', v_segments, true);
    END IF;

    v_canonical_logs := v_canonical_logs || jsonb_build_array(v_item);
  END LOOP;

  BEGIN
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'on', true);
    v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(p_user_id, p_session_id, v_canonical_logs);
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
    RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_canonical_logs)
  LOOP
    IF nullif(v_item->>'plan_exercise_id', '') IS NOT NULL THEN
      v_key := 'plan:' || (v_item->>'plan_exercise_id') || ':set:' || coalesce(v_item->>'set_number', '');
      SELECT * INTO STRICT v_after FROM public.exercise_logs l
      WHERE l.workout_session_id = p_session_id
        AND l.plan_exercise_id = (v_item->>'plan_exercise_id')::uuid
        AND l.set_number = (v_item->>'set_number')::integer;
    ELSE
      v_key := 'order:' || coalesce(v_item->>'exercise_order', '') || ':set:' || coalesce(v_item->>'set_number', '');
      SELECT * INTO STRICT v_after FROM public.exercise_logs l
      WHERE l.workout_session_id = p_session_id
        AND l.plan_exercise_id IS NULL
        AND l.exercise_order = (v_item->>'exercise_order')::integer
        AND l.set_number = (v_item->>'set_number')::integer;
    END IF;

    v_before_log := v_before_by_key->v_key->'log';
    v_before_metrics := coalesce(v_before_by_key->v_key->'metrics', '[]'::jsonb);
    v_before_structured := v_before_by_key->v_key->'structured';
    v_after_metrics := private.workout_performance_metric_snapshot(v_after.id);
    v_after_structured := private.workout_set_detail_snapshot(v_after.id);
    v_structured_summary := private.aw3b_timeline_structured_summary(v_after.id);
    v_before_completed := coalesce((v_before_log->>'completed_at') IS NOT NULL, false);
    v_after_completed := v_after.completed_at IS NOT NULL;

    IF v_before_log IS NULL OR v_before_log = 'null'::jsonb THEN
      v_core_changed := true;
      v_notes_changed := v_after.notes IS NOT NULL;
    ELSE
      v_notes_changed := (v_before_log->>'notes') IS DISTINCT FROM v_after.notes;
      v_core_changed := (v_before_log->>'reps')::integer IS DISTINCT FROM v_after.reps
        OR (v_before_log->>'weight_kg')::numeric IS DISTINCT FROM v_after.weight_kg
        OR (v_before_log->>'completed_at')::timestamptz IS DISTINCT FROM v_after.completed_at
        OR v_before_log->>'set_type' IS DISTINCT FROM v_after.set_type
        OR v_notes_changed
        OR v_before_log->>'exercise_name' IS DISTINCT FROM v_after.exercise_name
        OR (v_before_log->>'exercise_order')::integer IS DISTINCT FROM v_after.exercise_order
        OR (v_before_log->>'plan_exercise_id')::uuid IS DISTINCT FROM v_after.plan_exercise_id
        OR v_before_metrics IS DISTINCT FROM v_after_metrics;
    END IF;
    v_structured_changed := v_before_structured IS DISTINCT FROM v_after_structured;

    IF NOT v_before_completed AND v_after_completed THEN
      v_completion_revision := floor(extract(epoch FROM v_after.completed_at) * 1000000)::bigint;
      v_payload := jsonb_build_object(
        'exerciseOrder', v_after.exercise_order,
        'planExerciseId', v_after.plan_exercise_id,
        'exerciseNameSnapshot', v_after.exercise_name,
        'setNumber', v_after.set_number,
        'reps', v_after.reps,
        'weightKg', v_after.weight_kg,
        'completedAt', v_after.completed_at,
        'setType', v_after.set_type,
        'performanceMetrics', v_after_metrics,
        'structuredSet', v_structured_summary
      );
      PERFORM private.append_workout_session_timeline_event(
        p_session_id, p_user_id, 'set_completed', v_after.completed_at, 'runtime',
        'runtime:set_completed:' || v_after.id::text || ':aw3b:' || v_completion_revision::text,
        v_payload, NULL, v_after.id, NULL, 1::smallint
      );
    ELSIF v_before_completed AND v_after_completed AND (v_core_changed OR v_structured_changed) THEN
      v_changed_fields := array_remove(ARRAY[
        CASE WHEN (v_before_log->>'reps')::integer IS DISTINCT FROM v_after.reps THEN 'reps' END,
        CASE WHEN (v_before_log->>'weight_kg')::numeric IS DISTINCT FROM v_after.weight_kg THEN 'weightKg' END,
        CASE WHEN (v_before_log->>'completed_at')::timestamptz IS DISTINCT FROM v_after.completed_at THEN 'completedAt' END,
        CASE WHEN v_before_log->>'set_type' IS DISTINCT FROM v_after.set_type THEN 'setType' END,
        CASE WHEN v_notes_changed THEN 'notes' END,
        CASE WHEN v_before_log->>'exercise_name' IS DISTINCT FROM v_after.exercise_name THEN 'exerciseName' END,
        CASE WHEN (v_before_log->>'exercise_order')::integer IS DISTINCT FROM v_after.exercise_order THEN 'exerciseOrder' END,
        CASE WHEN (v_before_log->>'plan_exercise_id')::uuid IS DISTINCT FROM v_after.plan_exercise_id THEN 'planExerciseId' END,
        CASE WHEN v_before_metrics IS DISTINCT FROM v_after_metrics THEN 'performanceMetrics' END,
        CASE WHEN v_structured_changed THEN 'structuredSetDetails' END
      ], NULL);
      v_payload := jsonb_build_object(
        'exerciseOrder', v_after.exercise_order,
        'planExerciseId', v_after.plan_exercise_id,
        'exerciseNameSnapshot', v_after.exercise_name,
        'setNumber', v_after.set_number,
        'changedFields', to_jsonb(v_changed_fields),
        'before', jsonb_build_object(
          'reps', (v_before_log->>'reps')::integer,
          'weightKg', (v_before_log->>'weight_kg')::numeric,
          'completed', (v_before_log->>'completed_at') IS NOT NULL,
          'setType', v_before_log->>'set_type'
        ),
        'after', jsonb_build_object(
          'reps', v_after.reps,
          'weightKg', v_after.weight_kg,
          'completed', v_after.completed_at IS NOT NULL,
          'setType', v_after.set_type
        ),
        'performanceMetrics', v_after_metrics,
        'notesChanged', v_notes_changed,
        'structuredSet', v_structured_summary
      );
      v_revision := private.aw3b_graph_revision(v_after.id);
      PERFORM private.append_workout_session_timeline_event(
        p_session_id, p_user_id, 'set_edited', clock_timestamp(), 'runtime',
        'runtime:set_edited:' || v_after.id::text || ':aw3b:r' || v_revision::text,
        v_payload, NULL, v_after.id, NULL, 1::smallint
      );
    END IF;
  END LOOP;

  SELECT count(*) INTO v_final_count
  FROM public.exercise_logs WHERE workout_session_id = p_session_id;
  IF v_final_count > 500 THEN
    RAISE EXCEPTION 'A workout session can contain at most 500 set logs.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.exercise_order NULLS LAST, l.plan_exercise_id, l.set_number), '[]'::jsonb)
  INTO v_result
  FROM public.exercise_logs l
  WHERE l.workout_session_id = p_session_id;
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) TO authenticated, service_role;


DROP FUNCTION private.aw3b_canonicalize_actor_set_payload(jsonb,text);

DO $aw3b_post_apply_postflight$
DECLARE
  v_baseline aw3b_post_apply_baseline%rowtype;
  v_hash text;
  v_definition text;
BEGIN
  SELECT * INTO STRICT v_baseline FROM aw3b_post_apply_baseline;

  IF (SELECT migration_version FROM public.release_schema_compatibility WHERE singleton = true) <> v_baseline.marker THEN
    RAISE EXCEPTION 'AW-3B final hardening changed the compatibility marker.' USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.exercise_logs) <> v_baseline.log_count
     OR (SELECT count(*) FROM public.exercise_log_metric_values) <> v_baseline.metric_count
     OR (SELECT count(*) FROM public.exercise_log_set_details) <> v_baseline.detail_count
     OR (SELECT count(*) FROM public.exercise_log_set_segments) <> v_baseline.segment_count
     OR (SELECT count(*) FROM public.exercise_log_set_segment_metric_values) <> v_baseline.segment_metric_count
     OR (SELECT count(*) FROM public.workout_session_timeline_events) <> v_baseline.timeline_count THEN
    RAISE EXCEPTION 'AW-3B final hardening changed user row counts.' USING ERRCODE = '23514';
  END IF;

  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.exercise_logs t;
  IF v_hash <> v_baseline.logs_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed exercise logs.' USING ERRCODE = '23514'; END IF;
  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.exercise_log_metric_values t;
  IF v_hash <> v_baseline.metrics_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed top-level metrics.' USING ERRCODE = '23514'; END IF;
  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.exercise_log_id), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.exercise_log_set_details t;
  IF v_hash <> v_baseline.details_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed set details.' USING ERRCODE = '23514'; END IF;
  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.exercise_log_id, t.segment_order), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.exercise_log_set_segments t;
  IF v_hash <> v_baseline.segments_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed set segments.' USING ERRCODE = '23514'; END IF;
  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.exercise_log_set_segment_metric_values t;
  IF v_hash <> v_baseline.segment_metrics_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed segment metrics.' USING ERRCODE = '23514'; END IF;
  SELECT encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.workout_session_id, t.sequence_number, t.id), ''), 'UTF8'), 'sha256'), 'hex') INTO v_hash FROM public.workout_session_timeline_events t;
  IF v_hash <> v_baseline.timeline_hash THEN RAISE EXCEPTION 'AW-3B final hardening changed timeline history.' USING ERRCODE = '23514'; END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'upsert_workout_set_logs_atomic'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_session_id uuid, p_logs jsonb';

  IF v_definition NOT LIKE '%plaivra.aw3b_defer_set_timeline%'
     OR v_definition NOT LIKE '%private.aw3b_timeline_structured_summary%'
     OR v_definition NOT LIKE '%private.aw3b_graph_revision%'
     OR v_definition NOT LIKE '%v_existing_details%'
     OR v_definition NOT LIKE '%v_existing_segment%'
     OR v_definition NOT LIKE '%v_existing_metric%'
     OR to_regprocedure('private.aw3b_canonicalize_actor_set_payload(jsonb,text)') IS NOT NULL
     OR NOT has_function_privilege('authenticated', 'public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.aw3b_timeline_structured_summary(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.aw3b_timeline_structured_summary(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.aw3b_graph_revision(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.aw3b_graph_revision(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'AW-3B final hardening authority or ACL postflight failed.' USING ERRCODE = '42501';
  END IF;
END
$aw3b_post_apply_postflight$;

NOTIFY pgrst, 'reload schema';
