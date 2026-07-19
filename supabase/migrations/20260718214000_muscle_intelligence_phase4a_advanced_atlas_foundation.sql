begin;

do $preflight$
begin
  if to_regclass('public.exercise_muscle_mapping_sets') is null
     or to_regclass('public.user_custom_exercise_mapping_sets') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null then
    raise exception 'Muscle Intelligence Phases 1 and 3 must exist before Phase 4A.';
  end if;
  if to_regprocedure('private.muscle_taxonomy_display_order(text)') is null
     or to_regprocedure('public.get_workout_session_frozen_global_mappings(uuid,uuid)') is null then
    raise exception 'Required version-one compatibility functions are missing.';
  end if;
end
$preflight$;

create or replace function private.advanced_muscle_taxonomy_display_order(p_muscle_id text)
returns integer
language sql
immutable
strict
set search_path = ''
as $function$
  select case p_muscle_id
    when 'neck.sternocleidomastoid' then 1
    when 'trapezius.upper' then 2 when 'trapezius.middle' then 3 when 'trapezius.lower' then 4
    when 'deltoid.anterior' then 5 when 'deltoid.lateral' then 6 when 'deltoid.posterior' then 7
    when 'pectoralis.upper' then 8 when 'pectoralis.middle' then 9 when 'pectoralis.lower' then 10 when 'pectoralis.outer' then 11
    when 'infraspinatus' then 12 when 'teres_minor' then 13 when 'teres_major' then 14
    when 'latissimus.upper' then 15 when 'latissimus.middle' then 16 when 'latissimus.lower' then 17 when 'latissimus.outer' then 18
    when 'serratus.anterior' then 19
    when 'biceps.long_head' then 20 when 'biceps.short_head' then 21 when 'brachialis' then 22
    when 'triceps.long_head' then 23 when 'triceps.lateral_head' then 24 when 'triceps.medial_head' then 25
    when 'brachioradialis' then 26 when 'forearm.pronator_teres' then 27
    when 'forearm.flexor_mass' then 28 when 'forearm.extensor_mass' then 29
    when 'rectus_abdominis.upper' then 30 when 'rectus_abdominis.middle' then 31 when 'rectus_abdominis.lower' then 32
    when 'oblique.external_upper' then 33 when 'oblique.external_lower' then 34
    when 'spinal_erectors.upper' then 35 when 'spinal_erectors.lower' then 36
    when 'hip_flexors.anterior' then 37 when 'tensor_fasciae_latae' then 38
    when 'gluteus.medius' then 39 when 'gluteus_maximus.upper' then 40
    when 'gluteus_maximus.middle' then 41 when 'gluteus_maximus.lower' then 42
    when 'quadriceps.rectus_femoris' then 43 when 'quadriceps.vastus_lateralis' then 44 when 'quadriceps.vastus_medialis' then 45
    when 'adductors.anterior_region' then 46 when 'adductors.posterior_region' then 47
    when 'hamstrings.biceps_femoris_long_head' then 48 when 'hamstrings.biceps_femoris_short_head' then 49
    when 'hamstrings.semitendinosus' then 50 when 'hamstrings.semimembranosus' then 51
    when 'lower_leg.tibialis_anterior' then 52 when 'lower_leg.fibularis' then 53
    when 'calf.gastrocnemius_medial' then 54 when 'calf.gastrocnemius_lateral' then 55 when 'calf.soleus' then 56
  end
$function$;

create or replace function private.muscle_mapping_display_order(p_schema_version text, p_muscle_id text)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_order integer;
begin
  if p_schema_version = 'exercise_muscle_mapping_v1' then
    v_order := private.muscle_taxonomy_display_order(p_muscle_id);
  elsif p_schema_version = 'exercise_muscle_mapping_v2' then
    v_order := private.advanced_muscle_taxonomy_display_order(p_muscle_id);
  else
    raise exception 'Unsupported muscle mapping schema.' using errcode = '23514';
  end if;
  if v_order is null then
    raise exception 'Muscle target is not valid for its mapping schema.' using errcode = '23514';
  end if;
  return v_order;
end
$function$;

alter table public.exercise_muscle_mapping_sets
  drop constraint exercise_muscle_mapping_sets_schema_check;
alter table public.exercise_muscle_mapping_sets
  add constraint exercise_muscle_mapping_sets_schema_check
  check (schema_version in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2')) not valid;
alter table public.exercise_muscle_mapping_sets validate constraint exercise_muscle_mapping_sets_schema_check;

alter table public.user_custom_exercise_mapping_sets
  drop constraint user_custom_exercise_mapping_sets_schema_check;
alter table public.user_custom_exercise_mapping_sets
  add constraint user_custom_exercise_mapping_sets_schema_check
  check (schema_version in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2')) not valid;
alter table public.user_custom_exercise_mapping_sets validate constraint user_custom_exercise_mapping_sets_schema_check;

alter table public.exercise_muscle_mapping_entries
  drop constraint exercise_muscle_mapping_entries_muscle_check;
alter table public.exercise_muscle_mapping_entries
  add constraint exercise_muscle_mapping_entries_muscle_check check (muscle_id in (
    'pectoralis_major', 'anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid', 'trapezius', 'latissimus_dorsi',
    'upper_back', 'biceps_brachii', 'triceps_brachii', 'forearms', 'rotator_cuff', 'serratus_anterior',
    'rectus_abdominis', 'obliques', 'erector_spinae', 'gluteus_maximus', 'gluteus_medius', 'quadriceps',
    'hamstrings', 'adductors', 'hip_flexors', 'gastrocnemius', 'soleus', 'tibialis_anterior',
    'neck.sternocleidomastoid', 'trapezius.upper', 'trapezius.middle', 'trapezius.lower',
    'deltoid.anterior', 'deltoid.lateral', 'deltoid.posterior', 'pectoralis.upper', 'pectoralis.middle',
    'pectoralis.lower', 'pectoralis.outer', 'infraspinatus', 'teres_minor', 'teres_major', 'latissimus.upper',
    'latissimus.middle', 'latissimus.lower', 'latissimus.outer', 'serratus.anterior', 'biceps.long_head',
    'biceps.short_head', 'brachialis', 'triceps.long_head', 'triceps.lateral_head', 'triceps.medial_head',
    'brachioradialis', 'forearm.pronator_teres', 'forearm.flexor_mass', 'forearm.extensor_mass',
    'rectus_abdominis.upper', 'rectus_abdominis.middle', 'rectus_abdominis.lower', 'oblique.external_upper',
    'oblique.external_lower', 'spinal_erectors.upper', 'spinal_erectors.lower', 'hip_flexors.anterior',
    'tensor_fasciae_latae', 'gluteus.medius', 'gluteus_maximus.upper', 'gluteus_maximus.middle',
    'gluteus_maximus.lower', 'quadriceps.rectus_femoris', 'quadriceps.vastus_lateralis',
    'quadriceps.vastus_medialis', 'adductors.anterior_region', 'adductors.posterior_region',
    'hamstrings.biceps_femoris_long_head', 'hamstrings.biceps_femoris_short_head', 'hamstrings.semitendinosus',
    'hamstrings.semimembranosus', 'lower_leg.tibialis_anterior', 'lower_leg.fibularis',
    'calf.gastrocnemius_medial', 'calf.gastrocnemius_lateral', 'calf.soleus'
  )) not valid;
alter table public.exercise_muscle_mapping_entries validate constraint exercise_muscle_mapping_entries_muscle_check;

alter table public.user_custom_exercise_mapping_entries
  drop constraint user_custom_exercise_mapping_entries_muscle_check;
alter table public.user_custom_exercise_mapping_entries
  add constraint user_custom_exercise_mapping_entries_muscle_check check (muscle_id in (
    'pectoralis_major', 'anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid', 'trapezius', 'latissimus_dorsi',
    'upper_back', 'biceps_brachii', 'triceps_brachii', 'forearms', 'rotator_cuff', 'serratus_anterior',
    'rectus_abdominis', 'obliques', 'erector_spinae', 'gluteus_maximus', 'gluteus_medius', 'quadriceps',
    'hamstrings', 'adductors', 'hip_flexors', 'gastrocnemius', 'soleus', 'tibialis_anterior',
    'neck.sternocleidomastoid', 'trapezius.upper', 'trapezius.middle', 'trapezius.lower',
    'deltoid.anterior', 'deltoid.lateral', 'deltoid.posterior', 'pectoralis.upper', 'pectoralis.middle',
    'pectoralis.lower', 'pectoralis.outer', 'infraspinatus', 'teres_minor', 'teres_major', 'latissimus.upper',
    'latissimus.middle', 'latissimus.lower', 'latissimus.outer', 'serratus.anterior', 'biceps.long_head',
    'biceps.short_head', 'brachialis', 'triceps.long_head', 'triceps.lateral_head', 'triceps.medial_head',
    'brachioradialis', 'forearm.pronator_teres', 'forearm.flexor_mass', 'forearm.extensor_mass',
    'rectus_abdominis.upper', 'rectus_abdominis.middle', 'rectus_abdominis.lower', 'oblique.external_upper',
    'oblique.external_lower', 'spinal_erectors.upper', 'spinal_erectors.lower', 'hip_flexors.anterior',
    'tensor_fasciae_latae', 'gluteus.medius', 'gluteus_maximus.upper', 'gluteus_maximus.middle',
    'gluteus_maximus.lower', 'quadriceps.rectus_femoris', 'quadriceps.vastus_lateralis',
    'quadriceps.vastus_medialis', 'adductors.anterior_region', 'adductors.posterior_region',
    'hamstrings.biceps_femoris_long_head', 'hamstrings.biceps_femoris_short_head', 'hamstrings.semitendinosus',
    'hamstrings.semimembranosus', 'lower_leg.tibialis_anterior', 'lower_leg.fibularis',
    'calf.gastrocnemius_medial', 'calf.gastrocnemius_lateral', 'calf.soleus'
  )) not valid;
alter table public.user_custom_exercise_mapping_entries validate constraint user_custom_exercise_mapping_entries_muscle_check;

create or replace function private.enforce_global_mapping_entry_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schema text;
begin
  if tg_op = 'DELETE' then return old; end if;
  select mapping.schema_version into v_schema
  from public.exercise_muscle_mapping_sets mapping
  where mapping.id = new.mapping_set_id;
  if v_schema is null then raise exception 'Global mapping set not found.' using errcode = '23503'; end if;
  perform private.muscle_mapping_display_order(v_schema, new.muscle_id);
  return new;
end
$function$;

create or replace function private.enforce_custom_mapping_entry_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schema text;
begin
  if tg_op = 'DELETE' then return old; end if;
  select mapping.schema_version into v_schema
  from public.user_custom_exercise_mapping_sets mapping
  where mapping.id = new.mapping_set_id;
  if v_schema is null then raise exception 'Custom mapping set not found.' using errcode = '23503'; end if;
  perform private.muscle_mapping_display_order(v_schema, new.muscle_id);
  return new;
end
$function$;

create trigger enforce_global_mapping_entry_schema
before insert or update on public.exercise_muscle_mapping_entries
for each row execute function private.enforce_global_mapping_entry_schema();
create trigger enforce_custom_mapping_entry_schema
before insert or update on public.user_custom_exercise_mapping_entries
for each row execute function private.enforce_custom_mapping_entry_schema();

create or replace function private.exercise_muscle_mapping_checksum(p_mapping_set_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_schema text;
  v_payload text;
begin
  select mapping.schema_version into v_schema
  from public.exercise_muscle_mapping_sets mapping where mapping.id = p_mapping_set_id;
  if v_schema not in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2') then
    raise exception 'Unsupported muscle mapping schema.' using errcode = '23514';
  end if;
  select '{"schema_version":' || to_json(v_schema)::text || ',"entries":['
    || coalesce(string_agg(format(
      '{"muscle_id":%s,"role":%s,"contribution":%s,"side_scope":%s,"sort_order":%s}',
      to_json(entry.muscle_id)::text, to_json(entry.role)::text,
      to_json(to_char(entry.contribution, 'FM0.00'))::text, to_json(entry.side_scope)::text, entry.sort_order
    ), ',' order by private.muscle_mapping_display_order(v_schema, entry.muscle_id), entry.muscle_id), '') || ']}'
  into v_payload
  from public.exercise_muscle_mapping_entries entry where entry.mapping_set_id = p_mapping_set_id;
  return encode(extensions.digest(v_payload, 'sha256'), 'hex');
end
$function$;

create or replace function private.user_custom_exercise_mapping_checksum(p_mapping_set_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_schema text;
  v_payload text;
begin
  select mapping.schema_version into v_schema
  from public.user_custom_exercise_mapping_sets mapping where mapping.id = p_mapping_set_id;
  if v_schema not in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2') then
    raise exception 'Unsupported muscle mapping schema.' using errcode = '23514';
  end if;
  select '{"schema_version":' || to_json(v_schema)::text || ',"entries":['
    || coalesce(string_agg(format(
      '{"muscle_id":%s,"role":%s,"contribution":%s,"side_scope":%s,"sort_order":%s}',
      to_json(entry.muscle_id)::text, to_json(entry.role)::text,
      to_json(to_char(entry.contribution, 'FM0.00'))::text, to_json(entry.side_scope)::text, entry.sort_order
    ), ',' order by private.muscle_mapping_display_order(v_schema, entry.muscle_id), entry.muscle_id), '') || ']}'
  into v_payload
  from public.user_custom_exercise_mapping_entries entry where entry.mapping_set_id = p_mapping_set_id;
  return encode(extensions.digest(v_payload, 'sha256'), 'hex');
end
$function$;

create or replace function private.phase3_custom_mapping_entries(p_mapping_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'muscleId', entry.muscle_id, 'role', entry.role, 'contribution', entry.contribution::double precision,
    'sideScope', entry.side_scope, 'sortOrder', entry.sort_order
  ) order by private.muscle_mapping_display_order(mapping.schema_version, entry.muscle_id), entry.muscle_id)
  filter (where entry.id is not null), '[]'::jsonb)
  from public.user_custom_exercise_mapping_sets mapping
  left join public.user_custom_exercise_mapping_entries entry on entry.mapping_set_id = mapping.id
  where mapping.id = p_mapping_set_id
$function$;

alter table public.workout_session_muscle_snapshots
  drop constraint workout_session_muscle_snapshots_schema_check,
  drop constraint workout_session_muscle_snapshots_taxonomy_check,
  drop constraint workout_session_muscle_snapshots_mapping_schema_check,
  drop constraint workout_session_muscle_snapshots_engine_check,
  drop constraint workout_session_muscle_snapshots_threshold_check,
  drop constraint workout_session_muscle_snapshots_result_schema_check,
  drop constraint workout_session_muscle_snapshots_workload_check;
alter table public.workout_session_muscle_snapshots
  add constraint workout_session_muscle_snapshots_version_bundle_check check (
    (snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
      and taxonomy_version = 'muscle_taxonomy_v1'
      and mapping_schema_version = 'exercise_muscle_mapping_v1'
      and calculation_engine_version = 'muscle_load_resistance_sets_v1'
      and threshold_profile_version = 'muscle_load_thresholds_v1'
      and result_schema_version = 'muscle_analysis_result_v1'
      and workload_model_version = 'resistance_sets_v1')
    or
    (snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
      and taxonomy_version = 'advanced_visible_v1'
      and mapping_schema_version = 'exercise_muscle_mapping_v2'
      and calculation_engine_version = 'muscle_load_resistance_sets_v2'
      and threshold_profile_version = 'advanced_exposure_v1'
      and result_schema_version = 'advanced_muscle_exposure_result_v1'
      and workload_model_version = 'resistance_sets_v1')
  ) not valid;
alter table public.workout_session_muscle_snapshots
  validate constraint workout_session_muscle_snapshots_version_bundle_check;

alter table public.workout_session_muscle_snapshot_items
  add constraint workout_session_muscle_snapshot_items_planned_mapping_schema_check
    check (planned_mapping_schema_version is null or planned_mapping_schema_version in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2')) not valid,
  add constraint workout_session_muscle_snapshot_items_actual_mapping_schema_check
    check (actual_mapping_schema_version is null or actual_mapping_schema_version in ('exercise_muscle_mapping_v1', 'exercise_muscle_mapping_v2')) not valid;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_planned_mapping_schema_check;
alter table public.workout_session_muscle_snapshot_items
  validate constraint workout_session_muscle_snapshot_items_actual_mapping_schema_check;

create or replace function public.get_workout_session_frozen_global_mappings(p_user_id uuid, p_session_id uuid)
returns table (id uuid, exercise_id uuid, mapping_version integer, schema_version text, checksum text, entries jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  if not exists (
    select 1 from public.workout_sessions session where session.id = p_session_id and session.user_id = p_user_id
  ) then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;

  return query
  select mapping.id, mapping.exercise_id, mapping.mapping_version, mapping.schema_version, mapping.checksum,
         coalesce(jsonb_agg(jsonb_build_object(
           'muscleId', entry.muscle_id, 'role', entry.role, 'contribution', entry.contribution,
           'sideScope', entry.side_scope, 'sortOrder', entry.sort_order
         ) order by private.muscle_mapping_display_order(mapping.schema_version, entry.muscle_id), entry.muscle_id)
         filter (where entry.id is not null), '[]'::jsonb)
  from public.workout_session_muscle_snapshots snapshot
  join public.workout_session_muscle_snapshot_items item on item.snapshot_id = snapshot.id
  join public.exercise_muscle_mapping_sets mapping on mapping.id in (item.planned_mapping_set_id, item.actual_mapping_set_id)
  left join public.exercise_muscle_mapping_entries entry on entry.mapping_set_id = mapping.id
  where snapshot.user_id = p_user_id and snapshot.workout_session_id = p_session_id
    and mapping.status in ('published', 'retired')
  group by mapping.id, mapping.exercise_id, mapping.mapping_version, mapping.schema_version, mapping.checksum
  order by mapping.id;
end
$function$;

revoke all on function private.advanced_muscle_taxonomy_display_order(text) from public, anon, authenticated;
revoke all on function private.muscle_mapping_display_order(text, text) from public, anon, authenticated;
revoke all on function private.enforce_global_mapping_entry_schema() from public, anon, authenticated;
revoke all on function private.enforce_custom_mapping_entry_schema() from public, anon, authenticated;
revoke all on function private.exercise_muscle_mapping_checksum(uuid) from public, anon, authenticated;
revoke all on function private.user_custom_exercise_mapping_checksum(uuid) from public, anon, authenticated;
revoke all on function private.phase3_custom_mapping_entries(uuid) from public, anon, authenticated;
revoke all on function public.get_workout_session_frozen_global_mappings(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_workout_session_frozen_global_mappings(uuid, uuid) to authenticated, service_role;

comment on function private.advanced_muscle_taxonomy_display_order(text) is
  'Immutable Phase 4A advanced-visible-v1 target order; application registry remains the taxonomy authority.';
comment on constraint workout_session_muscle_snapshots_version_bundle_check on public.workout_session_muscle_snapshots is
  'Accepts only complete internally consistent V1 or future V2 Muscle Intelligence envelopes; defaults remain V1.';

commit;
