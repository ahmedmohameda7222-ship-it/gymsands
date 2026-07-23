begin;

do $aw3b_schema_verification$
declare
  v_function record;
  v_function_definition text;
  v_marker text;
begin
  if to_regclass('public.exercise_log_set_details') is null
     or to_regclass('public.exercise_log_set_segments') is null
     or to_regclass('public.exercise_log_set_segment_metric_values') is null then
    raise exception 'AW-3B structured set tables are missing.';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='exercise_log_set_details')<>17
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='exercise_log_set_segments')<>13
     or (select count(*) from information_schema.columns where table_schema='public' and table_name='exercise_log_set_segment_metric_values')<>15 then
    raise exception 'AW-3B structured set column contract differs from v1.';
  end if;
  if not exists (
    select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_set_details'
      and c.conname='exercise_log_set_details_log_session_fkey'
      and pg_get_constraintdef(c.oid) ilike '%foreign key (exercise_log_id, workout_session_id)%exercise_logs(id, workout_session_id)%on delete cascade%'
  ) then raise exception 'AW-3B detail log/session cascade is missing.'; end if;
  if not exists (
    select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_set_details'
      and c.conname='exercise_log_set_details_log_session_key'
      and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike 'unique (exercise_log_id, workout_session_id)%'
  ) then raise exception 'AW-3B detail relation is not an exact PostgREST one-to-one contract.'; end if;
  if not exists (
    select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_set_segments'
      and c.conname='exercise_log_set_segments_order_key'
      and pg_get_constraintdef(c.oid) ilike '%unique (exercise_log_id, segment_order)%'
  ) then raise exception 'AW-3B segment order identity is missing.'; end if;
  if not exists (
    select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_set_segment_metric_values'
      and c.conname='exercise_log_set_segment_metric_values_identity_key'
      and pg_get_constraintdef(c.oid) ilike '%unique (segment_id, metric_key, metric_version, side)%'
  ) then raise exception 'AW-3B segment metric identity is missing.'; end if;
  if not exists (
    select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_set_segment_metric_values'
      and c.conname='exercise_log_set_segment_metric_values_definition_fkey'
      and pg_get_constraintdef(c.oid) ilike '%workout_performance_metric_definitions(metric_key, metric_version)%'
  ) then raise exception 'AW-3B segment metrics are not registry-bound.'; end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'exercise_log_set_details','exercise_log_set_segments','exercise_log_set_segment_metric_values'
    ) and not c.relrowsecurity
  ) then raise exception 'AW-3B RLS is not enabled on every owner-bound table.'; end if;
  if exists (
    with expected(tablename,policyname) as (values
      ('exercise_log_set_details','exercise_log_set_details_owner_select'),
      ('exercise_log_set_segments','exercise_log_set_segments_owner_select'),
      ('exercise_log_set_segment_metric_values','exercise_log_set_segment_metric_values_owner_select')
    )
    select 1 from expected e
    left join pg_policies p
      on p.schemaname='public' and p.tablename=e.tablename and p.policyname=e.policyname
    where p.policyname is null or p.cmd<>'SELECT' or p.roles<>'{authenticated}'::name[]
      or coalesce(p.qual,'') not like '%( SELECT auth.uid()%'
      or coalesce(p.qual,'') not like '%( SELECT private.is_admin()%'
  ) or exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename in (
        'exercise_log_set_details','exercise_log_set_segments','exercise_log_set_segment_metric_values'
      )
      and not (
        p.cmd='SELECT' and p.policyname=p.tablename||'_owner_select'
      )
  ) then raise exception 'AW-3B owner-read policies are incomplete or unsafe.'; end if;
  if not (select relrowsecurity from pg_class where oid='public.workout_performance_metric_definitions'::regclass)
     or not exists (
       select 1 from pg_policies
       where schemaname='public' and tablename='workout_performance_metric_definitions'
         and policyname='workout_performance_metric_definitions_authenticated_select'
         and cmd='SELECT' and roles='{authenticated}'::name[]
     ) then raise exception 'AW-3B shared metric registry RLS is incomplete.'; end if;
  if exists (
    select 1 from unnest(array[
      'exercise_log_set_details','exercise_log_set_segments','exercise_log_set_segment_metric_values'
    ]) relation_name
    where not has_table_privilege('authenticated','public.'||relation_name,'SELECT')
      or has_table_privilege('authenticated','public.'||relation_name,'INSERT')
      or has_table_privilege('authenticated','public.'||relation_name,'UPDATE')
      or has_table_privilege('authenticated','public.'||relation_name,'DELETE')
      or has_table_privilege('anon','public.'||relation_name,'SELECT')
      or has_table_privilege('anon','public.'||relation_name,'INSERT')
      or has_table_privilege('anon','public.'||relation_name,'UPDATE')
      or has_table_privilege('anon','public.'||relation_name,'DELETE')
      or not has_table_privilege('service_role','public.'||relation_name,'SELECT')
      or not has_table_privilege('service_role','public.'||relation_name,'INSERT')
      or not has_table_privilege('service_role','public.'||relation_name,'UPDATE')
      or not has_table_privilege('service_role','public.'||relation_name,'DELETE')
  ) then raise exception 'AW-3B effective table privileges are invalid.'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in (
      'exercise_log_set_details','exercise_log_set_segments','exercise_log_set_segment_metric_values'
    ) and grantee='PUBLIC'
  ) then raise exception 'PUBLIC retains direct AW-3B table privileges.'; end if;
  if exists (
    select 1 from unnest(array[
      'exercise_log_set_details_log_session_key',
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
  ) then raise exception 'AW-3B FK-supporting index contract is incomplete.'; end if;
  if to_regclass('public.exercise_log_set_details_log_session_idx') is not null
     or not exists (
       select 1 from pg_index
       where indexrelid='public.exercise_log_set_details_log_session_key'::regclass
         and indisunique and indisvalid and indisready
     ) then raise exception 'AW-3B redundant detail index cleanup or unique read index is invalid.'; end if;

  select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner_name into v_function
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='upsert_workout_set_logs_atomic'
    and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_session_id uuid, p_logs jsonb';
  if not found or not v_function.prosecdef or v_function.proconfig is distinct from array['search_path=""']::text[] then
    raise exception 'AW-3B public set RPC is not hardened.';
  end if;
  if to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null then
    raise exception 'AW-3B bounded wrapper has no private structured core.';
  end if;
  select pg_get_functiondef('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'::regprocedure)
  into strict v_function_definition;
  if v_function_definition !~* 'pg_column_size\s*\(v_logs\)\s*>\s*16777216'
     or v_function_definition !~* 'v_final_count\s*>\s*500'
     or v_function_definition not like '%private.aw3b_structured_upsert_workout_set_logs_atomic%'
     or v_function_definition !~* 'for\s+update' then
    raise exception 'AW-3B public set RPC payload/session bounds are incomplete.';
  end if;
  if has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('service_role','private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'AW-3B effective function privileges are invalid.';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema in ('public','private')
      and routine_name in ('upsert_workout_set_logs_atomic','aw3b_structured_upsert_workout_set_logs_atomic')
      and grantee='PUBLIC'
  ) then raise exception 'PUBLIC retains direct AW-3B function execution.'; end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='active_workout_aw3b_read_and_payload_corrections'
  ) then raise exception 'AW-3B forward read/payload correction migration is missing.'; end if;

  if exists (
    select 1 from public.exercise_log_set_details d
    left join public.exercise_logs l on l.id=d.exercise_log_id and l.workout_session_id=d.workout_session_id
    left join public.workout_sessions s on s.id=d.workout_session_id and s.user_id=d.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1 from public.exercise_log_set_segments g
    left join public.exercise_logs l on l.id=g.exercise_log_id and l.workout_session_id=g.workout_session_id
    left join public.workout_sessions s on s.id=g.workout_session_id and s.user_id=g.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1 from public.exercise_log_set_segment_metric_values m
    left join public.exercise_log_set_segments g
      on g.id=m.segment_id and g.exercise_log_id=m.exercise_log_id
     and g.workout_session_id=m.workout_session_id and g.user_id=m.user_id
    where g.id is null
  ) then raise exception 'AW-3B ownership orphans exist.'; end if;

  if exists (
    select 1 from public.exercise_log_set_details
    where source='backfill' and (
      side_mode<>'none' or planned_tempo is not null or performed_tempo is not null
      or tempo_adherence<>'not_recorded' or source_provider is not null or source_version is not null
    )
  ) then raise exception 'AW-3B backfill inferred an unapproved fact.'; end if;
  if exists (
    select 1 from public.exercise_log_set_details d join public.exercise_logs l on l.id=d.exercise_log_id
    where d.source='backfill' and (d.notes is distinct from l.notes or d.set_type is distinct from l.set_type)
  ) then raise exception 'AW-3B backfill compatibility projection drift exists.'; end if;

  select migration_version into strict v_marker from public.release_schema_compatibility where singleton=true;
  if v_marker<>'20260722161542' then
    raise exception 'AW-3B compatibility marker differs from the released AW-3A baseline.';
  end if;
end
$aw3b_schema_verification$;

create temporary table aw3b_backfill_fixture_results on commit drop as
with fixtures(
  fixture_id,set_type,original_note,expected_eligible,expected_note,
  expected_set_type,expected_rpe,expected_rir
) as (values
  (1,'normal','Free note | type:drop | RPE:8.5 | RIR:1',true,'Free note','drop',8.5::numeric,1::numeric),
  (2,'working','Free note | RPE:8.55',false,null,null,null::numeric,null::numeric),
  (3,'working','RPE:8 | RPE:9 | Free note',false,null,null,null::numeric,null::numeric),
  (4,'normal','type:warmup | RPE:6 | RIR:4',true,null,'warmup',6::numeric,4::numeric),
  (5,'working','rpe:8 | Free note',false,null,null,null::numeric,null::numeric),
  (6,'working','RPE:8 | RPE:8.55 | Free note',true,'RPE:8.55 | Free note','working',8::numeric,null::numeric)
), split as (
  select f.*,token.ordinality,token.segment,
    case
      when token.segment ~ '^type:(warmup|working|normal|failure|drop)$' then 'type'
      when token.segment ~ '^RPE:(10(?:\.0)?|[0-9](?:\.[0-9])?)$' then 'rpe'
      when token.segment ~ '^RIR:(20(?:\.0)?|1[0-9](?:\.[0-9])?|[0-9](?:\.[0-9])?)$' then 'rir'
      else null
    end as token_kind
  from fixtures f
  cross join lateral regexp_split_to_table(f.original_note,' \| ')
    with ordinality as token(segment,ordinality)
), aggregated as (
  select fixture_id,set_type,original_note,expected_eligible,expected_note,
    expected_set_type,expected_rpe,expected_rir,
    count(*) filter (where token_kind='type') as type_count,
    count(*) filter (where token_kind='rpe') as rpe_count,
    count(*) filter (where token_kind='rir') as rir_count,
    max(substring(segment from 6)) filter (where token_kind='type') as parsed_type,
    max(substring(segment from 5)) filter (where token_kind='rpe') as parsed_rpe,
    max(substring(segment from 5)) filter (where token_kind='rir') as parsed_rir,
    string_agg(segment,' | ' order by ordinality) filter (where token_kind is null) as remaining_note
  from split
  group by fixture_id,set_type,original_note,expected_eligible,expected_note,
    expected_set_type,expected_rpe,expected_rir
), parsed as (
  select fixture_id,remaining_note,coalesce(parsed_type,set_type) as parsed_set_type,
    parsed_rpe::numeric as parsed_rpe,parsed_rir::numeric as parsed_rir
  from aggregated
  where type_count+rpe_count+rir_count>0
    and type_count<=1 and rpe_count<=1 and rir_count<=1
)
select f.*,p.fixture_id is not null as actual_eligible,
  p.remaining_note as actual_note,p.parsed_set_type as actual_set_type,
  p.parsed_rpe as actual_rpe,p.parsed_rir as actual_rir
from fixtures f left join parsed p using (fixture_id);

do $aw3b_backfill_fixture_verification$
begin
  if exists (
    select 1 from aw3b_backfill_fixture_results
    where actual_eligible is distinct from expected_eligible
      or (expected_eligible and (
        actual_note is distinct from expected_note
        or actual_set_type is distinct from expected_set_type
        or actual_rpe is distinct from expected_rpe
        or actual_rir is distinct from expected_rir
      ))
  ) then
    raise exception 'AW-3B exact/ambiguous/duplicate/token-only backfill fixtures failed.';
  end if;
  if exists (
    select 1 from aw3b_backfill_fixture_results r
    cross join lateral regexp_split_to_table(r.actual_note,' \| ') token(segment)
    where r.actual_eligible and r.actual_note is not null
      and (
        token.segment ~ '^type:(warmup|working|normal|failure|drop)$'
        or token.segment ~ '^RPE:(10(?:\.0)?|[0-9](?:\.[0-9])?)$'
        or token.segment ~ '^RIR:(20(?:\.0)?|1[0-9](?:\.[0-9])?|[0-9](?:\.[0-9])?)$'
      )
  ) then
    raise exception 'AW-3B backfill fixture retry was not idempotent.';
  end if;
end
$aw3b_backfill_fixture_verification$;

rollback;
