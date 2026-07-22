begin;

do $aw3a_schema_verification$
declare
  v_count bigint;
  v_rls boolean;
  v_definition jsonb;
  v_function record;
begin
  if to_regclass('public.workout_performance_metric_definitions') is null
     or to_regclass('public.exercise_log_metric_values') is null then
    raise exception 'AW-3A metric tables are missing.';
  end if;

  select count(*), jsonb_agg(
    jsonb_build_object(
      'metric_key',metric_key,
      'metric_version',metric_version,
      'value_kind',value_kind,
      'canonical_unit',canonical_unit,
      'minimum_value',minimum_value,
      'maximum_value',maximum_value,
      'supports_side',supports_side,
      'sort_order',sort_order,
      'is_current',is_current
    ) order by sort_order
  ) into v_count,v_definition
  from public.workout_performance_metric_definitions;

  if v_count <> 7 or v_definition <> jsonb_build_array(
    jsonb_build_object('metric_key','repetitions','metric_version',1,'value_kind','integer','canonical_unit','count','minimum_value',0,'maximum_value',100000,'supports_side',true,'sort_order',10,'is_current',true),
    jsonb_build_object('metric_key','external_load_kg','metric_version',1,'value_kind','decimal','canonical_unit','kg','minimum_value',0,'maximum_value',10000,'supports_side',true,'sort_order',20,'is_current',true),
    jsonb_build_object('metric_key','bodyweight_kg','metric_version',1,'value_kind','decimal','canonical_unit','kg','minimum_value',0,'maximum_value',1000,'supports_side',false,'sort_order',30,'is_current',true),
    jsonb_build_object('metric_key','assistance_load_kg','metric_version',1,'value_kind','decimal','canonical_unit','kg','minimum_value',0,'maximum_value',1000,'supports_side',true,'sort_order',40,'is_current',true),
    jsonb_build_object('metric_key','duration_seconds','metric_version',1,'value_kind','decimal','canonical_unit','seconds','minimum_value',0,'maximum_value',604800,'supports_side',true,'sort_order',50,'is_current',true),
    jsonb_build_object('metric_key','distance_meters','metric_version',1,'value_kind','decimal','canonical_unit','meters','minimum_value',0,'maximum_value',10000000,'supports_side',true,'sort_order',60,'is_current',true),
    jsonb_build_object('metric_key','rounds','metric_version',1,'value_kind','integer','canonical_unit','count','minimum_value',0,'maximum_value',100000,'supports_side',false,'sort_order',70,'is_current',true)
  ) then
    raise exception 'AW-3A definition registry differs from the approved seven definitions.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='workout_performance_metric_definitions'
      and indexname='workout_performance_metric_definitions_one_current_key'
      and indexdef ilike '%where is_current%'
  ) then raise exception 'AW-3A one-current-definition index is missing.'; end if;

  if (select count(*) from information_schema.columns where table_schema='public' and table_name='exercise_log_metric_values') <> 15 then
    raise exception 'AW-3A metric value column count is incorrect.';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_metric_values'
      and c.conname='exercise_log_metric_values_log_session_fkey'
      and pg_get_constraintdef(c.oid) ilike '%foreign key (exercise_log_id, workout_session_id)%exercise_logs(id, workout_session_id)%on delete cascade%'
  ) then raise exception 'AW-3A composite exercise-log ownership FK is missing.'; end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_metric_values'
      and c.conname='exercise_log_metric_values_session_user_fkey'
      and pg_get_constraintdef(c.oid) ilike '%foreign key (workout_session_id, user_id)%workout_sessions(id, user_id)%on delete cascade%'
  ) then raise exception 'AW-3A composite session-owner FK is missing.'; end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='exercise_log_metric_values'
      and c.conname='exercise_log_metric_values_identity_key'
      and pg_get_constraintdef(c.oid) ilike '%unique (exercise_log_id, metric_key, side)%'
  ) then raise exception 'AW-3A metric/side identity constraint is missing.'; end if;

  select relrowsecurity into strict v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='exercise_log_metric_values';
  if v_rls is not true then raise exception 'AW-3A metric RLS is not enabled.'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='exercise_log_metric_values'
      and policyname='exercise_log_metric_values_owner_select' and cmd='SELECT'
  ) then raise exception 'AW-3A owner-read metric policy is missing.'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='exercise_log_metric_values'
      and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'Authenticated role retains direct metric writes.'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='exercise_logs'
      and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'Authenticated role retains direct exercise-log writes.'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='workout_performance_metric_definitions'
      and grantee in ('anon','authenticated') and privilege_type <> 'SELECT'
  ) then raise exception 'Application roles retain metric-definition writes.'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='workout_performance_metric_definitions'
      and grantee='anon'
  ) then raise exception 'Anon role can read global metric definitions.'; end if;

  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='workout_performance_metric_definitions'
      and grantee='authenticated' and privilege_type='SELECT'
  ) then raise exception 'Authenticated role cannot read global metric definitions.'; end if;

  select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner_name
  into v_function
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='upsert_workout_set_logs_atomic'
    and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_session_id uuid, p_logs jsonb';
  if not found or not v_function.prosecdef or v_function.proconfig is distinct from array['search_path=""']::text[] then
    raise exception 'AW-3A public set RPC is not hardened.';
  end if;

  if not exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='upsert_workout_set_logs_atomic'
      and grantee='authenticated' and privilege_type='EXECUTE'
  ) then raise exception 'Authenticated role cannot execute the canonical set RPC.'; end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='upsert_workout_set_logs_atomic'
      and grantee in ('PUBLIC','anon')
  ) then raise exception 'Unsafe public/anon set-RPC execution grant exists.'; end if;

  if exists (
    select 1
    from public.exercise_log_metric_values v
    left join public.exercise_logs l
      on l.id=v.exercise_log_id and l.workout_session_id=v.workout_session_id
    left join public.workout_sessions s
      on s.id=v.workout_session_id and s.user_id=v.user_id
    where l.id is null or s.id is null
  ) then raise exception 'AW-3A metric orphans exist.'; end if;

  if (select count(*) from public.exercise_log_metric_values where source='backfill' and metric_key='repetitions')
     <> (select count(*) from public.exercise_logs where reps is not null) then
    raise exception 'AW-3A repetitions backfill is incomplete.';
  end if;
  if (select count(*) from public.exercise_log_metric_values where source='backfill' and metric_key='external_load_kg')
     <> (select count(*) from public.exercise_logs where weight_kg is not null) then
    raise exception 'AW-3A external-load backfill is incomplete.';
  end if;
  if exists (
    select 1 from public.exercise_log_metric_values
    where source='backfill' and metric_key not in ('repetitions','external_load_kg')
  ) then raise exception 'AW-3A backfill invented an unapproved metric.'; end if;

  if (select migration_version from public.release_schema_compatibility where singleton=true) <> '20260722093115' then
    raise exception 'AW-3A compatibility marker was promoted unexpectedly.';
  end if;
end
$aw3a_schema_verification$;

rollback;
