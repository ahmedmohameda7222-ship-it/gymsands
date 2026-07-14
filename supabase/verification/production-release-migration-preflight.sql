-- Plaivra production release migration preflight (read-only)
--
-- Reports only blocking schema mismatches for the six migrations currently
-- classified as applied_schema_untracked. It never changes schema, data,
-- migration history, grants, policies, or compatibility markers.

\set ON_ERROR_STOP on

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
    ('user_meal_plan_items_execution_state_check')
), required_indexes(index_name) as (
  values
    ('idx_user_nutrition_target_date_overrides_user_date'),
    ('user_grocery_items_unique_meal_source'),
    ('user_meal_plan_items_unique_food_log')
), required_triggers(table_name, trigger_name) as (
  values
    ('user_meal_plan_items', 'enforce_user_meal_plan_item_status_transition'),
    ('user_nutrition_target_date_overrides', 'user_nutrition_target_date_overrides_updated_at')
), required_functions(signature, security_definer_required) as (
  values
    ('public.complete_adaptive_onboarding_v2(jsonb,jsonb,jsonb,jsonb)', false),
    ('public.enforce_user_meal_plan_item_status_transition()', false),
    ('public.apply_nutrition_target_changes(date,text,text,integer,numeric,numeric,numeric,integer,text)', false),
    ('public.complete_meal_plan_item(uuid)', true),
    ('public.complete_meal_plan_item_with_values(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,text,boolean)', true),
    ('public.correct_completed_meal_plan_item(uuid,date,text,text,text,numeric,numeric,numeric,numeric,numeric,text)', true),
    -- Train plan tables are not directly granted to authenticated members. The
    -- narrow RPC boundary therefore uses SECURITY DEFINER after an explicit
    -- assert_workout_actor() check, with an empty search_path and narrow grants.
    ('public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)', true),
    ('public.archive_workout_plan_atomic(uuid,uuid,text,date)', true),
    ('public.create_workout_plan_atomic(uuid,jsonb,boolean,date)', true),
    ('public.delete_workout_plan_atomic(uuid,uuid,boolean,date)', true),
    ('public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)', true),
    ('public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)', true)
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
      when actual.prosecdef is distinct from expected.security_definer_required then 'Function invoker/definer mode does not match the repository contract.'
      else 'Function search_path is not explicitly hardened.'
    end
  from required_functions expected
  join pg_proc actual on actual.oid = to_regprocedure(expected.signature)
  where actual.prosecdef is distinct from expected.security_definer_required
     or coalesce(array_to_string(actual.proconfig, ','), '') not like '%search_path=%'

  union all

  select
    'train_rpc_grant_mismatch',
    signature,
    'Authenticated/service-role execution or anonymous/public denial does not match the repository contract.'
  from (values
    ('public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)'),
    ('public.archive_workout_plan_atomic(uuid,uuid,text,date)'),
    ('public.create_workout_plan_atomic(uuid,jsonb,boolean,date)'),
    ('public.delete_workout_plan_atomic(uuid,uuid,boolean,date)'),
    ('public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)'),
    ('public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)')
  ) as rpc(signature)
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
)
select issue_type, object_identity, details
from findings
order by issue_type, object_identity;

\if :ROW_COUNT
  \echo 'Production release migration preflight failed with' :ROW_COUNT 'blocking finding(s).'
  \quit 3
\else
  \echo 'Production release migration preflight passed: 0 blocking findings.'
\endif
