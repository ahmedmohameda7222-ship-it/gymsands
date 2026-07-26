begin;

-- AW-3C independent pre-AW-4 audit correction.
-- The original AW-3C migration is immutable. This forward migration:
--   1. makes immutable-graph retry comparison independent of target array order;
--   2. enforces contiguous prescription set_order values because execution cursors
--      use ordinal set positions;
--   3. preserves every existing row, compatibility marker, ACL and RLS boundary.

do $aw3c_audit_preflight$
begin
  if to_regclass('public.workout_session_prescription_sets') is null
     or to_regclass('public.workout_session_prescription_metric_targets') is null
     or to_regprocedure('private.materialize_workout_session_prescription_item(uuid)') is null
     or to_regprocedure('private.enforce_workout_session_prescription_set_immutability()') is null then
    raise exception 'AW-3C audit correction prerequisites are missing.' using errcode = '42P01';
  end if;

  if to_regprocedure('private.canonicalize_workout_session_prescription_graph(jsonb)') is not null then
    raise exception 'AW-3C audit correction is already present.' using errcode = '42P07';
  end if;

  if (select migration_version from public.release_schema_compatibility where singleton)
       is distinct from '20260724232734' then
    raise exception 'AW-3C audit correction requires compatibility marker 20260724232734.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (
      select
        snapshot_item_id,
        count(*)::integer as set_count,
        min(set_order)::integer as min_order,
        max(set_order)::integer as max_order,
        count(distinct set_order)::integer as distinct_orders
      from public.workout_session_prescription_sets
      group by snapshot_item_id
    ) item_sets
    where item_sets.min_order <> 1
       or item_sets.max_order <> item_sets.set_count
       or item_sets.distinct_orders <> item_sets.set_count
  ) then
    raise exception 'Existing AW-3C prescription set_order values are not contiguous.'
      using errcode = '23514';
  end if;
end
$aw3c_audit_preflight$;

create temporary table aw3c_audit_protected_baseline on commit drop as
select
  (select count(*) from public.workout_session_prescription_sets) as set_count,
  (select count(*) from public.workout_session_prescription_metric_targets) as target_count,
  (select encode(extensions.digest(coalesce(string_agg(
      id::text || ':' || snapshot_item_id::text || ':' || set_order::text || ':' ||
      set_type || ':' || target_mode || ':' || side_mode || ':' ||
      coalesce(rest_seconds::text,'') || ':' || coalesce(tempo_target,''),
      '|' order by id
    ), ''), 'sha256'), 'hex')
   from public.workout_session_prescription_sets) as set_hash,
  (select encode(extensions.digest(coalesce(string_agg(
      id::text || ':' || prescription_set_id::text || ':' || metric_key || ':' ||
      metric_version::text || ':' || side || ':' || target_mode || ':' ||
      coalesce(target_value::text,'') || ':' || coalesce(minimum_value::text,'') || ':' ||
      coalesce(maximum_value::text,''),
      '|' order by id
    ), ''), 'sha256'), 'hex')
   from public.workout_session_prescription_metric_targets) as target_hash,
  (select migration_version from public.release_schema_compatibility where singleton) as marker;

create or replace function private.canonicalize_workout_session_prescription_graph(p_graph jsonb)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $aw3c_canonical_graph$
  select coalesce(
    jsonb_agg(
      jsonb_set(
        set_node,
        '{targets}',
        coalesce(
          (
            select jsonb_agg(
              target_node
              order by
                target_node->>'metric_key',
                (target_node->>'metric_version')::integer,
                target_node->>'side'
            )
            from jsonb_array_elements(coalesce(set_node->'targets', '[]'::jsonb)) target_node
          ),
          '[]'::jsonb
        ),
        true
      )
      order by (set_node->>'set_order')::integer
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p_graph) set_node
$aw3c_canonical_graph$;

revoke all on function private.canonicalize_workout_session_prescription_graph(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_workout_session_prescription_set_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $aw3c_set_immutability$
declare
  v_expected_order integer;
begin
  if tg_op = 'INSERT' then
    if current_setting('plaivra.aw3c_materialization_item_id', true)
         is distinct from new.snapshot_item_id::text then
      raise exception 'Workout-session prescription sets are writable only by the scoped materializer.'
        using errcode = '42501';
    end if;

    select count(*)::integer + 1
      into v_expected_order
    from public.workout_session_prescription_sets existing
    where existing.snapshot_item_id = new.snapshot_item_id;

    if new.set_order <> v_expected_order then
      raise exception 'Workout-session prescription set_order must be contiguous; expected %, received %.',
        v_expected_order, new.set_order
        using errcode = '23514';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (
      select 1
      from public.workout_session_muscle_snapshot_items item
      where item.id = old.snapshot_item_id
    ) then
      raise exception 'Workout-session prescription sets are immutable.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  raise exception 'Workout-session prescription sets are immutable.'
    using errcode = '42501';
end
$aw3c_set_immutability$;

revoke all on function private.enforce_workout_session_prescription_set_immutability()
  from public, anon, authenticated, service_role;

do $aw3c_patch_materializer$
declare
  v_definition text;
  v_needle text := $needle$
  if v_existing <> '[]'::jsonb then
    if v_existing <> v_expected then
$needle$;
  v_replacement text := $replacement$
  if v_existing <> '[]'::jsonb then
    if private.canonicalize_workout_session_prescription_graph(v_existing)
       <> private.canonicalize_workout_session_prescription_graph(v_expected) then
$replacement$;
begin
  select pg_get_functiondef(
    'private.materialize_workout_session_prescription_item(uuid)'::regprocedure
  ) into strict v_definition;

  if strpos(v_definition, v_needle) = 0 then
    raise exception 'AW-3C materializer comparison patch point was not found.'
      using errcode = '55000';
  end if;
  if strpos(substr(v_definition, strpos(v_definition, v_needle) + char_length(v_needle)), v_needle) > 0 then
    raise exception 'AW-3C materializer comparison patch point is ambiguous.'
      using errcode = '55000';
  end if;

  v_definition := replace(v_definition, v_needle, v_replacement);
  execute v_definition;
end
$aw3c_patch_materializer$;

revoke all on function private.materialize_workout_session_prescription_item(uuid)
  from public, anon, authenticated, service_role;

do $aw3c_audit_behavior$
declare
  v_left jsonb;
  v_right jsonb;
  v_item_id uuid;
  v_before_sets bigint;
  v_before_targets bigint;
  v_after_sets bigint;
  v_after_targets bigint;
begin
  v_left := jsonb_build_array(jsonb_build_object(
    'set_order', 1,
    'targets', jsonb_build_array(
      jsonb_build_object('metric_key','repetitions','metric_version',1,'side','none','target_mode','range','target_value',null,'minimum_value',8,'maximum_value',12),
      jsonb_build_object('metric_key','external_load_kg','metric_version',1,'side','none','target_mode','exact','target_value',80,'minimum_value',null,'maximum_value',null)
    )
  ));
  v_right := jsonb_build_array(jsonb_build_object(
    'set_order', 1,
    'targets', jsonb_build_array(
      jsonb_build_object('metric_key','external_load_kg','metric_version',1,'side','none','target_mode','exact','target_value',80,'minimum_value',null,'maximum_value',null),
      jsonb_build_object('metric_key','repetitions','metric_version',1,'side','none','target_mode','range','target_value',null,'minimum_value',8,'maximum_value',12)
    )
  ));

  if private.canonicalize_workout_session_prescription_graph(v_left)
       <> private.canonicalize_workout_session_prescription_graph(v_right) then
    raise exception 'AW-3C canonical graph comparison remains target-order sensitive.'
      using errcode = '23514';
  end if;

  if pg_get_functiondef(
       'private.materialize_workout_session_prescription_item(uuid)'::regprocedure
     ) not like '%private.canonicalize_workout_session_prescription_graph(v_existing)%'
     or pg_get_functiondef(
       'private.materialize_workout_session_prescription_item(uuid)'::regprocedure
     ) not like '%private.canonicalize_workout_session_prescription_graph(v_expected)%' then
    raise exception 'AW-3C materializer does not use canonical graph comparison.'
      using errcode = '55000';
  end if;

  select count(*) into v_before_sets
  from public.workout_session_prescription_sets;
  select count(*) into v_before_targets
  from public.workout_session_prescription_metric_targets;

  perform set_config('plaivra.aw3c_backfill', 'on', true);
  for v_item_id in
    select item.id
    from public.workout_session_muscle_snapshot_items item
    order by item.id
  loop
    perform private.materialize_workout_session_prescription_item(v_item_id);
  end loop;
  perform set_config('plaivra.aw3c_backfill', '', true);

  select count(*) into v_after_sets
  from public.workout_session_prescription_sets;
  select count(*) into v_after_targets
  from public.workout_session_prescription_metric_targets;

  if v_before_sets <> v_after_sets or v_before_targets <> v_after_targets then
    raise exception 'AW-3C audit correction changed graph counts during exact retry.'
      using errcode = '23514';
  end if;
end
$aw3c_audit_behavior$;

do $aw3c_audit_postflight$
declare
  v_baseline aw3c_audit_protected_baseline%rowtype;
  v_set_hash text;
  v_target_hash text;
begin
  select * into strict v_baseline from aw3c_audit_protected_baseline;

  select encode(extensions.digest(coalesce(string_agg(
      id::text || ':' || snapshot_item_id::text || ':' || set_order::text || ':' ||
      set_type || ':' || target_mode || ':' || side_mode || ':' ||
      coalesce(rest_seconds::text,'') || ':' || coalesce(tempo_target,''),
      '|' order by id
    ), ''), 'sha256'), 'hex')
    into v_set_hash
  from public.workout_session_prescription_sets;

  select encode(extensions.digest(coalesce(string_agg(
      id::text || ':' || prescription_set_id::text || ':' || metric_key || ':' ||
      metric_version::text || ':' || side || ':' || target_mode || ':' ||
      coalesce(target_value::text,'') || ':' || coalesce(minimum_value::text,'') || ':' ||
      coalesce(maximum_value::text,''),
      '|' order by id
    ), ''), 'sha256'), 'hex')
    into v_target_hash
  from public.workout_session_prescription_metric_targets;

  if v_baseline.set_count <> (select count(*) from public.workout_session_prescription_sets)
     or v_baseline.target_count <> (select count(*) from public.workout_session_prescription_metric_targets)
     or v_baseline.set_hash is distinct from v_set_hash
     or v_baseline.target_hash is distinct from v_target_hash then
    raise exception 'AW-3C audit correction changed immutable prescription data.'
      using errcode = '23514';
  end if;

  if v_baseline.marker is distinct from
       (select migration_version from public.release_schema_compatibility where singleton) then
    raise exception 'AW-3C audit correction changed the compatibility marker.'
      using errcode = '55000';
  end if;

  if has_function_privilege(
       'authenticated',
       'private.canonicalize_workout_session_prescription_graph(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'private.canonicalize_workout_session_prescription_graph(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.materialize_workout_session_prescription_item(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'private.materialize_workout_session_prescription_item(uuid)',
       'EXECUTE'
     ) then
    raise exception 'AW-3C audit correction exposed a private function.'
      using errcode = '42501';
  end if;
end
$aw3c_audit_postflight$;

commit;
