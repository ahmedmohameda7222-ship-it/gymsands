-- AW-3B Production hardening discovered by the post-apply Supabase advisors.
-- Forward-only: add FK-supporting indexes and close the shared metric registry
-- RLS gap without changing data or the release compatibility marker.

do $aw3b_hardening_preflight$
declare
  v_marker text;
begin
  select migration_version into strict v_marker
  from public.release_schema_compatibility where singleton=true;
  if v_marker<>'20260722161542' then
    raise exception 'AW-3B hardening requires the released AW-3A compatibility marker; found %.',v_marker using errcode='55000';
  end if;
  if to_regclass('public.exercise_log_set_details') is null
     or to_regclass('public.exercise_log_set_segments') is null
     or to_regclass('public.exercise_log_set_segment_metric_values') is null
     or to_regclass('public.workout_performance_metric_definitions') is null then
    raise exception 'AW-3B hardening requires the complete structured set model.' using errcode='55000';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='active_workout_aw3b_structured_set_details'
      and version in ('20260722210312','20260722223426')
  ) then
    raise exception 'AW-3B hardening requires the reconciled AW-3B migration identity.' using errcode='55000';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'exercise_log_set_details_log_session_idx',
      'exercise_log_set_details_session_user_idx',
      'exercise_log_set_segments_log_session_idx',
      'exercise_log_set_segments_session_user_idx',
      'exercise_log_set_segment_metrics_segment_owner_idx',
      'exercise_log_set_segment_metrics_definition_idx'
    )
  ) or exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='workout_performance_metric_definitions'
      and policyname='workout_performance_metric_definitions_authenticated_select'
  ) then
    raise exception 'AW-3B hardening objects already exist or are partially applied.' using errcode='55000';
  end if;
end
$aw3b_hardening_preflight$;

create temporary table aw3b_hardening_baseline on commit drop as
select
  (select migration_version from public.release_schema_compatibility where singleton=true) as marker,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.exercise_log_id),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_details d) as details_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text,'' order by s.exercise_log_id,s.segment_order),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_segments s) as segments_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by m.id),''),'UTF8'),'sha256'),'hex')
    from public.exercise_log_set_segment_metric_values m) as segment_metrics_hash,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.metric_key,d.metric_version),''),'UTF8'),'sha256'),'hex')
    from public.workout_performance_metric_definitions d) as definitions_hash;

create index exercise_log_set_details_log_session_idx
  on public.exercise_log_set_details(exercise_log_id,workout_session_id);
create index exercise_log_set_details_session_user_idx
  on public.exercise_log_set_details(workout_session_id,user_id);
create index exercise_log_set_segments_log_session_idx
  on public.exercise_log_set_segments(exercise_log_id,workout_session_id);
create index exercise_log_set_segments_session_user_idx
  on public.exercise_log_set_segments(workout_session_id,user_id);
create index exercise_log_set_segment_metrics_segment_owner_idx
  on public.exercise_log_set_segment_metric_values(segment_id,exercise_log_id,workout_session_id,user_id);
create index exercise_log_set_segment_metrics_definition_idx
  on public.exercise_log_set_segment_metric_values(metric_key,metric_version);

alter table public.workout_performance_metric_definitions enable row level security;
create policy workout_performance_metric_definitions_authenticated_select
on public.workout_performance_metric_definitions
for select to authenticated
using (true);

do $aw3b_hardening_postflight$
declare
  v_baseline aw3b_hardening_baseline%rowtype;
  v_hash text;
begin
  select * into strict v_baseline from aw3b_hardening_baseline;
  if (select migration_version from public.release_schema_compatibility where singleton=true)<>v_baseline.marker then
    raise exception 'AW-3B hardening unexpectedly changed the compatibility marker.' using errcode='23514';
  end if;
  if exists (
    select 1 from unnest(array[
      'exercise_log_set_details_log_session_idx',
      'exercise_log_set_details_session_user_idx',
      'exercise_log_set_segments_log_session_idx',
      'exercise_log_set_segments_session_user_idx',
      'exercise_log_set_segment_metrics_segment_owner_idx',
      'exercise_log_set_segment_metrics_definition_idx'
    ]) expected(index_name)
    left join pg_class c on c.relname=expected.index_name
    left join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    left join pg_index i on i.indexrelid=c.oid
    where c.oid is null or n.oid is null or not i.indisvalid or not i.indisready
  ) then
    raise exception 'AW-3B hardening did not create every valid FK-supporting index.' using errcode='23514';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.workout_performance_metric_definitions'::regclass)
     or not exists (
       select 1 from pg_policies
       where schemaname='public' and tablename='workout_performance_metric_definitions'
         and policyname='workout_performance_metric_definitions_authenticated_select'
         and cmd='SELECT' and roles='{authenticated}'::name[]
     )
     or has_table_privilege('anon','public.workout_performance_metric_definitions','SELECT')
     or not has_table_privilege('authenticated','public.workout_performance_metric_definitions','SELECT')
     or has_table_privilege('authenticated','public.workout_performance_metric_definitions','INSERT') then
    raise exception 'AW-3B hardening metric-registry RLS or grants are invalid.' using errcode='42501';
  end if;

  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.exercise_log_id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_details d;
  if v_hash<>v_baseline.details_hash then raise exception 'AW-3B hardening changed set details.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(s)::text,'' order by s.exercise_log_id,s.segment_order),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_segments s;
  if v_hash<>v_baseline.segments_hash then raise exception 'AW-3B hardening changed set segments.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(m)::text,'' order by m.id),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.exercise_log_set_segment_metric_values m;
  if v_hash<>v_baseline.segment_metrics_hash then raise exception 'AW-3B hardening changed segment metrics.' using errcode='23514'; end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(d)::text,'' order by d.metric_key,d.metric_version),''),'UTF8'),'sha256'),'hex')
  into v_hash from public.workout_performance_metric_definitions d;
  if v_hash<>v_baseline.definitions_hash then raise exception 'AW-3B hardening changed metric definitions.' using errcode='23514'; end if;
end
$aw3b_hardening_postflight$;
