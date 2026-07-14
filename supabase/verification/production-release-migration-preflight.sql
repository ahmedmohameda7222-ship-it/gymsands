-- Plaivra production release migration preflight (read-only)
--
-- Reports blocking schema mismatches for the seven migrations physically
-- present but absent from production history, plus the expected forward ACL
-- correction state. It never changes schema, data, migration history, grants,
-- policies, or compatibility markers.

\set ON_ERROR_STOP on

begin read only;

with required_columns(table_name, column_name) as (
  values
    ('onboarding_answers', 'primary_goal'),
    ('onboarding_answers', 'primary_sport'),
    ('onboarding_answers', 'primary_sport_other'),
    ('onboarding_answers', 'secondary_sports'),
    ('onboarding_answers', 'activity_level'),
    ('onboarding_answers', 'available_days'),
    ('onboarding_answers', 'preferred_workout_time'),
    ('onboarding_answers', 'liked_activities'),
    ('onboarding_answers', 'disliked_activities'),
    ('onboarding_answers', 'sport_details'),
    ('user_nutrition_preference_profiles', 'nutrition_goal'),
    ('user_nutrition_preference_profiles', 'liked_foods'),
    ('user_nutrition_preference_profiles', 'allergy_items'),
    ('user_nutrition_preference_profiles', 'dietary_restrictions'),
    ('user_nutrition_preference_profiles', 'meal_prep_preference'),
    ('user_nutrition_preference_profiles', 'eating_schedule'),
    ('user_nutrition_preference_profiles', 'supplements'),
    ('user_nutrition_preference_profiles', 'tracks_calories_or_macros'),
    ('user_fitness_constraints', 'pain_sensitive_areas'),
    ('user_fitness_constraints', 'movements_to_avoid'),
    ('user_fitness_constraints', 'discomfort_exercises'),
    ('user_fitness_constraints', 'mobility_limitations'),
    ('user_fitness_constraints', 'professional_restrictions'),
    ('user_workout_plan_days', 'archived_at'),
    ('user_workout_plan_exercises', 'archived_at')
), required_constraints(constraint_name) as (
  values
    ('onboarding_answers_setup_stage_check'),
    ('onboarding_answers_sport_details_object_check'),
    ('user_meal_plan_items_status_check'),
    ('user_meal_plan_items_skipped_state_check'),
    ('user_meal_plan_items_execution_state_check'),
    ('user_workout_plans_active_default_archive_check')
), required_indexes(index_name) as (
  values
    ('idx_user_nutrition_target_date_overrides_user_date'),
    ('user_grocery_items_unique_meal_source'),
    ('user_meal_plan_items_unique_food_log'),
    ('user_workout_plans_one_active_uidx'),
    ('user_workout_plan_days_active_idx'),
    ('user_workout_plan_exercises_active_idx'),
    ('workout_sessions_one_open_plan_day_uidx'),
    ('exercise_logs_plan_set_uidx'),
    ('exercise_logs_order_set_uidx')
), required_triggers(table_name, trigger_name) as (
  values
    ('user_meal_plan_items', 'enforce_user_meal_plan_item_status_transition'),
    ('user_nutrition_target_date_overrides', 'user_nutrition_target_date_overrides_updated_at'),
    ('user_workout_sessions', 'user_workout_sessions_reference_integrity'),
    ('workout_sessions', 'workout_sessions_reference_integrity'),
    ('exercise_logs', 'exercise_logs_reference_integrity'),
    ('user_exercise_logs', 'user_exercise_logs_reference_integrity'),
    ('user_workout_plans', 'user_workout_plans_preserve_history'),
    ('user_workout_plan_days', 'user_workout_plan_days_preserve_history'),
    ('user_workout_plan_exercises', 'user_workout_plan_exercises_preserve_history')
), required_functions(signature, security_definer_required, empty_search_path_required) as (
  values
    ('public.complete_adaptive_onboarding_v2(jsonb,jsonb,jsonb,jsonb)', false, false),
    ('public.enforce_user_meal_plan_item_status_transition()', false, true),
    ('public.apply_nutrition_target_changes(date,text,text,integer,numeric,numeric,numeric,integer,text)', false, false),
    ('public.complete_meal_plan_item(uuid)', true, true),
    ('public.complete_meal_plan_item_with_values(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,text,boolean)', true, true),
    ('public.correct_completed_meal_plan_item(uuid,date,text,text,text,numeric,numeric,numeric,numeric,numeric,text)', true, true),
    ('public.assert_workout_actor(uuid)', false, true),
    ('public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)', true, true),
    ('public.archive_workout_plan_atomic(uuid,uuid,text,date)', true, true),
    ('public.create_workout_plan_atomic(uuid,jsonb,boolean,date)', true, true),
    ('public.delete_workout_plan_atomic(uuid,uuid,boolean,date)', true, true),
    ('public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)', true, true),
    ('public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)', true, true)
), canonical_train_rpcs(signature) as (
  values
    ('public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)'),
    ('public.archive_workout_plan_atomic(uuid,uuid,text,date)'),
    ('public.create_workout_plan_atomic(uuid,jsonb,boolean,date)'),
    ('public.delete_workout_plan_atomic(uuid,uuid,boolean,date)'),
    ('public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)'),
    ('public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)')
), expected_override_privileges(privilege_type) as (
  values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')
), actual_override_privileges(privilege_type) as (
  select distinct acl.privilege_type
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  cross join lateral aclexplode(coalesce(
    relation.relacl,
    acldefault('r', relation.relowner)
  )) acl
  join pg_roles grantee on grantee.oid = acl.grantee
  where namespace.nspname = 'public'
    and relation.relname = 'user_nutrition_target_date_overrides'
    and grantee.rolname = 'authenticated'
), findings as (
  select
    'missing_column'::text as issue_type,
    format('%I.%I', table_name, column_name) as object_identity,
    'Required migration column is absent.'::text as details
  from required_columns expected
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
  )

  union all

  select
    'missing_constraint',
    constraint_name,
    'Required migration constraint is absent.'
  from required_constraints expected
  where not exists (
    select 1
    from pg_constraint actual
    join pg_namespace namespace on namespace.oid = actual.connamespace
    where namespace.nspname = 'public'
      and actual.conname = expected.constraint_name
  )

  union all

  select
    'missing_index',
    index_name,
    'Required migration index is absent.'
  from required_indexes expected
  where to_regclass(format('public.%I', expected.index_name)) is null

  union all

  select
    'missing_trigger',
    format('%I.%I', table_name, trigger_name),
    'Required migration trigger is absent.'
  from required_triggers expected
  where not exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = expected.table_name
      and trigger.tgname = expected.trigger_name
      and not trigger.tgisinternal
  )

  union all

  select
    'missing_function',
    signature,
    'Required migration function signature is absent.'
  from required_functions expected
  where to_regprocedure(expected.signature) is null

  union all

  select
    'function_security_mismatch',
    expected.signature,
    case
      when actual.prosecdef is distinct from expected.security_definer_required
        then 'Function invoker/definer mode does not match the repository contract.'
      when expected.empty_search_path_required
        then 'Function search_path must be explicitly empty.'
      else 'Function search_path is not explicitly hardened.'
    end
  from required_functions expected
  join pg_proc actual on actual.oid = to_regprocedure(expected.signature)
  where actual.prosecdef is distinct from expected.security_definer_required
     or (
       expected.empty_search_path_required
       and coalesce(array_to_string(actual.proconfig, ','), '') <> 'search_path=""'
     )
     or (
       not expected.empty_search_path_required
       and coalesce(array_to_string(actual.proconfig, ','), '') not like '%search_path=%'
     )

  union all

  select
    'train_rpc_grant_mismatch',
    signature,
    'Authenticated/service-role execution or anonymous/PUBLIC denial does not match the repository contract.'
  from canonical_train_rpcs rpc
  where to_regprocedure(signature) is not null
    and (
      not has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      or not has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE')
      or has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
      or exists (
        select 1
        from pg_proc granted_function
        cross join lateral aclexplode(coalesce(
          granted_function.proacl,
          acldefault('f', granted_function.proowner)
        )) grant_acl
        where granted_function.oid = to_regprocedure(signature)
          and grant_acl.grantee = 0
          and grant_acl.privilege_type = 'EXECUTE'
      )
    )

  union all

  select
    'train_rpc_actor_check_missing',
    signature,
    'Canonical Train RPC does not invoke public.assert_workout_actor(p_user_id).'
  from canonical_train_rpcs rpc
  where to_regprocedure(signature) is not null
    and lower(pg_get_functiondef(to_regprocedure(signature)))
      !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)'

  union all

  select
    'train_actor_contract_mismatch',
    'public.assert_workout_actor(uuid)',
    'Actor function must enforce auth.uid ownership and preserve the verified service-role auth.role path.'
  where to_regprocedure('public.assert_workout_actor(uuid)') is not null
    and (
      lower(pg_get_functiondef(to_regprocedure('public.assert_workout_actor(uuid)')))
        not like '%coalesce(auth.role(), '''') <> ''service_role''%'
      or lower(pg_get_functiondef(to_regprocedure('public.assert_workout_actor(uuid)')))
        not like '%auth.uid() <> p_user_id%'
    )

  union all

  select
    'missing_override_table',
    'public.user_nutrition_target_date_overrides',
    'Nutrition target override table is absent.'
  where to_regclass('public.user_nutrition_target_date_overrides') is null

  union all

  select
    'override_rls_disabled',
    'public.user_nutrition_target_date_overrides',
    'RLS must remain enabled.'
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'user_nutrition_target_date_overrides'
    and relation.relrowsecurity is not true

  union all

  select
    'override_policy_count_mismatch',
    'public.user_nutrition_target_date_overrides',
    format('Expected four owner policies; found %s.', count(*))
  from pg_policies
  where schemaname = 'public'
    and tablename = 'user_nutrition_target_date_overrides'
  having count(*) <> 4

  union all

  select
    'override_acl_missing_required',
    format('public.user_nutrition_target_date_overrides:%s', expected.privilege_type),
    'Authenticated is missing a required CRUD privilege.'
  from expected_override_privileges expected
  where not exists (
    select 1
    from actual_override_privileges actual
    where actual.privilege_type = expected.privilege_type
  )

  union all

  select
    'override_acl_extra_privilege',
    format('public.user_nutrition_target_date_overrides:%s', actual.privilege_type),
    'Authenticated has a privilege outside the exact CRUD contract.'
  from actual_override_privileges actual
  where not exists (
    select 1
    from expected_override_privileges expected
    where expected.privilege_type = actual.privilege_type
  )

  union all

  select
    'meal_rpc_grant_mismatch',
    signature,
    'Authenticated execution or anonymous denial does not match the repository contract.'
  from (values
    ('public.complete_meal_plan_item(uuid)'),
    ('public.complete_meal_plan_item_with_values(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,text,boolean)'),
    ('public.correct_completed_meal_plan_item(uuid,date,text,text,text,numeric,numeric,numeric,numeric,numeric,text)')
  ) as rpc(signature)
  where to_regprocedure(signature) is not null
    and (
      not has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      or has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
    )

  union all

  select
    'invalid_meal_execution_state',
    'public.user_meal_plan_items',
    format('Found %s rows that violate the terminal execution-state contract.', count(*))
  from public.user_meal_plan_items
  where (status = 'done' and (completed_at is null or food_log_id is null))
     or (status in ('planned', 'skipped') and (completed_at is not null or food_log_id is not null))
  having count(*) > 0

  union all

  select
    'duplicate_meal_food_log',
    'public.user_meal_plan_items.food_log_id',
    format('Found %s duplicate linked food-log groups.', count(*))
  from (
    select food_log_id
    from public.user_meal_plan_items
    where food_log_id is not null
    group by food_log_id
    having count(*) > 1
  ) duplicates
  having count(*) > 0

  union all

  select
    'legacy_train_rpc_overload',
    routine.proname,
    'A superseded Train RPC overload without explicit local-date input remains.'
  from pg_proc routine
  join pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname in (
      'activate_workout_plan_atomic',
      'archive_workout_plan_atomic',
      'create_workout_plan_atomic',
      'delete_workout_plan_atomic',
      'save_workout_plan_atomic',
      'save_workout_plan_day_atomic'
    )
    and pg_get_function_identity_arguments(routine.oid) not like '%date%'

  union all

  select
    'multiple_active_workout_plans',
    'public.user_workout_plans',
    format('Found %s users with multiple active plans.', count(*))
  from (
    select user_id
    from public.user_workout_plans
    where is_active = true and archived_at is null
    group by user_id
    having count(*) > 1
  ) conflicts
  having count(*) > 0

  union all

  select
    'orphan_workout_plan_day',
    'public.user_workout_plan_days',
    format('Found %s plan days without an owning plan.', count(*))
  from public.user_workout_plan_days day
  left join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.id is null
  having count(*) > 0

  union all

  select
    'orphan_workout_plan_exercise',
    'public.user_workout_plan_exercises',
    format('Found %s plan exercises without an owning day.', count(*))
  from public.user_workout_plan_exercises exercise
  left join public.user_workout_plan_days day on day.id = exercise.plan_day_id
  where day.id is null
  having count(*) > 0

  union all

  select
    'duplicate_schedule_occurrence',
    'public.user_workout_sessions',
    format('Found %s duplicate owner/day/date schedule groups.', count(*))
  from (
    select user_id, plan_day_id, scheduled_date
    from public.user_workout_sessions
    where plan_day_id is not null
    group by user_id, plan_day_id, scheduled_date
    having count(*) > 1
  ) duplicates
  having count(*) > 0

  union all

  select
    'scheduled_session_contains_history',
    'public.user_workout_sessions',
    format('Found %s scheduled rows that already contain workout history.', count(*))
  from public.user_workout_sessions session
  where session.status = 'scheduled'
    and (
      session.started_at is not null
      or session.completed_at is not null
      or session.skipped_at is not null
      or exists (
        select 1
        from public.workout_sessions performed
        where performed.scheduled_session_id = session.id
      )
      or exists (
        select 1
        from public.user_exercise_logs exercise_log
        where exercise_log.user_workout_session_id = session.id
      )
    )
  having count(*) > 0
)
select
  count(*)::integer as blocking_finding_count,
  (count(*) > 0) as has_blocking_findings,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'issue_type', issue_type,
        'object_identity', object_identity,
        'details', details
      )
      order by issue_type, object_identity
    ),
    '[]'::jsonb
  ) as blocking_findings
from findings
\gset preflight_

-- Client-side reporting and exit control is shared with its executable psql
-- behavior test. The aggregate above is read-only against persistent objects.
\ir production-release-migration-preflight-control.psql

rollback;
