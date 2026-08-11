begin;

alter table public.user_workout_plan_activities
  add column if not exists catalog_authority_snapshot jsonb;

comment on column public.user_workout_plan_activities.catalog_authority_snapshot is
  'P10F immutable save-time Activity Catalog Library/Catalog release, revision, schema, record-definition, mapping/taxonomy/workload, publication-policy, and capability authority for newly materialized V2 plan activities. NULL preserves legacy/pre-P10F rows.';

create or replace function private.validate_p10f_catalog_authority_snapshot(p_snapshot jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_snapshot is null or (
    jsonb_typeof(p_snapshot) = 'object'
    and jsonb_typeof(p_snapshot->'libraryRelease') = 'object'
    and jsonb_typeof(p_snapshot->'catalogRelease') = 'object'
    and coalesce(p_snapshot#>>'{libraryRelease,id}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(p_snapshot#>>'{catalogRelease,id}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and length(coalesce(p_snapshot#>>'{libraryRelease,version}', '')) between 1 and 128
    and length(coalesce(p_snapshot#>>'{catalogRelease,version}', '')) between 1 and 128
    and coalesce(p_snapshot#>>'{libraryRelease,checksum}', '') ~ '^[0-9a-f]{64}$'
    and coalesce(p_snapshot#>>'{catalogRelease,checksum}', '') ~ '^[0-9a-f]{64}$'
    and coalesce(p_snapshot->>'activityId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(p_snapshot->>'revisionId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(p_snapshot->'revisionNumber') = 'number'
    and (p_snapshot->>'revisionNumber')::integer > 0
    and (p_snapshot->'prescriptionSchema' is null or jsonb_typeof(p_snapshot->'prescriptionSchema') in ('object','null'))
    and (p_snapshot->'performedMetricSchema' is null or jsonb_typeof(p_snapshot->'performedMetricSchema') in ('object','null'))
    and jsonb_typeof(coalesce(p_snapshot->'recordDefinitions', '[]'::jsonb)) = 'array'
    and (p_snapshot->'mappingAuthority' is null or jsonb_typeof(p_snapshot->'mappingAuthority') in ('object','null'))
    and (p_snapshot->'publicationPolicy' is null or jsonb_typeof(p_snapshot->'publicationPolicy') in ('object','null'))
    and (p_snapshot->'capabilityContract' is null or jsonb_typeof(p_snapshot->'capabilityContract') in ('object','null'))
  );
$function$;

alter table public.user_workout_plan_activities
  drop constraint if exists user_workout_plan_activities_p10f_catalog_authority_snapshot_valid;

alter table public.user_workout_plan_activities
  add constraint user_workout_plan_activities_p10f_catalog_authority_snapshot_valid
  check (private.validate_p10f_catalog_authority_snapshot(catalog_authority_snapshot))
  not valid;

alter table public.user_workout_plan_activities
  validate constraint user_workout_plan_activities_p10f_catalog_authority_snapshot_valid;

create or replace function private.enforce_p10f_catalog_authority_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.catalog_authority_snapshot is not null then
    if not private.validate_p10f_catalog_authority_snapshot(new.catalog_authority_snapshot) then
      raise exception 'Catalog authority snapshot is invalid.' using errcode = '23514';
    end if;
    if new.catalog_activity_id is null
       or new.catalog_activity_id::text <> new.catalog_authority_snapshot->>'activityId' then
      raise exception 'Catalog authority snapshot activity identity mismatch.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.catalog_authority_snapshot is not null
     and new.catalog_authority_snapshot is distinct from old.catalog_authority_snapshot then
    raise exception 'Catalog authority snapshot is immutable after materialization.' using errcode = '23514';
  end if;
  return new;
end
$function$;

revoke all on function private.validate_p10f_catalog_authority_snapshot(jsonb) from public, anon, authenticated;
revoke all on function private.enforce_p10f_catalog_authority_snapshot() from public, anon, authenticated;

drop trigger if exists user_workout_plan_activities_p10f_catalog_authority_snapshot on public.user_workout_plan_activities;
create trigger user_workout_plan_activities_p10f_catalog_authority_snapshot
before insert or update of catalog_activity_id, catalog_authority_snapshot
on public.user_workout_plan_activities
for each row execute function private.enforce_p10f_catalog_authority_snapshot();

do $postconditions$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_workout_plan_activities'
      and column_name='catalog_authority_snapshot' and data_type='jsonb' and is_nullable='YES'
  ) then
    raise exception 'P10F catalog authority snapshot column is missing or incompatible.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_workout_plan_activities'
      and column_name='catalog_authority_snapshot' and column_default is not null
  ) then
    raise exception 'P10F catalog authority snapshot must not have a default.';
  end if;
  if to_regprocedure('private.validate_p10f_catalog_authority_snapshot(jsonb)') is null then
    raise exception 'P10F catalog authority snapshot validator is missing.';
  end if;
end
$postconditions$;

commit;
