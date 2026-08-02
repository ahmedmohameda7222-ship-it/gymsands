begin;

do $patch_set_detail_semantics$
declare
  v_definition text;
  v_old text:=$old$
          ) on conflict (exercise_log_id) do update set
            set_type=excluded.set_type,rpe=excluded.rpe,rir=excluded.rir,notes=excluded.notes,
            side_mode=excluded.side_mode,planned_tempo=excluded.planned_tempo,
            performed_tempo=excluded.performed_tempo,tempo_adherence=excluded.tempo_adherence,
            source='manual',source_provider=null,source_version=null,
            updated_at=clock_timestamp();
$old$;
  v_new text:=$new$
          ) on conflict (exercise_log_id) do update set
            set_type=case when v_details?'setType' then excluded.set_type else exercise_log_set_details.set_type end,
            rpe=case when v_details?'rpe' then excluded.rpe else exercise_log_set_details.rpe end,
            rir=case when v_details?'rir' then excluded.rir else exercise_log_set_details.rir end,
            notes=case when v_details?'notes' then excluded.notes else exercise_log_set_details.notes end,
            side_mode=case when v_details?'sideMode' then excluded.side_mode else exercise_log_set_details.side_mode end,
            planned_tempo=case when v_details?'plannedTempo' then excluded.planned_tempo else exercise_log_set_details.planned_tempo end,
            performed_tempo=case when v_details?'performedTempo' then excluded.performed_tempo else exercise_log_set_details.performed_tempo end,
            tempo_adherence=case when v_details?'tempoAdherence' then excluded.tempo_adherence else exercise_log_set_details.tempo_adherence end,
            source='manual',source_provider=null,source_version=null,
            updated_at=clock_timestamp();
$new$;
begin
  select pg_get_functiondef(
    'public.correct_completed_workout_session_atomic(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Workout correction set-detail patch target was not found exactly.';
  end if;
  v_definition:=replace(v_definition,v_old,v_new);
  if position(v_old in v_definition)>0
     or position('rpe=case when v_details?''rpe''' in v_definition)=0
     or position('planned_tempo=case when v_details?''plannedTempo''' in v_definition)=0 then
    raise exception 'Workout correction set-detail merge semantics were not installed safely.';
  end if;
  execute v_definition;
end
$patch_set_detail_semantics$;

do $postflight$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.correct_completed_workout_session_atomic(uuid,uuid,bigint,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if position('rpe=case when v_details?''rpe''' in v_definition)=0
     or position('rir=case when v_details?''rir''' in v_definition)=0
     or position('side_mode=case when v_details?''sideMode''' in v_definition)=0
     or position('tempo_adherence=case when v_details?''tempoAdherence''' in v_definition)=0 then
    raise exception 'Workout correction structured detail patch semantics are incomplete.';
  end if;
end
$postflight$;

commit;
