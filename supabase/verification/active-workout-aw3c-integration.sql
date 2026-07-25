\set ON_ERROR_STOP on

begin;

do $$
declare
  v_item_id uuid;
  v_before_sets bigint;
  v_before_targets bigint;
  v_after_sets bigint;
  v_after_targets bigint;
  v_before_hash text;
  v_after_hash text;
begin
  select count(*) into v_before_sets from public.workout_session_prescription_sets;
  select count(*) into v_before_targets from public.workout_session_prescription_metric_targets;
  select encode(extensions.digest(coalesce(string_agg(
    item.id::text || ':' || item.planned_prescription::text || ':' || coalesce(item.planned_sets::text,''),
    '|' order by item.id),''),'sha256'),'hex') into v_before_hash
  from public.workout_session_muscle_snapshot_items item;

  perform set_config('plaivra.aw3c_backfill','on',true);
  for v_item_id in select item.id from public.workout_session_muscle_snapshot_items item order by item.id loop
    perform private.materialize_workout_session_prescription_item(v_item_id);
  end loop;
  perform set_config('plaivra.aw3c_backfill','',true);

  select count(*) into v_after_sets from public.workout_session_prescription_sets;
  select count(*) into v_after_targets from public.workout_session_prescription_metric_targets;
  select encode(extensions.digest(coalesce(string_agg(
    item.id::text || ':' || item.planned_prescription::text || ':' || coalesce(item.planned_sets::text,''),
    '|' order by item.id),''),'sha256'),'hex') into v_after_hash
  from public.workout_session_muscle_snapshot_items item;

  if v_before_sets <> v_after_sets or v_before_targets <> v_after_targets then
    raise exception 'AW-3C retry materialization was not an exact no-op.';
  end if;
  if v_before_hash <> v_after_hash then
    raise exception 'AW-3C retry changed frozen compatibility JSON.';
  end if;
end
$$;

do $$
begin
  begin
    insert into public.workout_session_prescription_sets(
      snapshot_item_id,snapshot_id,workout_session_id,user_id,set_order,set_type,target_mode
    ) values (
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'other','custom'
    );
    raise exception 'Direct AW-3C set insert unexpectedly succeeded.';
  exception when insufficient_privilege or foreign_key_violation then
    null;
  end;

  if exists (
    select 1 from public.workout_session_prescription_metric_targets target
    join public.workout_performance_metric_definitions definition
      on definition.metric_key=target.metric_key and definition.metric_version=target.metric_version
    where (definition.value_kind='integer' and (
      (target.target_value is not null and trunc(target.target_value)<>target.target_value)
      or (target.minimum_value is not null and trunc(target.minimum_value)<>target.minimum_value)
      or (target.maximum_value is not null and trunc(target.maximum_value)<>target.maximum_value)
    ))
    or coalesce(target.target_value,target.minimum_value,target.maximum_value,definition.minimum_value) < definition.minimum_value
    or coalesce(target.target_value,target.minimum_value,target.maximum_value,definition.maximum_value) > definition.maximum_value
    or (not definition.supports_side and target.side<>'none')
  ) then raise exception 'AW-3C target registry validation invariant failed.'; end if;
end
$$;

rollback;
