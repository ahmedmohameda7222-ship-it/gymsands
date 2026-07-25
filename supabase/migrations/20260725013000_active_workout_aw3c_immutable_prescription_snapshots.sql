begin;

-- AW-3C preflight: the released AW-3B compatibility boundary and effective
-- snapshot/session authorities must be present before this forward migration.
do $$
declare
  v_marker text;
begin
  if to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null
     or to_regclass('public.workout_performance_metric_definitions') is null then
    raise exception 'AW-3C prerequisite tables are missing.' using errcode = '42P01';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker is distinct from '20260724232734' then
    raise exception 'AW-3C requires released compatibility marker 20260724232734, found %.', v_marker
      using errcode = '55000';
  end if;

  if to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)') is null
     or to_regprocedure('private.aw2c_core_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.purge_account_application_data_atomic(uuid)') is null then
    raise exception 'AW-3C prerequisite authorities are missing.' using errcode = '42883';
  end if;

  if to_regclass('public.workout_session_prescription_sets') is not null
     or to_regclass('public.workout_session_prescription_metric_targets') is not null then
    raise exception 'AW-3C canonical tables already exist.' using errcode = '42P07';
  end if;
end
$$;

create temporary table aw3c_protected_baseline on commit drop as
select
  (select count(*) from public.workout_sessions) as workout_sessions_count,
  (select count(*) from public.exercise_logs) as exercise_logs_count,
  (select count(*) from public.exercise_log_metric_values) as metric_values_count,
  (select count(*) from public.exercise_log_set_details) as set_details_count,
  (select count(*) from public.exercise_log_set_segments) as set_segments_count,
  (select count(*) from public.exercise_log_set_segment_metric_values) as segment_metric_values_count,
  (select count(*) from public.workout_session_timeline_events) as timeline_count,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshot_count,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_item_count,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || planned_prescription::text || ':' || coalesce(planned_sets::text,''), '|' order by id), ''), 'sha256'), 'hex')
     from public.workout_session_muscle_snapshot_items) as snapshot_json_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || coalesce(status::text,'') || ':' || coalesce(duration_minutes::text,''), '|' order by id), ''), 'sha256'), 'hex')
     from public.workout_sessions) as workout_sessions_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || coalesce(set_number::text,'') || ':' || coalesce(reps::text,'') || ':' || coalesce(weight_kg::text,''), '|' order by id), ''), 'sha256'), 'hex')
     from public.exercise_logs) as exercise_logs_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || metric_key || ':' || metric_version::text || ':' || side || ':' || value::text, '|' order by id), ''), 'sha256'), 'hex')
     from public.exercise_log_metric_values) as metric_values_hash,
  (select encode(extensions.digest(coalesce(string_agg(exercise_log_id::text || ':' || set_type || ':' || coalesce(planned_tempo,'') || ':' || side_mode, '|' order by exercise_log_id), ''), 'sha256'), 'hex')
     from public.exercise_log_set_details) as set_details_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || segment_order::text || ':' || segment_kind || ':' || side, '|' order by id), ''), 'sha256'), 'hex')
     from public.exercise_log_set_segments) as set_segments_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || metric_key || ':' || value::text, '|' order by id), ''), 'sha256'), 'hex')
     from public.exercise_log_set_segment_metric_values) as segment_metric_values_hash,
  (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || sequence_number::text || ':' || event_type || ':' || payload::text, '|' order by id), ''), 'sha256'), 'hex')
     from public.workout_session_timeline_events) as timeline_hash;

alter table public.workout_session_muscle_snapshots
  add constraint workout_session_muscle_snapshots_aw3c_owner_path_key
  unique (id, workout_session_id, user_id);

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_aw3c_owner_path_key
  unique (id, snapshot_id, user_id);

create table public.workout_session_prescription_sets (
  id uuid primary key default gen_random_uuid(),
  snapshot_item_id uuid not null,
  snapshot_id uuid not null,
  workout_session_id uuid not null,
  user_id uuid not null,
  set_order integer not null,
  performed_order_hint integer,
  set_type text not null,
  target_mode text not null,
  side_mode text not null default 'none',
  rest_seconds integer,
  tempo_target text,
  schema_version smallint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  constraint workout_session_prescription_sets_order_check
    check (set_order between 1 and 100),
  constraint workout_session_prescription_sets_performed_order_check
    check (performed_order_hint is null or performed_order_hint between 1 and 100),
  constraint workout_session_prescription_sets_type_check
    check (set_type in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other')),
  constraint workout_session_prescription_sets_target_mode_check
    check (target_mode in ('exact','range','minimum','maximum','amrap','timed','distance','rounds','mixed','custom')),
  constraint workout_session_prescription_sets_side_mode_check
    check (side_mode in ('none','bilateral','left','right','alternating')),
  constraint workout_session_prescription_sets_rest_check
    check (rest_seconds is null or rest_seconds between 0 and 86400),
  constraint workout_session_prescription_sets_tempo_check
    check (tempo_target is null or (char_length(tempo_target) <= 64 and tempo_target !~ '[[:cntrl:]]')),
  constraint workout_session_prescription_sets_schema_check
    check (schema_version = 1),
  constraint workout_session_prescription_sets_item_order_key
    unique (snapshot_item_id, set_order),
  constraint workout_session_prescription_sets_owner_identity_key
    unique (id, snapshot_item_id, workout_session_id, user_id),
  constraint workout_session_prescription_sets_snapshot_owner_fk
    foreign key (snapshot_id, workout_session_id, user_id)
      references public.workout_session_muscle_snapshots(id, workout_session_id, user_id)
      on delete cascade,
  constraint workout_session_prescription_sets_item_owner_fk
    foreign key (snapshot_item_id, snapshot_id, user_id)
      references public.workout_session_muscle_snapshot_items(id, snapshot_id, user_id)
      on delete cascade
);

create table public.workout_session_prescription_metric_targets (
  id uuid primary key default gen_random_uuid(),
  prescription_set_id uuid not null,
  snapshot_item_id uuid not null,
  workout_session_id uuid not null,
  user_id uuid not null,
  metric_key text not null,
  metric_version smallint not null,
  side text not null,
  target_value numeric,
  minimum_value numeric,
  maximum_value numeric,
  target_mode text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint workout_session_prescription_metric_targets_side_check
    check (side in ('none','bilateral','left','right')),
  constraint workout_session_prescription_metric_targets_mode_check
    check (target_mode in ('exact','range','minimum','maximum','amrap','timed','distance','rounds','custom')),
  constraint workout_session_prescription_metric_targets_shape_check check (
    (target_mode = 'exact' and target_value is not null and minimum_value is null and maximum_value is null)
    or (target_mode = 'range' and target_value is null and minimum_value is not null and maximum_value is not null and minimum_value <= maximum_value)
    or (target_mode = 'minimum' and target_value is null and minimum_value is not null and maximum_value is null)
    or (target_mode = 'maximum' and target_value is null and minimum_value is null and maximum_value is not null)
    or (target_mode = 'amrap' and target_value is null and minimum_value is null and maximum_value is null)
    or (target_mode in ('timed','distance','rounds') and target_value is not null and minimum_value is null and maximum_value is null)
    or (target_mode = 'custom' and target_value is null and minimum_value is null and maximum_value is null)
  ),
  constraint workout_session_prescription_metric_targets_identity_key
    unique (prescription_set_id, metric_key, metric_version, side),
  constraint workout_session_prescription_metric_targets_metric_fk
    foreign key (metric_key, metric_version)
      references public.workout_performance_metric_definitions(metric_key, metric_version)
      on delete restrict,
  constraint workout_session_prescription_metric_targets_owner_path_fk
    foreign key (prescription_set_id, snapshot_item_id, workout_session_id, user_id)
      references public.workout_session_prescription_sets(id, snapshot_item_id, workout_session_id, user_id)
      on delete cascade
);

create index workout_session_prescription_sets_session_item_order_idx
  on public.workout_session_prescription_sets(workout_session_id, snapshot_item_id, set_order, id);
create index workout_session_prescription_sets_snapshot_owner_fk_idx
  on public.workout_session_prescription_sets(snapshot_id, workout_session_id, user_id);
create index workout_session_prescription_sets_item_owner_fk_idx
  on public.workout_session_prescription_sets(snapshot_item_id, snapshot_id, user_id);
create index workout_session_prescription_sets_export_idx
  on public.workout_session_prescription_sets(user_id, workout_session_id, snapshot_item_id, set_order, id);

create index workout_session_prescription_targets_owner_path_idx
  on public.workout_session_prescription_metric_targets(prescription_set_id, snapshot_item_id, workout_session_id, user_id);
create index workout_session_prescription_targets_metric_fk_idx
  on public.workout_session_prescription_metric_targets(metric_key, metric_version);
create index workout_session_prescription_targets_export_idx
  on public.workout_session_prescription_metric_targets(user_id, workout_session_id, snapshot_item_id, prescription_set_id, metric_key, metric_version, side, id);

alter table public.workout_session_prescription_sets enable row level security;
alter table public.workout_session_prescription_metric_targets enable row level security;

create policy workout_session_prescription_sets_owner_select
  on public.workout_session_prescription_sets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy workout_session_prescription_targets_owner_select
  on public.workout_session_prescription_metric_targets
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.workout_session_prescription_sets from public, anon, authenticated, service_role;
revoke all on table public.workout_session_prescription_metric_targets from public, anon, authenticated, service_role;
grant select on table public.workout_session_prescription_sets to authenticated, service_role;
grant select on table public.workout_session_prescription_metric_targets to authenticated, service_role;

create or replace function private.validate_workout_session_prescription_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.workout_performance_metric_definitions%rowtype;
  v_value numeric;
begin
  select definition.* into v_definition
  from public.workout_performance_metric_definitions definition
  where definition.metric_key = new.metric_key
    and definition.metric_version = new.metric_version;
  if not found then
    raise exception 'Unknown workout prescription metric identity.' using errcode = '23503';
  end if;

  if not v_definition.supports_side and new.side <> 'none' then
    raise exception 'Workout prescription metric does not support side-specific values.' using errcode = '23514';
  end if;

  foreach v_value in array array[new.target_value, new.minimum_value, new.maximum_value] loop
    if v_value is null then continue; end if;
    if v_value < v_definition.minimum_value or v_value > v_definition.maximum_value then
      raise exception 'Workout prescription metric value is outside the registry bounds.' using errcode = '23514';
    end if;
    if v_definition.value_kind = 'integer' and trunc(v_value) <> v_value then
      raise exception 'Workout prescription integer metric requires integer values.' using errcode = '23514';
    end if;
  end loop;

  if new.target_mode = 'amrap' and new.metric_key <> 'repetitions' then
    raise exception 'AMRAP targets must use repetitions.' using errcode = '23514';
  elsif new.target_mode = 'timed' and new.metric_key <> 'duration_seconds' then
    raise exception 'Timed targets must use duration_seconds.' using errcode = '23514';
  elsif new.target_mode = 'distance' and new.metric_key <> 'distance_meters' then
    raise exception 'Distance targets must use distance_meters.' using errcode = '23514';
  elsif new.target_mode = 'rounds' and new.metric_key <> 'rounds' then
    raise exception 'Rounds targets must use rounds.' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger workout_session_prescription_target_validator
before insert or update on public.workout_session_prescription_metric_targets
for each row execute function private.validate_workout_session_prescription_target();

create or replace function private.enforce_workout_session_prescription_set_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('plaivra.aw3c_materialization_item_id', true) is distinct from new.snapshot_item_id::text then
      raise exception 'Workout-session prescription sets are writable only by the scoped materializer.' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    raise exception 'Workout-session prescription sets are immutable.' using errcode = '55000';
  elsif not exists (
    select 1 from public.workout_session_muscle_snapshot_items item
    where item.id = old.snapshot_item_id and item.snapshot_id = old.snapshot_id and item.user_id = old.user_id
  ) then
    return old;
  end if;
  raise exception 'Workout-session prescription sets may be deleted only by a trusted parent cascade.' using errcode = '55000';
end
$$;

create or replace function private.enforce_workout_session_prescription_target_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('plaivra.aw3c_materialization_item_id', true) is distinct from new.snapshot_item_id::text then
      raise exception 'Workout-session prescription targets are writable only by the scoped materializer.' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    raise exception 'Workout-session prescription targets are immutable.' using errcode = '55000';
  elsif not exists (
    select 1 from public.workout_session_prescription_sets prescription_set
    where prescription_set.id = old.prescription_set_id
      and prescription_set.snapshot_item_id = old.snapshot_item_id
      and prescription_set.workout_session_id = old.workout_session_id
      and prescription_set.user_id = old.user_id
  ) then
    return old;
  end if;
  raise exception 'Workout-session prescription targets may be deleted only by a trusted parent cascade.' using errcode = '55000';
end
$$;

create trigger workout_session_prescription_sets_immutable
before insert or update or delete on public.workout_session_prescription_sets
for each row execute function private.enforce_workout_session_prescription_set_immutability();

create trigger workout_session_prescription_targets_immutable
before insert or update or delete on public.workout_session_prescription_metric_targets
for each row execute function private.enforce_workout_session_prescription_target_immutability();

create or replace function private.materialize_workout_session_prescription_item(p_snapshot_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_raw jsonb;
  v_explicit_sets jsonb := '[]'::jsonb;
  v_scalar_targets jsonb := '[]'::jsonb;
  v_expected jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb;
  v_orders integer[] := array[]::integer[];
  v_scalar_count integer;
  v_scalar_set_type text := 'other';
  v_scalar_side_mode text := 'none';
  v_scalar_rest integer;
  v_scalar_tempo text;
  v_set_order integer;
  v_set_desc jsonb;
  v_set_type text;
  v_side_mode text;
  v_rest integer;
  v_tempo text;
  v_performed_order_hint integer;
  v_targets jsonb;
  v_target jsonb;
  v_normalized_target jsonb;
  v_target_count integer;
  v_set_target_mode text;
  v_metric_key text;
  v_metric_version integer;
  v_metric_side text;
  v_metric_mode text;
  v_target_value numeric;
  v_minimum_value numeric;
  v_maximum_value numeric;
  v_match text[];
  v_text text;
  v_value_json jsonb;
  v_alias_a jsonb;
  v_alias_b jsonb;
  v_set_id uuid;
  v_inserted_sets integer := 0;
  v_inserted_targets integer := 0;
  v_prior_materialization text;
  v_status text;
  v_is_backfill boolean;
  v_duplicate_count integer;
  v_verify_only boolean;
begin
  if p_snapshot_item_id is null then
    raise exception 'Snapshot item id is required.' using errcode = '23514';
  end if;

  select item.* into v_item
  from public.workout_session_muscle_snapshot_items item
  join public.workout_session_muscle_snapshots snapshot
    on snapshot.id = item.snapshot_id and snapshot.user_id = item.user_id
  join public.workout_sessions session
    on session.id = snapshot.workout_session_id and session.user_id = snapshot.user_id
  where item.id = p_snapshot_item_id
  for update of item, snapshot;
  if not found then raise exception 'Workout-session snapshot item not found.' using errcode = 'P0002'; end if;

  select snapshot.* into strict v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.id = v_item.snapshot_id and snapshot.user_id = v_item.user_id;

  v_is_backfill := current_setting('plaivra.aw3c_backfill', true) = 'on'
    and current_user in ('postgres','supabase_admin');
  v_verify_only := current_setting('plaivra.aw3c_verify_only', true) = 'on';
  if current_setting('plaivra.session_snapshot_mutation_id', true) is distinct from v_snapshot.id::text
     and not v_is_backfill then
    raise exception 'The scoped snapshot mutation identity is required for prescription materialization.' using errcode = '42501';
  end if;

  v_raw := v_item.planned_prescription;
  if jsonb_typeof(v_raw) <> 'object' then
    raise exception 'Planned prescription must be a JSON object.' using errcode = '22023';
  end if;
  if octet_length(convert_to(v_raw::text, 'UTF8')) > 65536 then
    raise exception 'Planned prescription exceeds 65536 bytes.' using errcode = '22023';
  end if;

  if v_raw ? 'set_targets' then
    if jsonb_typeof(v_raw->'set_targets') <> 'array' then
      raise exception 'set_targets must be an array.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_raw->'set_targets') > 100 then
      raise exception 'set_targets exceeds 100 entries.' using errcode = '22023';
    end if;
    v_explicit_sets := v_raw->'set_targets';
    if exists (select 1 from jsonb_array_elements(v_explicit_sets) element where jsonb_typeof(element) <> 'object') then
      raise exception 'Every set_targets entry must be an object.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_explicit_sets) element
      where not (element ? 'set_order')
         or jsonb_typeof(element->'set_order') not in ('number','string')
         or btrim(element->>'set_order') !~ '^[0-9]+$'
         or (element->>'set_order')::integer not between 1 and 100
    ) then
      raise exception 'Every explicit set requires a unique set_order from 1 through 100.' using errcode = '22023';
    end if;
    select count(*) - count(distinct (element->>'set_order')::integer) into v_duplicate_count
    from jsonb_array_elements(v_explicit_sets) element;
    if v_duplicate_count <> 0 then
      raise exception 'Duplicate explicit set_order.' using errcode = '23505';
    end if;
  end if;

  if v_raw ? 'sets' then
    if jsonb_typeof(v_raw->'sets') not in ('number','string')
       or btrim(v_raw->>'sets') !~ '^[0-9]+$'
       or (v_raw->>'sets')::integer not between 1 and 100 then
      raise exception 'sets must be an integer from 1 through 100.' using errcode = '22023';
    end if;
    v_scalar_count := (v_raw->>'sets')::integer;
  elsif v_item.planned_sets between 1 and 100 then
    v_scalar_count := v_item.planned_sets;
  end if;

  if v_scalar_count is not null and exists (
    select 1 from jsonb_array_elements(v_explicit_sets) element
    where (element->>'set_order')::integer > v_scalar_count
  ) then
    raise exception 'Explicit set_order contradicts scalar sets.' using errcode = '23514';
  end if;

  if v_raw ? 'set_type' then
    if jsonb_typeof(v_raw->'set_type') <> 'string'
       or v_raw->>'set_type' not in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other') then
      raise exception 'Unsupported scalar set_type.' using errcode = '22023';
    end if;
    v_scalar_set_type := v_raw->>'set_type';
  end if;

  if v_raw ? 'side_mode' then
    if jsonb_typeof(v_raw->'side_mode') <> 'string'
       or v_raw->>'side_mode' not in ('none','bilateral','left','right','alternating') then
      raise exception 'Unsupported scalar side_mode.' using errcode = '22023';
    end if;
    v_scalar_side_mode := v_raw->>'side_mode';
  end if;

  v_alias_a := v_raw->'rest_seconds';
  v_alias_b := v_raw->'restSeconds';
  if v_alias_a is not null and v_alias_b is not null and v_alias_a <> v_alias_b then
    raise exception 'rest_seconds and restSeconds disagree.' using errcode = '23514';
  end if;
  v_value_json := coalesce(v_alias_a, v_alias_b);
  if v_value_json is not null then
    if jsonb_typeof(v_value_json) not in ('number','string')
       or btrim(v_value_json #>> '{}') !~ '^[0-9]+$'
       or (v_value_json #>> '{}')::integer not between 0 and 86400 then
      raise exception 'rest_seconds must be an integer from 0 through 86400.' using errcode = '22023';
    end if;
    v_scalar_rest := (v_value_json #>> '{}')::integer;
  end if;

  if v_raw ? 'tempo' then
    if jsonb_typeof(v_raw->'tempo') <> 'string'
       or char_length(v_raw->>'tempo') > 64
       or v_raw->>'tempo' ~ '[[:cntrl:]]' then
      raise exception 'tempo is invalid.' using errcode = '22023';
    end if;
    v_scalar_tempo := v_raw->>'tempo';
  end if;

  if v_raw ? 'reps' then
    v_value_json := v_raw->'reps';
    if jsonb_typeof(v_value_json) = 'number' then
      v_text := v_value_json #>> '{}';
      if v_text !~ '^[0-9]+$' then
        raise exception 'Numeric repetitions must be an integer.' using errcode = '22023';
      end if;
      v_scalar_targets := v_scalar_targets || jsonb_build_array(jsonb_build_object(
        'metric_key','repetitions','metric_version',1,'side','none','target_mode','exact',
        'target_value',v_text::numeric,'minimum_value',null,'maximum_value',null));
    elsif jsonb_typeof(v_value_json) = 'string' then
      v_text := btrim(v_value_json #>> '{}');
      if v_text ~ '^[0-9]+$' then
        v_scalar_targets := v_scalar_targets || jsonb_build_array(jsonb_build_object(
          'metric_key','repetitions','metric_version',1,'side','none','target_mode','exact',
          'target_value',v_text::numeric,'minimum_value',null,'maximum_value',null));
      elsif v_text ~ '^[0-9]+[-–][0-9]+$' then
        v_match := regexp_match(v_text, '^([0-9]+)[-–]([0-9]+)$');
        if v_match[1]::numeric > v_match[2]::numeric then
          raise exception 'Repetition range minimum exceeds maximum.' using errcode = '23514';
        end if;
        v_scalar_targets := v_scalar_targets || jsonb_build_array(jsonb_build_object(
          'metric_key','repetitions','metric_version',1,'side','none','target_mode','range',
          'target_value',null,'minimum_value',v_match[1]::numeric,'maximum_value',v_match[2]::numeric));
      elsif lower(v_text) = 'amrap' then
        v_scalar_targets := v_scalar_targets || jsonb_build_array(jsonb_build_object(
          'metric_key','repetitions','metric_version',1,'side','none','target_mode','amrap',
          'target_value',null,'minimum_value',null,'maximum_value',null));
      end if;
    else
      raise exception 'reps must be a number or string.' using errcode = '22023';
    end if;
  end if;

  -- Exact approved numeric scalar metrics. Snake case is canonical; the listed
  -- camel-case spellings remain read compatibility only.
  for v_target in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('snake','duration_seconds','camel','durationSeconds','metric','duration_seconds','mode','timed'),
    jsonb_build_object('snake','distance_meters','camel','distanceMeters','metric','distance_meters','mode','distance'),
    jsonb_build_object('snake','rounds','camel',null,'metric','rounds','mode','rounds'),
    jsonb_build_object('snake','external_load_kg','camel','externalLoadKg','metric','external_load_kg','mode','exact'),
    jsonb_build_object('snake','bodyweight_kg','camel','bodyweightKg','metric','bodyweight_kg','mode','exact'),
    jsonb_build_object('snake','assistance_load_kg','camel','assistanceLoadKg','metric','assistance_load_kg','mode','exact')
  )) loop
    v_alias_a := v_raw->(v_target->>'snake');
    v_alias_b := case when v_target->>'camel' is null then null else v_raw->(v_target->>'camel') end;
    if v_alias_a is not null and v_alias_b is not null and v_alias_a <> v_alias_b then
      raise exception 'Prescription metric aliases disagree for %.', v_target->>'metric' using errcode = '23514';
    end if;
    v_value_json := coalesce(v_alias_a, v_alias_b);
    if v_value_json is null then continue; end if;
    if jsonb_typeof(v_value_json) not in ('number','string')
       or btrim(v_value_json #>> '{}') !~ '^[0-9]+(?:\.[0-9]+)?$' then
      raise exception 'Prescription metric % must be a non-negative number.', v_target->>'metric' using errcode = '22023';
    end if;
    v_scalar_targets := v_scalar_targets || jsonb_build_array(jsonb_build_object(
      'metric_key',v_target->>'metric','metric_version',1,'side','none','target_mode',v_target->>'mode',
      'target_value',(v_value_json #>> '{}')::numeric,'minimum_value',null,'maximum_value',null));
  end loop;

  if v_scalar_count is not null then
    select array_agg(order_value order by order_value) into v_orders
    from generate_series(1, v_scalar_count) order_value;
  elsif jsonb_array_length(v_explicit_sets) > 0 then
    select array_agg((element->>'set_order')::integer order by (element->>'set_order')::integer) into v_orders
    from jsonb_array_elements(v_explicit_sets) element;
  end if;
  v_orders := coalesce(v_orders, array[]::integer[]);

  foreach v_set_order in array v_orders loop
    select element into v_set_desc
    from jsonb_array_elements(v_explicit_sets) element
    where (element->>'set_order')::integer = v_set_order;

    v_set_type := v_scalar_set_type;
    v_side_mode := v_scalar_side_mode;
    v_rest := v_scalar_rest;
    v_tempo := v_scalar_tempo;
    v_performed_order_hint := null;
    v_targets := v_scalar_targets;

    if v_set_desc is not null then
      if v_set_desc ? 'set_type' then
        if jsonb_typeof(v_set_desc->'set_type') <> 'string'
           or v_set_desc->>'set_type' not in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other') then
          raise exception 'Unsupported explicit set_type.' using errcode = '22023';
        end if;
        v_set_type := v_set_desc->>'set_type';
      end if;
      if v_set_desc ? 'side_mode' then
        if jsonb_typeof(v_set_desc->'side_mode') <> 'string'
           or v_set_desc->>'side_mode' not in ('none','bilateral','left','right','alternating') then
          raise exception 'Unsupported explicit side_mode.' using errcode = '22023';
        end if;
        v_side_mode := v_set_desc->>'side_mode';
      end if;
      if v_set_desc ? 'performed_order_hint' then
        if jsonb_typeof(v_set_desc->'performed_order_hint') not in ('number','string')
           or btrim(v_set_desc->>'performed_order_hint') !~ '^[0-9]+$'
           or (v_set_desc->>'performed_order_hint')::integer not between 1 and 100 then
          raise exception 'performed_order_hint must be an integer from 1 through 100.' using errcode = '22023';
        end if;
        v_performed_order_hint := (v_set_desc->>'performed_order_hint')::integer;
      end if;
      if v_set_desc ? 'rest_seconds' then
        if jsonb_typeof(v_set_desc->'rest_seconds') not in ('number','string')
           or btrim(v_set_desc->>'rest_seconds') !~ '^[0-9]+$'
           or (v_set_desc->>'rest_seconds')::integer not between 0 and 86400 then
          raise exception 'Explicit rest_seconds is invalid.' using errcode = '22023';
        end if;
        v_rest := (v_set_desc->>'rest_seconds')::integer;
      end if;
      if v_set_desc ? 'tempo' then
        if jsonb_typeof(v_set_desc->'tempo') <> 'string'
           or char_length(v_set_desc->>'tempo') > 64
           or v_set_desc->>'tempo' ~ '[[:cntrl:]]' then
          raise exception 'Explicit tempo is invalid.' using errcode = '22023';
        end if;
        v_tempo := v_set_desc->>'tempo';
      end if;
      if v_set_desc ? 'targets' then
        if jsonb_typeof(v_set_desc->'targets') <> 'array'
           or jsonb_array_length(v_set_desc->'targets') > 16 then
          raise exception 'Explicit targets must be an array with at most 16 entries.' using errcode = '22023';
        end if;
        v_targets := '[]'::jsonb;
        for v_target in select * from jsonb_array_elements(v_set_desc->'targets') loop
          if jsonb_typeof(v_target) <> 'object' then
            raise exception 'Every explicit target must be an object.' using errcode = '22023';
          end if;
          v_metric_key := nullif(btrim(coalesce(v_target->>'metric_key','')), '');
          if v_metric_key is null then raise exception 'metric_key is required.' using errcode = '22023'; end if;
          if not (v_target ? 'metric_version')
             or jsonb_typeof(v_target->'metric_version') not in ('number','string')
             or btrim(v_target->>'metric_version') !~ '^[0-9]+$'
             or (v_target->>'metric_version')::integer not between 1 and 32767 then
            raise exception 'metric_version is invalid.' using errcode = '22023';
          end if;
          v_metric_version := (v_target->>'metric_version')::integer;
          v_metric_side := coalesce(nullif(v_target->>'side',''),'none');
          if v_metric_side not in ('none','bilateral','left','right') then
            raise exception 'Explicit target side is invalid.' using errcode = '22023';
          end if;
          v_metric_mode := nullif(v_target->>'target_mode','');
          if v_metric_mode not in ('exact','range','minimum','maximum','amrap','timed','distance','rounds','custom') then
            raise exception 'Explicit target_mode is invalid.' using errcode = '22023';
          end if;

          v_target_value := null; v_minimum_value := null; v_maximum_value := null;
          if v_target ? 'target_value' and jsonb_typeof(v_target->'target_value') <> 'null' then
            if jsonb_typeof(v_target->'target_value') not in ('number','string')
               or btrim(v_target->>'target_value') !~ '^-?[0-9]+(?:\.[0-9]+)?$' then
              raise exception 'target_value is invalid.' using errcode = '22023';
            end if;
            v_target_value := (v_target->>'target_value')::numeric;
          end if;
          if v_target ? 'minimum_value' and jsonb_typeof(v_target->'minimum_value') <> 'null' then
            if jsonb_typeof(v_target->'minimum_value') not in ('number','string')
               or btrim(v_target->>'minimum_value') !~ '^-?[0-9]+(?:\.[0-9]+)?$' then
              raise exception 'minimum_value is invalid.' using errcode = '22023';
            end if;
            v_minimum_value := (v_target->>'minimum_value')::numeric;
          end if;
          if v_target ? 'maximum_value' and jsonb_typeof(v_target->'maximum_value') <> 'null' then
            if jsonb_typeof(v_target->'maximum_value') not in ('number','string')
               or btrim(v_target->>'maximum_value') !~ '^-?[0-9]+(?:\.[0-9]+)?$' then
              raise exception 'maximum_value is invalid.' using errcode = '22023';
            end if;
            v_maximum_value := (v_target->>'maximum_value')::numeric;
          end if;

          v_normalized_target := jsonb_build_object(
            'metric_key',v_metric_key,'metric_version',v_metric_version,'side',v_metric_side,
            'target_mode',v_metric_mode,'target_value',v_target_value,
            'minimum_value',v_minimum_value,'maximum_value',v_maximum_value);
          v_targets := v_targets || jsonb_build_array(v_normalized_target);
        end loop;
      end if;
    end if;

    select count(*) - count(distinct (target->>'metric_key', target->>'metric_version', target->>'side'))
      into v_duplicate_count
    from jsonb_array_elements(v_targets) target;
    if v_duplicate_count <> 0 then
      raise exception 'Duplicate prescription target identity inside set %.', v_set_order using errcode = '23505';
    end if;

    v_target_count := jsonb_array_length(v_targets);
    if v_target_count = 0 then
      v_set_target_mode := 'custom';
    elsif v_target_count > 1 then
      v_set_target_mode := 'mixed';
    else
      v_target := v_targets->0;
      if v_target->>'target_mode' = 'amrap' then v_set_target_mode := 'amrap';
      elsif v_target->>'metric_key' = 'duration_seconds' then v_set_target_mode := 'timed';
      elsif v_target->>'metric_key' = 'distance_meters' then v_set_target_mode := 'distance';
      elsif v_target->>'metric_key' = 'rounds' then v_set_target_mode := 'rounds';
      else v_set_target_mode := v_target->>'target_mode';
      end if;
    end if;

    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'set_order',v_set_order,'performed_order_hint',v_performed_order_hint,
      'set_type',v_set_type,'target_mode',v_set_target_mode,'side_mode',v_side_mode,
      'rest_seconds',v_rest,'tempo_target',v_tempo,'schema_version',1,'targets',v_targets));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'set_order',prescription_set.set_order,
    'performed_order_hint',prescription_set.performed_order_hint,
    'set_type',prescription_set.set_type,
    'target_mode',prescription_set.target_mode,
    'side_mode',prescription_set.side_mode,
    'rest_seconds',prescription_set.rest_seconds,
    'tempo_target',prescription_set.tempo_target,
    'schema_version',prescription_set.schema_version,
    'targets',coalesce((select jsonb_agg(jsonb_build_object(
      'metric_key',target.metric_key,'metric_version',target.metric_version,'side',target.side,
      'target_mode',target.target_mode,'target_value',target.target_value,
      'minimum_value',target.minimum_value,'maximum_value',target.maximum_value)
      order by target.metric_key,target.metric_version,target.side,target.id)
      from public.workout_session_prescription_metric_targets target
      where target.prescription_set_id = prescription_set.id),'[]'::jsonb)
  ) order by prescription_set.set_order,prescription_set.id),'[]'::jsonb) into v_existing
  from public.workout_session_prescription_sets prescription_set
  where prescription_set.snapshot_item_id = v_item.id;

  if v_existing <> '[]'::jsonb then
    if v_existing <> v_expected then
      raise exception 'A different immutable prescription graph already exists for this snapshot item.' using errcode = '23514';
    end if;
    select count(*) into v_inserted_targets
    from public.workout_session_prescription_metric_targets target
    where target.snapshot_item_id = v_item.id;
    return jsonb_build_object('snapshot_item_id',v_item.id,'set_count',jsonb_array_length(v_existing),
      'target_count',v_inserted_targets,'status','existing');
  end if;

  if v_verify_only then
    if v_expected = '[]'::jsonb then
      return jsonb_build_object(
        'snapshot_item_id',v_item.id,'set_count',0,'target_count',0,
        'status','unavailable','verification','existing_empty');
    end if;
    raise exception 'The immutable prescription graph is missing during resume verification.' using errcode = '23514';
  end if;

  v_prior_materialization := current_setting('plaivra.aw3c_materialization_item_id', true);
  perform set_config('plaivra.aw3c_materialization_item_id', v_item.id::text, true);
  for v_set_desc in select * from jsonb_array_elements(v_expected) loop
    insert into public.workout_session_prescription_sets (
      snapshot_item_id,snapshot_id,workout_session_id,user_id,set_order,performed_order_hint,
      set_type,target_mode,side_mode,rest_seconds,tempo_target,schema_version
    ) values (
      v_item.id,v_snapshot.id,v_snapshot.workout_session_id,v_item.user_id,
      (v_set_desc->>'set_order')::integer,
      nullif(v_set_desc->>'performed_order_hint','')::integer,
      v_set_desc->>'set_type',v_set_desc->>'target_mode',v_set_desc->>'side_mode',
      nullif(v_set_desc->>'rest_seconds','')::integer,
      nullif(v_set_desc->>'tempo_target',''),1
    ) returning id into v_set_id;
    v_inserted_sets := v_inserted_sets + 1;

    for v_target in select * from jsonb_array_elements(v_set_desc->'targets') loop
      insert into public.workout_session_prescription_metric_targets (
        prescription_set_id,snapshot_item_id,workout_session_id,user_id,
        metric_key,metric_version,side,target_value,minimum_value,maximum_value,target_mode
      ) values (
        v_set_id,v_item.id,v_snapshot.workout_session_id,v_item.user_id,
        v_target->>'metric_key',(v_target->>'metric_version')::smallint,v_target->>'side',
        nullif(v_target->>'target_value','')::numeric,
        nullif(v_target->>'minimum_value','')::numeric,
        nullif(v_target->>'maximum_value','')::numeric,
        v_target->>'target_mode'
      );
      v_inserted_targets := v_inserted_targets + 1;
    end loop;
  end loop;
  perform set_config('plaivra.aw3c_materialization_item_id', coalesce(v_prior_materialization,''), true);

  v_status := case
    when v_inserted_sets = 0 then 'unavailable'
    when exists (select 1 from jsonb_array_elements(v_expected) element where element->>'target_mode' = 'custom') then 'partial'
    else 'complete'
  end;
  return jsonb_build_object('snapshot_item_id',v_item.id,'set_count',v_inserted_sets,
    'target_count',v_inserted_targets,'status',v_status);
exception when others then
  perform set_config('plaivra.aw3c_materialization_item_id', coalesce(v_prior_materialization,''), true);
  raise;
end
$$;

revoke all on function private.materialize_workout_session_prescription_item(uuid) from public, anon, authenticated, service_role;
revoke all on function private.validate_workout_session_prescription_target() from public, anon, authenticated, service_role;
revoke all on function private.enforce_workout_session_prescription_set_immutability() from public, anon, authenticated, service_role;
revoke all on function private.enforce_workout_session_prescription_target_immutability() from public, anon, authenticated, service_role;

create or replace function private.materialize_workout_session_prescription_item_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.materialize_workout_session_prescription_item(new.id);
  return new;
end
$$;
revoke all on function private.materialize_workout_session_prescription_item_on_insert() from public, anon, authenticated, service_role;

create trigger workout_session_snapshot_item_prescription_materializer
after insert on public.workout_session_muscle_snapshot_items
for each row execute function private.materialize_workout_session_prescription_item_on_insert();

-- Canonical future plan snapshot fallback uses snake_case. Existing frozen JSON
-- is not rewritten; restSeconds remains an explicit read-compatibility alias.
create or replace function private.freeze_workout_session_muscle_snapshot_v2(
  p_session_id uuid,
  p_source text default 'session_start'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot_id uuid;
  v_source_plan_updated_at timestamptz;
begin
  if p_source not in ('session_start', 'terminal_insert') then
    raise exception 'Unsupported workout-session snapshot boundary.' using errcode = '23514';
  end if;

  select * into v_session
  from public.workout_sessions session
  where session.id = p_session_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;

  if exists (select 1 from public.workout_session_muscle_snapshots snapshot where snapshot.workout_session_id = v_session.id) then
    raise exception 'The V2 snapshot creator cannot replace an existing snapshot.' using errcode = '23505';
  end if;

  if v_session.plan_id is not null then
    select plan.updated_at into v_source_plan_updated_at
    from public.user_workout_plans plan
    where plan.id = v_session.plan_id and plan.user_id = v_session.user_id;
  end if;

  insert into public.workout_session_muscle_snapshots (
    user_id, workout_session_id, scheduled_session_id, plan_id, plan_day_id,
    plan_week_id, plan_session_id, snapshot_schema_version, taxonomy_version,
    mapping_schema_version, calculation_engine_version, threshold_profile_version,
    result_schema_version, workload_model_version, completeness, reason_codes,
    source, source_plan_updated_at, frozen_at
  ) values (
    v_session.user_id, v_session.id, v_session.scheduled_session_id, v_session.plan_id,
    v_session.plan_day_id, v_session.plan_week_id, v_session.plan_session_id,
    'workout_session_muscle_snapshot_v2', 'advanced_visible_v1',
    'exercise_muscle_mapping_v2', 'muscle_load_resistance_sets_v2',
    'advanced_exposure_v1', 'advanced_muscle_exposure_result_v1', 'resistance_sets_v1',
    'unavailable', array['snapshot_building']::text[], p_source,
    v_source_plan_updated_at, v_session.started_at
  ) returning id into v_snapshot_id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot_id::text, true);

  with source_items as (
    select plan_exercise.*, activity.id as activity_id, activity.catalog_source,
      activity.catalog_activity_id, activity.planned_prescription as activity_prescription,
      phase.phase_slug, phase.phase_name_snapshot,
      case when plan_exercise.source_workout_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then plan_exercise.source_workout_id::uuid else null end as source_uuid
    from public.user_workout_plan_exercises plan_exercise
    left join public.user_workout_plan_activities activity
      on activity.source_legacy_plan_exercise_id = plan_exercise.id and activity.archived_at is null
    left join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    where plan_exercise.plan_day_id = v_session.plan_day_id and plan_exercise.archived_at is null
  ), resolved as (
    select source_item.*, coalesce(global_exercise.id, provider_exercise.exercise_id) as global_exercise_id,
      custom_exercise.id as custom_exercise_id, provider_exercise.provider,
      provider_exercise.provider_activity_id
    from source_items source_item
    left join public.exercises global_exercise
      on global_exercise.id = source_item.source_uuid and global_exercise.is_global and global_exercise.is_approved
    left join public.user_custom_exercises custom_exercise
      on custom_exercise.id = source_item.source_uuid and custom_exercise.user_id = v_session.user_id
    left join lateral (
      select link.exercise_id, link.provider, link.provider_activity_id
      from public.exercise_provider_links link
      join public.exercises exercise on exercise.id = link.exercise_id
      where source_item.catalog_activity_id is not null
        and link.provider = 'plaivra_activity_catalog'
        and link.provider_activity_id = source_item.catalog_activity_id
        and link.verification_status = 'verified'
        and exercise.is_global and exercise.is_approved
      order by link.verified_at desc nulls last, link.id limit 1
    ) provider_exercise on true
  )
  insert into public.workout_session_muscle_snapshot_items (
    snapshot_id, user_id, source_plan_exercise_id, source_plan_activity_id,
    item_order, phase_slug, phase_name_snapshot, activity_name_snapshot,
    planned_target_type, planned_global_exercise_id, planned_custom_exercise_id,
    planned_provider, planned_provider_activity_id, planned_mapping_set_id,
    planned_custom_mapping_set_id, planned_mapping_version, planned_mapping_schema_version,
    planned_mapping_checksum, planned_custom_identity_snapshot, planned_custom_mapping_entries,
    planned_prescription, planned_sets
  )
  select v_snapshot_id, v_session.user_id, resolved.id, resolved.activity_id,
    row_number() over (order by resolved.sort_order, resolved.id)::integer,
    resolved.phase_slug, resolved.phase_name_snapshot, resolved.exercise_name,
    case when resolved.global_exercise_id is not null then 'global_exercise'
         when resolved.custom_exercise_id is not null then 'custom_exercise' end,
    resolved.global_exercise_id, resolved.custom_exercise_id,
    resolved.provider, resolved.provider_activity_id, global_mapping.id, custom_mapping.id,
    coalesce(global_mapping.mapping_version, custom_mapping.mapping_version),
    coalesce(global_mapping.schema_version, custom_mapping.schema_version),
    coalesce(global_mapping.checksum, custom_mapping.checksum),
    case when resolved.custom_exercise_id is not null then jsonb_build_object(
      'id', resolved.custom_exercise_id, 'name', custom_identity.name,
      'equipment', custom_identity.equipment, 'targetMuscle', custom_identity.target_muscle) end,
    case when custom_mapping.id is not null then private.phase3_custom_mapping_entries(custom_mapping.id) end,
    case when jsonb_typeof(resolved.activity_prescription) = 'object' then resolved.activity_prescription
      else jsonb_strip_nulls(jsonb_build_object(
        'sets', resolved.sets, 'reps', resolved.reps, 'rest_seconds', resolved.rest_seconds)) end,
    resolved.sets
  from resolved
  left join public.user_custom_exercises custom_identity
    on custom_identity.id = resolved.custom_exercise_id and custom_identity.user_id = v_session.user_id
  left join lateral (
    select mapping.* from private.resolve_muscle_mapping(
      resolved.global_exercise_id, 'exercise_muscle_mapping_v2', v_session.started_at) mapping
  ) global_mapping on true
  left join lateral (
    select mapping.* from private.resolve_custom_muscle_mapping(
      v_session.user_id, resolved.custom_exercise_id, 'exercise_muscle_mapping_v2', v_session.started_at) mapping
  ) custom_mapping on true
  order by resolved.sort_order, resolved.id;

  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot_id, case when p_source = 'terminal_insert' then 'terminal_insert' end);
  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot_id);
  return v_snapshot_id;
end
$$;
revoke all on function private.freeze_workout_session_muscle_snapshot_v2(uuid,text) from public, anon, authenticated, service_role;

-- Plan-session resume verifies the existing immutable graph without rebuilding it.
alter function private.aw2c_core_start_or_resume_workout_session_atomic(uuid,uuid,uuid)
  rename to aw3c_pre_prescription_start_or_resume_workout_session_atomic;

create function private.aw2c_core_start_or_resume_workout_session_atomic(
  p_user_id uuid, p_plan_day_id uuid, p_scheduled_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_session_id uuid;
  v_snapshot_id uuid;
  v_item_id uuid;
begin
  v_result := private.aw3c_pre_prescription_start_or_resume_workout_session_atomic(
    p_user_id,p_plan_day_id,p_scheduled_session_id);
  v_session_id := (v_result->'session'->>'id')::uuid;
  select snapshot.id into strict v_snapshot_id
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session_id and snapshot.user_id = p_user_id;
  perform set_config('plaivra.session_snapshot_mutation_id',v_snapshot_id::text,true);
  perform set_config('plaivra.aw3c_verify_only','on',true);
  for v_item_id in
    select item.id from public.workout_session_muscle_snapshot_items item
    where item.snapshot_id = v_snapshot_id and item.user_id = p_user_id
    order by item.item_order,item.id
  loop
    perform private.materialize_workout_session_prescription_item(v_item_id);
  end loop;
  perform set_config('plaivra.aw3c_verify_only','',true);
  return v_result;
exception when others then
  perform set_config('plaivra.aw3c_verify_only','',true);
  raise;
end
$$;
revoke all on function private.aw2c_core_start_or_resume_workout_session_atomic(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.aw3c_pre_prescription_start_or_resume_workout_session_atomic(uuid,uuid,uuid) from public, anon, authenticated, service_role;

-- Bound and conflict-check the effective private direct core while preserving the
-- released public RPC/timeline wrapper.
alter function private.aw2c_core_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)
  rename to aw3c_pre_prescription_start_or_resume_direct_workout_session_atomic;

create function private.aw2c_core_start_or_resume_direct_workout_session_atomic(
  p_user_id uuid, p_target_type text, p_identity text, p_provider text default null,
  p_display_name text default null, p_category text default null,
  p_planned_prescription jsonb default '{}'::jsonb, p_candidate_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prescription jsonb := coalesce(p_planned_prescription, '{}'::jsonb);
  v_result jsonb;
  v_entry jsonb;
begin
  if jsonb_typeof(v_prescription) <> 'object'
     or octet_length(convert_to(v_prescription::text, 'UTF8')) > 65536 then
    raise exception 'Planned prescription must be a bounded JSON object.' using errcode = '22023';
  end if;
  if v_prescription ? 'set_targets' then
    if jsonb_typeof(v_prescription->'set_targets') <> 'array'
       or jsonb_array_length(v_prescription->'set_targets') > 100 then
      raise exception 'set_targets must contain at most 100 objects.' using errcode = '22023';
    end if;
    for v_entry in select * from jsonb_array_elements(v_prescription->'set_targets') loop
      if jsonb_typeof(v_entry) <> 'object' or not (v_entry ? 'set_order') then
        raise exception 'Every explicit set requires set_order.' using errcode = '22023';
      end if;
      if v_entry ? 'targets' and (
        jsonb_typeof(v_entry->'targets') <> 'array' or jsonb_array_length(v_entry->'targets') > 16
      ) then
        raise exception 'Every explicit set supports at most 16 targets.' using errcode = '22023';
      end if;
    end loop;
  end if;

  v_result := private.aw3c_pre_prescription_start_or_resume_direct_workout_session_atomic(
    p_user_id,p_target_type,p_identity,p_provider,p_display_name,p_category,v_prescription,p_candidate_session_id);
  perform set_config(
    'plaivra.session_snapshot_mutation_id',
    coalesce(v_result->'snapshotItem'->>'snapshot_id',''),
    true
  );
  perform set_config('plaivra.aw3c_verify_only','on',true);
  perform private.materialize_workout_session_prescription_item((v_result->'snapshotItem'->>'id')::uuid);
  perform set_config('plaivra.aw3c_verify_only','',true);
  return v_result;
exception when others then
  perform set_config('plaivra.aw3c_verify_only','',true);
  raise;
end
$$;
revoke all on function private.aw2c_core_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function private.aw3c_pre_prescription_start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated, service_role;

-- Extend account-deletion proof without weakening the reviewed lifecycle gate.
alter function public.purge_account_application_data_atomic(uuid) set schema private;
alter function private.purge_account_application_data_atomic(uuid)
  rename to aw3c_core_purge_account_application_data_atomic;

create function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_count integer;
  v_target_count integer;
  v_result jsonb;
begin
  select count(*) into v_set_count
  from public.workout_session_prescription_sets where user_id = p_user_id;
  select count(*) into v_target_count
  from public.workout_session_prescription_metric_targets where user_id = p_user_id;

  v_result := private.aw3c_core_purge_account_application_data_atomic(p_user_id);
  if exists (select 1 from public.workout_session_prescription_sets where user_id = p_user_id)
     or exists (select 1 from public.workout_session_prescription_metric_targets where user_id = p_user_id) then
    raise exception 'Account-data purge left immutable prescription rows behind.' using errcode = '23514';
  end if;
  return v_result || jsonb_build_object(
    'prescription_sets_deleted',v_set_count,
    'prescription_metric_targets_deleted',v_target_count);
end
$$;
revoke all on function private.aw3c_core_purge_account_application_data_atomic(uuid) from public, anon, authenticated, service_role;
revoke all on function public.purge_account_application_data_atomic(uuid) from public, anon, authenticated;
grant execute on function public.purge_account_application_data_atomic(uuid) to service_role;

-- Deterministic frozen-item-only historical backfill. The materializer itself
-- computes expected counts from each source item and is retry-safe.
do $$
declare
  v_item_id uuid;
  v_result jsonb;
  v_expected_sets bigint := 0;
  v_expected_targets bigint := 0;
  v_actual_sets bigint;
  v_actual_targets bigint;
begin
  perform set_config('plaivra.aw3c_backfill','on',true);
  for v_item_id in
    select item.id from public.workout_session_muscle_snapshot_items item order by item.id
  loop
    v_result := private.materialize_workout_session_prescription_item(v_item_id);
    v_expected_sets := v_expected_sets + coalesce((v_result->>'set_count')::bigint,0);
    v_expected_targets := v_expected_targets + coalesce((v_result->>'target_count')::bigint,0);
  end loop;
  perform set_config('plaivra.aw3c_backfill','',true);

  select count(*) into v_actual_sets from public.workout_session_prescription_sets;
  select count(*) into v_actual_targets from public.workout_session_prescription_metric_targets;
  if v_actual_sets <> v_expected_sets or v_actual_targets <> v_expected_targets then
    raise exception 'AW-3C backfill counts disagree: expected %/% actual %/%.',
      v_expected_sets,v_expected_targets,v_actual_sets,v_actual_targets using errcode = '23514';
  end if;
end
$$;

-- Protected history and frozen raw JSON must be byte-stable across the migration.
do $$
declare
  v_before aw3c_protected_baseline%rowtype;
  v_after aw3c_protected_baseline%rowtype;
begin
  select * into v_before from aw3c_protected_baseline;
  select
    (select count(*) from public.workout_sessions),
    (select count(*) from public.exercise_logs),
    (select count(*) from public.exercise_log_metric_values),
    (select count(*) from public.exercise_log_set_details),
    (select count(*) from public.exercise_log_set_segments),
    (select count(*) from public.exercise_log_set_segment_metric_values),
    (select count(*) from public.workout_session_timeline_events),
    (select count(*) from public.workout_session_muscle_snapshots),
    (select count(*) from public.workout_session_muscle_snapshot_items),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || planned_prescription::text || ':' || coalesce(planned_sets::text,''), '|' order by id), ''), 'sha256'), 'hex') from public.workout_session_muscle_snapshot_items),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || coalesce(status::text,'') || ':' || coalesce(duration_minutes::text,''), '|' order by id), ''), 'sha256'), 'hex') from public.workout_sessions),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || coalesce(set_number::text,'') || ':' || coalesce(reps::text,'') || ':' || coalesce(weight_kg::text,''), '|' order by id), ''), 'sha256'), 'hex') from public.exercise_logs),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || metric_key || ':' || metric_version::text || ':' || side || ':' || value::text, '|' order by id), ''), 'sha256'), 'hex') from public.exercise_log_metric_values),
    (select encode(extensions.digest(coalesce(string_agg(exercise_log_id::text || ':' || set_type || ':' || coalesce(planned_tempo,'') || ':' || side_mode, '|' order by exercise_log_id), ''), 'sha256'), 'hex') from public.exercise_log_set_details),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || segment_order::text || ':' || segment_kind || ':' || side, '|' order by id), ''), 'sha256'), 'hex') from public.exercise_log_set_segments),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || metric_key || ':' || value::text, '|' order by id), ''), 'sha256'), 'hex') from public.exercise_log_set_segment_metric_values),
    (select encode(extensions.digest(coalesce(string_agg(id::text || ':' || sequence_number::text || ':' || event_type || ':' || payload::text, '|' order by id), ''), 'sha256'), 'hex') from public.workout_session_timeline_events)
  into v_after;
  if to_jsonb(v_before) <> to_jsonb(v_after) then
    raise exception 'AW-3C changed protected workout history or frozen raw prescription evidence.' using errcode = '23514';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from public.workout_session_prescription_sets prescription_set
    join public.workout_session_muscle_snapshot_items item on item.id = prescription_set.snapshot_item_id
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where prescription_set.snapshot_id <> item.snapshot_id
       or prescription_set.user_id <> item.user_id
       or prescription_set.workout_session_id <> snapshot.workout_session_id
  ) or exists (
    select 1 from public.workout_session_prescription_metric_targets target
    join public.workout_session_prescription_sets prescription_set on prescription_set.id = target.prescription_set_id
    where target.snapshot_item_id <> prescription_set.snapshot_item_id
       or target.workout_session_id <> prescription_set.workout_session_id
       or target.user_id <> prescription_set.user_id
  ) then
    raise exception 'AW-3C owner/session path verification failed.' using errcode = '23514';
  end if;

  if (select migration_version from public.release_schema_compatibility where singleton) <> '20260724232734' then
    raise exception 'AW-3C changed the compatibility marker.' using errcode = '23514';
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
