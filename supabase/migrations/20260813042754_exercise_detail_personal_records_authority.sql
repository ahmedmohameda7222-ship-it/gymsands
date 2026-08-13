-- Exercise Detail + Personal Records additive authority.
-- Preservation rule: existing Personal Records are never rewritten or reclassified.

create table if not exists public.personal_record_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_kind text not null,
  identity_value text not null,
  name_snapshot text not null,
  sport_domain text,
  sport_name_snapshot text,
  catalog_revision_id text,
  authority_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_record_subjects_identity_kind_check
    check (identity_kind in ('catalog_activity','custom_subject')),
  constraint personal_record_subjects_identity_value_check
    check (btrim(identity_value) <> '' and char_length(identity_value) <= 240),
  constraint personal_record_subjects_name_check
    check (btrim(name_snapshot) <> '' and char_length(name_snapshot) <= 160),
  constraint personal_record_subjects_sport_check
    check (sport_domain is null or (btrim(sport_domain) <> '' and char_length(sport_domain) <= 80)),
  constraint personal_record_subjects_authority_shape_check
    check (jsonb_typeof(authority_snapshot) = 'object'),
  constraint personal_record_subjects_user_identity_key unique (user_id, identity_kind, identity_value)
);

alter table public.personal_record_subjects enable row level security;

create policy personal_record_subjects_owner_all
on public.personal_record_subjects
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.personal_record_subjects from public, anon;
grant select, insert, update, delete on public.personal_record_subjects to authenticated;
grant all on public.personal_record_subjects to service_role;

alter table public.personal_records
  add column if not exists subject_id uuid references public.personal_record_subjects(id) on delete set null,
  add column if not exists sport_domain text,
  add column if not exists sport_name_snapshot text,
  add column if not exists record_definition_id text,
  add column if not exists record_definition_key text,
  add column if not exists record_definition_version text,
  add column if not exists comparison_direction text,
  add column if not exists canonical_value numeric,
  add column if not exists canonical_unit text,
  add column if not exists comparison_context jsonb,
  add column if not exists semantic_snapshot jsonb,
  add column if not exists semantic_version text,
  add column if not exists effective_achieved_at timestamptz,
  add column if not exists event_semantics_version text;

alter table public.personal_records
  add constraint personal_records_sport_domain_check
    check (sport_domain is null or (btrim(sport_domain) <> '' and char_length(sport_domain) <= 80)) not valid,
  add constraint personal_records_record_definition_key_check
    check (record_definition_key is null or (btrim(record_definition_key) <> '' and char_length(record_definition_key) <= 120)) not valid,
  add constraint personal_records_comparison_direction_check
    check (comparison_direction is null or comparison_direction in ('higher_better','lower_better','not_comparable')) not valid,
  add constraint personal_records_canonical_value_check
    check (canonical_value is null or (canonical_value >= 0 and canonical_value not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))) not valid,
  add constraint personal_records_comparison_context_shape_check
    check (comparison_context is null or jsonb_typeof(comparison_context) = 'object') not valid,
  add constraint personal_records_semantic_snapshot_shape_check
    check (semantic_snapshot is null or jsonb_typeof(semantic_snapshot) = 'object') not valid;

alter table public.personal_records validate constraint personal_records_sport_domain_check;
alter table public.personal_records validate constraint personal_records_record_definition_key_check;
alter table public.personal_records validate constraint personal_records_comparison_direction_check;
alter table public.personal_records validate constraint personal_records_canonical_value_check;
alter table public.personal_records validate constraint personal_records_comparison_context_shape_check;
alter table public.personal_records validate constraint personal_records_semantic_snapshot_shape_check;

create index if not exists personal_records_user_effective_achieved_idx
  on public.personal_records(
    user_id,
    effective_achieved_at desc nulls last,
    achieved_at desc nulls last,
    record_date desc,
    id desc
  );
create index if not exists personal_records_user_subject_idx
  on public.personal_records(user_id, subject_id, record_definition_key)
  where subject_id is not null;

comment on column public.personal_records.effective_achieved_at is
  'Additive canonical event time. Raw achieved_at remains frozen for historical engine semantics.';
comment on column public.personal_records.event_semantics_version is
  'Versioned event-time semantics; historical wh6-v1 rows remain null and are projected compatibly.';

create or replace function private.personal_record_set_event_semantics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.source_kind = 'workout_derived' and new.event_semantics_version is null then
    new.effective_achieved_at := coalesce(new.effective_achieved_at, new.achieved_at);
    new.event_semantics_version := case
      when new.derived_record_type = 'exercise_session_volume'
        then 'wh6-session-volume-latest-set-v2'
      else 'wh6-source-set-v1'
    end;
  end if;
  return new;
end;
$function$;

revoke all on function private.personal_record_set_event_semantics() from public, anon, authenticated, service_role;
drop trigger if exists personal_records_set_event_semantics on public.personal_records;
create trigger personal_records_set_event_semantics
before insert on public.personal_records
for each row execute function private.personal_record_set_event_semantics();

create or replace function private.personal_record_supported_definition(
  p_key text,
  p_direction text,
  p_unit text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select (p_key, p_direction, p_unit) in (
    ('highest_load', 'higher_better', 'kg'),
    ('estimated_one_rep_max', 'higher_better', 'kg'),
    ('same_load_max_repetitions', 'higher_better', 'repetitions'),
    ('exercise_session_volume', 'higher_better', 'kg_repetitions'),
    ('longest_duration', 'higher_better', 'seconds'),
    ('longest_distance', 'higher_better', 'meters'),
    ('fastest_time', 'lower_better', 'seconds')
  );
$function$;

revoke all on function private.personal_record_supported_definition(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.personal_record_supported_definition(text,text,text)
  to authenticated, service_role;

create or replace function public.upsert_manual_personal_record_atomic(
  p_event_id uuid,
  p_subject jsonb,
  p_definition jsonb,
  p_value numeric,
  p_context jsonb,
  p_achieved_at timestamptz,
  p_notes text
)
returns public.personal_records
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_subject_id uuid;
  v_subject_kind text := nullif(btrim(p_subject->>'identityKind'), '');
  v_subject_identity text := nullif(btrim(p_subject->>'identity'), '');
  v_subject_name text := nullif(btrim(p_subject->>'name'), '');
  v_sport text := nullif(btrim(p_subject->>'sportDomain'), '');
  v_sport_name text := nullif(btrim(p_subject->>'sportName'), '');
  v_definition_id text := nullif(btrim(p_definition->>'id'), '');
  v_definition_key text := nullif(btrim(p_definition->>'key'), '');
  v_definition_version text := nullif(btrim(p_definition->>'version'), '');
  v_definition_label text := nullif(btrim(p_definition->>'label'), '');
  v_direction text := nullif(btrim(p_definition->>'comparisonDirection'), '');
  v_unit text := nullif(btrim(p_definition->>'canonicalUnit'), '');
  v_context_key text := encode(extensions.digest(coalesce(p_context, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_existing public.personal_records%rowtype;
  v_result public.personal_records%rowtype;
  v_better_exists boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_subject) <> 'object'
     or jsonb_typeof(p_definition) <> 'object'
     or jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object'
     or v_subject_kind not in ('catalog_activity','custom_subject')
     or v_subject_identity is null or char_length(v_subject_identity) > 240
     or v_subject_name is null or char_length(v_subject_name) > 160
     or v_definition_key is null or v_definition_version is null
     or v_definition_label is null
     or not private.personal_record_supported_definition(v_definition_key, v_direction, v_unit)
     or p_value is null or p_value <= 0
     or p_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
     or p_achieved_at is null or p_achieved_at > clock_timestamp() + interval '5 minutes'
     or octet_length(coalesce(p_context, '{}'::jsonb)::text) > 8192
     or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Manual personal record input is invalid.' using errcode = '22023';
  end if;
  if v_definition_key in ('same_load_max_repetitions','fastest_time')
     and coalesce(p_context, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'This record requires comparison context.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || v_subject_kind || ':' || v_subject_identity || ':' || v_definition_key || ':' || v_context_key, 0)
  );

  if p_event_id is not null then
    select * into v_existing
    from public.personal_records record
    where record.id = p_event_id and record.user_id = v_user_id
    for update;
    if v_existing.id is null then
      raise exception 'Personal record was not found.' using errcode = 'P0002';
    end if;
    if v_existing.source_kind <> 'manual' then
      raise exception 'Verified records cannot be edited.' using errcode = '42501';
    end if;
  end if;

  insert into public.personal_record_subjects(
    user_id, identity_kind, identity_value, name_snapshot, sport_domain,
    sport_name_snapshot, catalog_revision_id, authority_snapshot
  ) values (
    v_user_id, v_subject_kind, v_subject_identity, v_subject_name, v_sport,
    v_sport_name, nullif(btrim(p_subject->>'catalogRevisionId'), ''),
    coalesce(p_subject->'authoritySnapshot', '{}'::jsonb)
  )
  on conflict (user_id, identity_kind, identity_value) do update set
    name_snapshot = excluded.name_snapshot,
    sport_domain = excluded.sport_domain,
    sport_name_snapshot = excluded.sport_name_snapshot,
    catalog_revision_id = excluded.catalog_revision_id,
    authority_snapshot = excluded.authority_snapshot,
    updated_at = clock_timestamp()
  returning id into v_subject_id;

  select exists(
    select 1
    from public.personal_records record
    left join public.personal_record_subjects subject on subject.id = record.subject_id
    where record.user_id = v_user_id
      and record.id is distinct from p_event_id
      and coalesce(subject.identity_value, record.exercise_identity) = v_subject_identity
      and coalesce(record.record_definition_key, record.derived_record_type) = v_definition_key
      and coalesce(record.comparison_context, jsonb_build_object('legacyKey', record.comparison_context_key), '{}'::jsonb)
          = coalesce(p_context, '{}'::jsonb)
      and coalesce(record.effective_achieved_at, record.achieved_at, record.record_date::timestamptz) <= p_achieved_at
      and (
        (v_direction = 'higher_better' and coalesce(record.canonical_value, record.record_value, record.weight_kg, record.reps::numeric) >= p_value)
        or
        (v_direction = 'lower_better' and coalesce(record.canonical_value, record.record_value, record.weight_kg, record.reps::numeric) <= p_value)
      )
  ) into v_better_exists;
  if v_better_exists then
    raise exception 'This was not a personal record at the selected time.' using errcode = '23514';
  end if;

  if p_event_id is null then
    insert into public.personal_records(
      user_id, exercise_name, record_type, weight_kg, reps, record_date, notes,
      source_kind, subject_id, sport_domain, sport_name_snapshot,
      record_definition_id, record_definition_key, record_definition_version,
      comparison_direction, canonical_value, canonical_unit, comparison_context,
      semantic_snapshot, semantic_version, effective_achieved_at, event_semantics_version,
      achieved_at, comparison_context_key
    ) values (
      v_user_id, v_subject_name, v_definition_label,
      case when v_unit in ('kg','kg_repetitions') then p_value else null end,
      case when v_unit = 'repetitions' then p_value::integer else null end,
      p_achieved_at::date, nullif(btrim(coalesce(p_notes, '')), ''),
      'manual', v_subject_id, v_sport, v_sport_name,
      v_definition_id, v_definition_key, v_definition_version,
      v_direction, p_value, v_unit, coalesce(p_context, '{}'::jsonb),
      jsonb_build_object('subject', p_subject, 'definition', p_definition),
      'personal-record-event-v2', p_achieved_at, 'manual-event-time-v1',
      p_achieved_at, v_context_key
    ) returning * into v_result;
  else
    update public.personal_records set
      exercise_name = v_subject_name,
      record_type = v_definition_label,
      weight_kg = case when v_unit in ('kg','kg_repetitions') then p_value else null end,
      reps = case when v_unit = 'repetitions' then p_value::integer else null end,
      record_date = p_achieved_at::date,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      subject_id = v_subject_id,
      sport_domain = v_sport,
      sport_name_snapshot = v_sport_name,
      record_definition_id = v_definition_id,
      record_definition_key = v_definition_key,
      record_definition_version = v_definition_version,
      comparison_direction = v_direction,
      canonical_value = p_value,
      canonical_unit = v_unit,
      comparison_context = coalesce(p_context, '{}'::jsonb),
      comparison_context_key = v_context_key,
      semantic_snapshot = jsonb_build_object('subject', p_subject, 'definition', p_definition),
      semantic_version = 'personal-record-event-v2',
      effective_achieved_at = p_achieved_at,
      event_semantics_version = 'manual-event-time-v1',
      achieved_at = p_achieved_at,
      updated_at = clock_timestamp()
    where id = p_event_id and user_id = v_user_id and source_kind = 'manual'
    returning * into v_result;
  end if;
  return v_result;
end;
$function$;

revoke all on function public.upsert_manual_personal_record_atomic(uuid,jsonb,jsonb,numeric,jsonb,timestamptz,text)
  from public, anon;
grant execute on function public.upsert_manual_personal_record_atomic(uuid,jsonb,jsonb,numeric,jsonb,timestamptz,text)
  to authenticated, service_role;

create or replace function public.delete_manual_personal_record_atomic(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deleted uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  delete from public.personal_records record
  where record.id = p_event_id
    and record.user_id = v_user_id
    and record.source_kind = 'manual'
  returning record.id into v_deleted;
  if v_deleted is null then
    raise exception 'Manual personal record was not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('event_id', v_deleted, 'deleted', true);
end;
$function$;

revoke all on function public.delete_manual_personal_record_atomic(uuid) from public, anon;
grant execute on function public.delete_manual_personal_record_atomic(uuid) to authenticated, service_role;

create unique index if not exists user_workout_plan_activities_live_catalog_destination_uidx
  on public.user_workout_plan_activities(plan_phase_id, catalog_activity_id)
  where catalog_activity_id is not null and archived_at is null;

create or replace function public.add_catalog_activity_to_plan_day_atomic(
  p_plan_day_id uuid,
  p_activity jsonb,
  p_planned_prescription jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_day public.user_workout_plan_days%rowtype;
  v_plan_session_id uuid;
  v_phase_id uuid;
  v_legacy_id uuid;
  v_activity_id text := nullif(btrim(p_activity->>'id'), '');
  v_name text := nullif(btrim(p_activity->>'name'), '');
  v_catalog_source text := nullif(btrim(p_activity->>'catalogSource'), '');
  v_sort_order integer;
  v_instruction_text text;
  v_sets integer;
  v_reps text;
  v_rest integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_activity) <> 'object'
     or jsonb_typeof(p_planned_prescription) <> 'object'
     or v_activity_id is null or v_name is null
     or v_catalog_source not in ('external', 'legacy', 'custom')
     or (
       v_catalog_source = 'external'
       and (
         jsonb_typeof(nullif(p_activity->'catalogAuthoritySnapshot', 'null'::jsonb)) <> 'object'
         or not private.validate_p10f_catalog_authority_snapshot(nullif(p_activity->'catalogAuthoritySnapshot', 'null'::jsonb))
         or nullif(p_activity->'catalogAuthoritySnapshot', 'null'::jsonb)->>'activityId' <> v_activity_id
       )
     )
     or (v_catalog_source <> 'external' and nullif(p_activity->'catalogAuthoritySnapshot', 'null'::jsonb) is not null)
     or octet_length(p_planned_prescription::text) > 32768 then
    raise exception 'Catalog plan activity input is invalid.' using errcode = '22023';
  end if;

  select day.* into v_day
  from public.user_workout_plan_days day
  join public.user_workout_plans plan on plan.id = day.plan_id
  where day.id = p_plan_day_id
    and plan.user_id = v_user_id
    and day.archived_at is null
    and plan.archived_at is null
  for update of day;
  if v_day.id is null then
    raise exception 'Workout plan day was not found.' using errcode = 'P0002';
  end if;

  select session.id into v_plan_session_id
  from public.user_workout_plan_sessions session
  join public.user_workout_plan_week_templates template on template.id = session.week_template_id
  where session.source_legacy_plan_day_id = v_day.id
    and template.plan_id = v_day.plan_id
    and session.archived_at is null
  order by session.sort_order, session.id
  limit 1
  for update of session;
  if v_plan_session_id is null then
    raise exception 'Workout plan day has no materialized session authority.' using errcode = '23514';
  end if;

  select phase.id into v_phase_id
  from public.user_workout_plan_phases phase
  where phase.plan_session_id = v_plan_session_id
    and phase.archived_at is null
  order by case when phase.phase_slug = 'main_work' then 0 else 1 end, phase.sort_order, phase.id
  limit 1
  for update of phase;
  if v_phase_id is null then
    raise exception 'Workout plan day has no usable phase.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.user_workout_plan_activities activity
    where activity.plan_phase_id = v_phase_id
      and activity.catalog_activity_id = v_activity_id
      and activity.archived_at is null
  ) then
    return jsonb_build_object('status','duplicate','plan_day_id',v_day.id);
  end if;

  v_sets := case when coalesce(p_planned_prescription->>'sets','') ~ '^[1-9][0-9]*$'
    then (p_planned_prescription->>'sets')::integer else null end;
  v_reps := nullif(btrim(p_planned_prescription->>'reps'), '');
  v_rest := case when coalesce(p_planned_prescription->>'rest_seconds','') ~ '^[0-9]+$'
    then (p_planned_prescription->>'rest_seconds')::integer else null end;
  select string_agg(item->>'text', E'\n' order by coalesce((item->>'order')::integer, ordinality::integer))
    into v_instruction_text
  from jsonb_array_elements(coalesce(p_activity->'instructions', '[]'::jsonb)) with ordinality as rows(item, ordinality)
  where nullif(btrim(item->>'text'), '') is not null;

  select coalesce(max(exercise.sort_order), 0) + 1 into v_sort_order
  from public.user_workout_plan_exercises exercise
  where exercise.plan_day_id = v_day.id and exercise.archived_at is null;

  insert into public.user_workout_plan_exercises(
    plan_day_id, workout_id, source_workout_id, exercise_name, category,
    target_muscle, equipment, sets, reps, rest_seconds, instructions,
    sort_order, notes
  ) values (
    v_day.id, null, v_activity_id, v_name,
    nullif(btrim(p_activity->>'activityTypeName'), ''),
    nullif(btrim(p_activity->>'targetText'), ''),
    nullif(btrim(p_activity->>'equipmentText'), ''),
    v_sets, v_reps, v_rest, v_instruction_text, v_sort_order, null
  ) returning id into v_legacy_id;

  insert into public.user_workout_plan_activities(
    plan_phase_id, source_legacy_plan_exercise_id, legacy_source_workout_id,
    catalog_activity_id, catalog_slug, catalog_version, catalog_source,
    activity_name_snapshot, short_description_snapshot, activity_type_slug,
    activity_type_name_snapshot, instructions_snapshot, metric_schema_snapshot,
    planned_prescription, equipment_snapshot, taxonomy_snapshot, sort_order,
    notes, catalog_authority_snapshot
  ) values (
    v_phase_id, v_legacy_id, v_activity_id,
    v_activity_id, nullif(btrim(p_activity->>'slug'), ''),
    nullif(btrim(p_activity->>'revisionNumber'), ''), v_catalog_source,
    v_name, nullif(btrim(p_activity->>'shortDescription'), ''),
    nullif(btrim(p_activity->>'activityTypeSlug'), ''),
    nullif(btrim(p_activity->>'activityTypeName'), ''),
    p_activity->'instructions', nullif(p_activity->'prescriptionSchema', 'null'::jsonb),
    p_planned_prescription, p_activity->'equipment', p_activity->'taxonomy',
    v_sort_order, null, nullif(p_activity->'catalogAuthoritySnapshot', 'null'::jsonb)
  );

  return jsonb_build_object(
    'status','added',
    'plan_day_id',v_day.id,
    'plan_exercise_id',v_legacy_id,
    'activity_id',v_activity_id
  );
end;
$function$;

revoke all on function public.add_catalog_activity_to_plan_day_atomic(uuid,jsonb,jsonb)
  from public, anon;
grant execute on function public.add_catalog_activity_to_plan_day_atomic(uuid,jsonb,jsonb)
  to authenticated, service_role;

do $exercise_records_postflight$
begin
  if to_regclass('public.personal_record_subjects') is null
     or to_regprocedure('public.upsert_manual_personal_record_atomic(uuid,jsonb,jsonb,numeric,jsonb,timestamp with time zone,text)') is null
     or to_regprocedure('public.delete_manual_personal_record_atomic(uuid)') is null
     or to_regprocedure('public.add_catalog_activity_to_plan_day_atomic(uuid,jsonb,jsonb)') is null then
    raise exception 'Exercise Detail + Personal Records authority is incomplete.';
  end if;
  if exists (
    select 1 from public.personal_records
    where source_kind = 'workout_derived' and event_semantics_version is not null
  ) then
    raise exception 'Historical verified Personal Records were rewritten.';
  end if;
end
$exercise_records_postflight$;
