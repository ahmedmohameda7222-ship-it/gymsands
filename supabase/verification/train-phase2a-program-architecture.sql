-- Disposable verification for Plaivra Train Phase 2A.
-- Run after a clean local migration reset. All fixtures are rolled back.

\set ON_ERROR_STOP on
\set owner_id '31000000-0000-4000-8000-000000000001'
\set intruder_id '32000000-0000-4000-8000-000000000002'
\set deletion_id '33000000-0000-4000-8000-000000000003'

begin;

do $catalog$
declare
  table_name text;
  required_column record;
  routine_oid oid;
  routine_settings text[];
  signature text;
begin
  foreach table_name in array array[
    'user_workout_plan_week_templates',
    'user_workout_plan_weeks',
    'user_workout_plan_sessions',
    'user_workout_plan_phases',
    'user_workout_plan_activities'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing Train Phase 2A table: %', table_name;
    end if;

    if not exists (
      select 1
      from pg_class relation
      where relation.oid = ('public.' || table_name)::regclass
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on Train Phase 2A table: %', table_name;
    end if;

    if not exists (
      select 1
      from pg_policy policy
      cross join lateral unnest(policy.polroles) policy_role(role_oid)
      join pg_roles role_definition on role_definition.oid = policy_role.role_oid
      where policy.polrelid = ('public.' || table_name)::regclass
        and role_definition.rolname = 'authenticated'
    ) then
      raise exception 'Authenticated ownership policy is missing on Train Phase 2A table: %', table_name;
    end if;

    if not has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
       or not has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
       or not has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
       or not has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      raise exception 'Authenticated CRUD grant is incomplete on Train Phase 2A table: %', table_name;
    end if;

    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has access to Train Phase 2A table: %', table_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'user_workout_plan_week_templates',
        'user_workout_plan_weeks',
        'user_workout_plan_sessions',
        'user_workout_plan_phases',
        'user_workout_plan_activities'
      ])
      and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')) like '%public.is_admin()%'
  ) then
    raise exception 'A Train Phase 2A policy still references public.is_admin().';
  end if;

  routine_oid := to_regprocedure('private.can_access_workout_plan(uuid)');
  if routine_oid is null then
    raise exception 'Missing private.can_access_workout_plan(uuid).';
  end if;
  if not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Workout-plan access helper must be SECURITY DEFINER.';
  end if;
  if (select provolatile from pg_proc where oid = routine_oid) <> 's' then
    raise exception 'Workout-plan access helper must be STABLE.';
  end if;
  select proconfig into routine_settings from pg_proc where oid = routine_oid;
  if coalesce(array_to_string(routine_settings, ','), '') not like '%search_path=%' then
    raise exception 'Workout-plan access helper search_path is not hardened.';
  end if;
  if not has_function_privilege('authenticated', routine_oid, 'EXECUTE')
     or not has_function_privilege('service_role', routine_oid, 'EXECUTE')
     or has_function_privilege('anon', routine_oid, 'EXECUTE') then
    raise exception 'Workout-plan access helper grants are incorrect.';
  end if;
  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid = routine_oid
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute the workout-plan access helper.';
  end if;

  if exists (
    select required_table.table_name
    from unnest(array[
      'user_workout_plan_week_templates',
      'user_workout_plan_weeks',
      'user_workout_plan_sessions',
      'user_workout_plan_phases',
      'user_workout_plan_activities'
    ]) required_table(table_name)
    where not exists (
      select 1
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = required_table.table_name
        and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''))
          like '%private.can_access_workout_plan%'
    )
  ) then
    raise exception 'A Train Phase 2A policy does not use private.can_access_workout_plan().';
  end if;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'user_workout_plan_week_templates',
        'user_workout_plan_weeks',
        'user_workout_plan_sessions',
        'user_workout_plan_phases',
        'user_workout_plan_activities'
      ])
      and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''))
        like '%user_workout_plans%'
  ) then
    raise exception 'A Train Phase 2A policy reads user_workout_plans directly instead of using the private helper.';
  end if;

  for required_column in
    select *
    from (values
      ('user_workout_plan_week_templates', 'plan_id'),
      ('user_workout_plan_week_templates', 'derived_from_template_id'),
      ('user_workout_plan_weeks', 'week_template_id'),
      ('user_workout_plan_weeks', 'week_number'),
      ('user_workout_plan_sessions', 'sport_slug'),
      ('user_workout_plan_sessions', 'sport_name_snapshot'),
      ('user_workout_plan_sessions', 'session_type_slug'),
      ('user_workout_plan_phases', 'phase_slug'),
      ('user_workout_plan_activities', 'metric_schema_snapshot'),
      ('user_workout_plan_activities', 'planned_prescription'),
      ('user_workout_sessions', 'plan_week_id'),
      ('user_workout_sessions', 'plan_session_id'),
      ('workout_sessions', 'plan_week_id'),
      ('workout_sessions', 'plan_session_id'),
      ('user_exercise_logs', 'plan_activity_id'),
      ('exercise_logs', 'plan_activity_id')
    ) columns(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns column_definition
      where column_definition.table_schema = 'public'
        and column_definition.table_name = required_column.table_name
        and column_definition.column_name = required_column.column_name
    ) then
      raise exception 'Missing Train Phase 2A column: %.%', required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if to_regprocedure('public.assert_train_phase2a_session_structure_integrity()') is null then
    raise exception 'Missing table-specific Phase 2A session integrity trigger function.';
  end if;
  if to_regprocedure('public.assert_train_phase2a_activity_structure_integrity()') is null then
    raise exception 'Missing table-specific Phase 2A activity integrity trigger function.';
  end if;
  if to_regprocedure('public.assert_train_phase2a_structure_integrity()') is not null then
    raise exception 'Obsolete shared Phase 2A structure trigger function is still present.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_definition
    join pg_proc routine on routine.oid = trigger_definition.tgfoid
    where trigger_definition.tgrelid = 'public.user_workout_plan_sessions'::regclass
      and trigger_definition.tgname = 'user_workout_plan_sessions_structure_integrity'
      and not trigger_definition.tgisinternal
      and routine.proname = 'assert_train_phase2a_session_structure_integrity'
  ) then
    raise exception 'Phase 2A session integrity trigger is not attached to its table-specific function.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_definition
    join pg_proc routine on routine.oid = trigger_definition.tgfoid
    where trigger_definition.tgrelid = 'public.user_workout_plan_activities'::regclass
      and trigger_definition.tgname = 'user_workout_plan_activities_structure_integrity'
      and not trigger_definition.tgisinternal
      and routine.proname = 'assert_train_phase2a_activity_structure_integrity'
  ) then
    raise exception 'Phase 2A activity integrity trigger is not attached to its table-specific function.';
  end if;

  routine_oid := to_regprocedure('public.detach_workout_plan_week_atomic(uuid,uuid)');
  if routine_oid is null then
    raise exception 'Missing detach_workout_plan_week_atomic(uuid,uuid).';
  end if;

  select proconfig into routine_settings from pg_proc where oid = routine_oid;
  if not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Detach RPC must be SECURITY DEFINER.';
  end if;
  if coalesce(array_to_string(routine_settings, ','), '') not like '%search_path=%' then
    raise exception 'Detach RPC search_path is not hardened.';
  end if;
  if not has_function_privilege('authenticated', routine_oid, 'EXECUTE')
     or not has_function_privilege('service_role', routine_oid, 'EXECUTE')
     or has_function_privilege('anon', routine_oid, 'EXECUTE') then
    raise exception 'Detach RPC grants are incorrect.';
  end if;
  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid = routine_oid
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute the detach RPC.';
  end if;

  foreach signature in array array[
    'public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)',
    'public.create_workout_plan_atomic(uuid,jsonb,boolean,date)',
    'public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)',
    'public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Existing canonical Train RPC is missing after Phase 2A: %', signature;
    end if;
  end loop;

  if to_regclass('supabase_migrations.schema_migrations') is not null
     and not exists (
       select 1
       from supabase_migrations.schema_migrations migration
       where migration.version = '20260715190000'
     ) then
    raise exception 'Train Phase 2A migration is absent from the local migration ledger.';
  end if;
end
$catalog$;

do $stored_integrity$
declare
  expected_week_count bigint;
begin
  select coalesce(sum(
    case when plan.program_duration_weeks between 1 and 104 then plan.program_duration_weeks else 1 end
  ), 0)
  into expected_week_count
  from public.user_workout_plans plan;

  if exists (
    select plan.id
    from public.user_workout_plans plan
    left join public.user_workout_plan_week_templates template
      on template.plan_id = plan.id and template.source = 'legacy_backfill'
    group by plan.id
    having count(template.id) <> 1
  ) then
    raise exception 'Legacy backfill does not contain exactly one initial template per plan.';
  end if;

  if (select count(*) from public.user_workout_plan_weeks) <> expected_week_count then
    raise exception 'Legacy backfill assigned-week count is incomplete.';
  end if;

  if (select count(*) from public.user_workout_plan_sessions where source_legacy_plan_day_id is not null)
     <> (select count(*) from public.user_workout_plan_days) then
    raise exception 'Legacy plan-day backfill is incomplete.';
  end if;

  if (select count(*) from public.user_workout_plan_activities where source_legacy_plan_exercise_id is not null)
     <> (select count(*) from public.user_workout_plan_exercises) then
    raise exception 'Legacy plan-exercise backfill is incomplete.';
  end if;

  if exists (
    select source_legacy_plan_day_id
    from public.user_workout_plan_sessions
    where source_legacy_plan_day_id is not null and archived_at is null
    group by source_legacy_plan_day_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate live legacy plan-day mapping exists.';
  end if;

  if exists (
    select source_legacy_plan_exercise_id
    from public.user_workout_plan_activities
    where source_legacy_plan_exercise_id is not null and archived_at is null
    group by source_legacy_plan_exercise_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate live legacy plan-exercise mapping exists.';
  end if;

  if exists (
    select 1
    from public.user_workout_plan_weeks week
    join public.user_workout_plan_week_templates template on template.id = week.week_template_id
    where week.plan_id <> template.plan_id
  ) then
    raise exception 'Cross-plan assigned-week/template reference exists.';
  end if;

  if exists (
    select 1
    from public.user_workout_plan_sessions session
    left join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where template.id is null
  ) or exists (
    select 1
    from public.user_workout_plan_phases phase
    left join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    where session.id is null
  ) or exists (
    select 1
    from public.user_workout_plan_activities activity
    left join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    where phase.id is null
  ) then
    raise exception 'Orphaned Train Phase 2A hierarchy row exists.';
  end if;

  if exists (
    select 1
    from public.user_workout_plan_activities activity
    where jsonb_typeof(activity.planned_prescription) <> 'object'
       or (activity.metric_schema_snapshot is not null and jsonb_typeof(activity.metric_schema_snapshot) <> 'object')
       or (activity.instructions_snapshot is not null and jsonb_typeof(activity.instructions_snapshot) <> 'array')
       or (activity.equipment_snapshot is not null and jsonb_typeof(activity.equipment_snapshot) not in ('array', 'object'))
       or (activity.taxonomy_snapshot is not null and jsonb_typeof(activity.taxonomy_snapshot) <> 'object')
  ) then
    raise exception 'Malformed Train Phase 2A JSON snapshot exists.';
  end if;

  if exists (
    select 1
    from public.user_workout_sessions scheduled
    join public.user_workout_plan_sessions session on session.id = scheduled.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where scheduled.plan_session_id is not null
      and template.plan_id <> scheduled.user_workout_plan_id
  ) or exists (
    select 1
    from public.workout_sessions performed
    join public.user_workout_plan_sessions session on session.id = performed.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where performed.plan_session_id is not null
      and template.plan_id is distinct from performed.plan_id
  ) then
    raise exception 'Session bridge consistency check failed.';
  end if;

  if exists (
    select 1
    from public.user_exercise_logs log
    join public.user_workout_sessions scheduled on scheduled.id = log.user_workout_session_id
    join public.user_workout_plan_activities activity on activity.id = log.plan_activity_id
    join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where log.plan_activity_id is not null
      and template.plan_id <> scheduled.user_workout_plan_id
  ) or exists (
    select 1
    from public.exercise_logs log
    join public.workout_sessions performed on performed.id = log.workout_session_id
    join public.user_workout_plan_activities activity on activity.id = log.plan_activity_id
    join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where log.plan_activity_id is not null
      and template.plan_id is distinct from performed.plan_id
  ) then
    raise exception 'Activity bridge consistency check failed.';
  end if;
end
$stored_integrity$;

-- Reusable assertions keep psql variables outside quoted PL/pgSQL bodies.
create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $assert$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$assert$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

create function pg_temp.assert_same_plan_denied(p_plan_id uuid, p_template_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_weeks(plan_id, week_template_id, week_number)
    values (p_plan_id, p_template_id, 50);
    set constraints user_workout_plan_weeks_template_same_plan_fk immediate;
  exception when foreign_key_violation then
    set constraints user_workout_plan_weeks_template_same_plan_fk deferred;
    return;
  end;
  raise exception 'Cross-plan assigned week unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_cross_plan_legacy_session_denied(
  p_template_id uuid,
  p_legacy_day_id uuid
)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_sessions(
      week_template_id, source_legacy_plan_day_id, source, title, day_offset,
      sport_slug, sport_name_snapshot, sort_order
    ) values (
      p_template_id, p_legacy_day_id, 'legacy_backfill',
      'Forbidden legacy session mapping', 0, null, 'Legacy training', 99
    );
  exception when sqlstate '23514' then
    return;
  end;
  raise exception 'Cross-plan legacy session mapping unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_cross_plan_legacy_activity_denied(
  p_phase_id uuid,
  p_legacy_exercise_id uuid
)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_activities(
      plan_phase_id, source_legacy_plan_exercise_id, catalog_source,
      activity_name_snapshot, planned_prescription, sort_order
    ) values (
      p_phase_id, p_legacy_exercise_id, 'legacy',
      'Forbidden legacy activity mapping', '{}'::jsonb, 99
    );
  exception when sqlstate '23514' then
    return;
  end;
  raise exception 'Cross-plan legacy activity mapping unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_intruder_detach_denied(p_owner_id uuid, p_plan_week_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    perform public.detach_workout_plan_week_atomic(p_owner_id, p_plan_week_id);
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'Cross-owner detach unexpectedly succeeded.';
end
$assert$;

grant execute on function pg_temp.assert_intruder_detach_denied(uuid, uuid) to authenticated;

create function pg_temp.assert_intruder_insert_denied(p_template_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_sessions(
      week_template_id, source, title, day_offset, sport_slug, sport_name_snapshot, sort_order
    ) values (
      p_template_id, 'manual', 'Forbidden session', 0, 'strength', 'Strength', 99
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'Cross-owner Phase 2 mutation unexpectedly succeeded.';
end
$assert$;

grant execute on function pg_temp.assert_intruder_insert_denied(uuid) to authenticated;

create function pg_temp.assert_invalid_shape_denied(p_phase_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_activities(
      plan_phase_id, catalog_source, activity_name_snapshot,
      metric_schema_snapshot, planned_prescription, sort_order
    ) values (
      p_phase_id, 'manual', 'Invalid JSON', '[]'::jsonb, '[]'::jsonb, 99
    );
  exception when check_violation then
    return;
  end;
  raise exception 'Malformed metric schema or planned prescription unexpectedly succeeded.';
end
$assert$;

grant execute on function pg_temp.assert_invalid_shape_denied(uuid) to authenticated;

create function pg_temp.assert_invalid_bounds_denied(p_template_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    insert into public.user_workout_plan_sessions(
      week_template_id, source, title, day_offset, sport_slug, sport_name_snapshot, sort_order
    ) values (
      p_template_id, 'manual', 'Invalid offset', 7, 'strength', 'Strength', 100
    );
  exception when check_violation then
    return;
  end;
  raise exception 'Invalid session day offset unexpectedly succeeded.';
end
$assert$;

grant execute on function pg_temp.assert_invalid_bounds_denied(uuid) to authenticated;

create function pg_temp.assert_detach_failure(p_owner_id uuid, p_plan_week_id uuid)
returns void
language plpgsql
as $assert$
begin
  begin
    perform public.detach_workout_plan_week_atomic(p_owner_id, p_plan_week_id);
  exception when others then
    if sqlerrm like '%controlled descendant clone failure%' then
      return;
    end if;
    raise;
  end;
  raise exception 'Controlled detach failure unexpectedly succeeded.';
end
$assert$;

grant execute on function pg_temp.assert_detach_failure(uuid, uuid) to authenticated;

-- Auth fixtures create corresponding public.profile rows through the production trigger.
\set admin_id '34000000-0000-4000-8000-000000000004'
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'owner_id'::uuid, 'authenticated', 'authenticated', 'phase2a-owner@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'intruder_id'::uuid, 'authenticated', 'authenticated', 'phase2a-intruder@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'deletion_id'::uuid, 'authenticated', 'authenticated', 'phase2a-deletion@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_id'::uuid, 'authenticated', 'authenticated', 'phase2a-admin@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = :'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select (public.create_workout_plan_atomic(
  :'owner_id'::uuid,
  '{"name":"Phase 2A shared program","source":"manual","program_duration_weeks":2,"days":[{"day_name":"Legacy day","weekday":"Monday","exercises":[{"exercise_name":"Legacy squat","sets":3,"reps":"8","rest_seconds":90}]}]}'::jsonb,
  false,
  date '2026-07-15'
))->>'id' as owner_plan_id
\gset

insert into public.user_workout_plan_week_templates (
  plan_id, name, description, sort_order, source
) values (
  :'owner_plan_id'::uuid, 'Shared week', 'Reusable structure', 1, 'manual'
) returning id as original_template_id
\gset

insert into public.user_workout_plan_weeks (
  plan_id, week_template_id, week_number
) values (
  :'owner_plan_id'::uuid, :'original_template_id'::uuid, 1
) returning id as selected_week_id
\gset

insert into public.user_workout_plan_weeks (
  plan_id, week_template_id, week_number
) values (
  :'owner_plan_id'::uuid, :'original_template_id'::uuid, 2
) returning id as shared_week_id
\gset

insert into public.user_workout_plan_sessions (
  week_template_id, source, title, day_offset, weekday,
  sport_slug, sport_name_snapshot, session_type_slug,
  session_type_name_snapshot, duration_minutes, sort_order, notes
) values (
  :'original_template_id'::uuid, 'manual', 'Run intervals', 2, 'Tuesday',
  'running', 'Running', 'interval_training', 'Interval training', 45, 1, 'Session snapshot'
) returning id as original_session_id
\gset

insert into public.user_workout_plan_phases (
  plan_session_id, phase_slug, phase_name_snapshot, is_optional, sort_order, notes
) values (
  :'original_session_id'::uuid, 'intervals', 'Intervals', false, 1, 'Phase snapshot'
) returning id as original_phase_id
\gset

insert into public.user_workout_plan_activities (
  plan_phase_id, catalog_activity_id, catalog_slug, catalog_version, catalog_source,
  activity_name_snapshot, short_description_snapshot, activity_type_slug,
  activity_type_name_snapshot, instructions_snapshot, metric_schema_snapshot,
  planned_prescription, equipment_snapshot, taxonomy_snapshot, sort_order, notes
) values (
  :'original_phase_id'::uuid, 'catalog-activity-1', 'run-400m', '3', 'external',
  '400 metre repeat', 'Controlled interval repeat', 'running_interval',
  'Running interval', '[{"order":1,"text":"Run with controlled form."}]'::jsonb,
  '{"slug":"running_interval_v1","fields":[{"key":"repeats","label":"Repeats","type":"integer","required":true}]}'::jsonb,
  '{"repeats":6}'::jsonb,
  '[{"slug":"track","name":"Track","isRequired":false}]'::jsonb,
  '{"sport":"running","phase":"intervals"}'::jsonb,
  1, 'Preserve this snapshot'
) returning id as original_activity_id
\gset

select pg_temp.assert_invalid_shape_denied(:'original_phase_id'::uuid);
select pg_temp.assert_invalid_bounds_denied(:'original_template_id'::uuid);

select public.detach_workout_plan_week_atomic(:'owner_id'::uuid, :'selected_week_id'::uuid) as detach_result
\gset

select (:'detach_result'::jsonb->>'detached_template_id') as detached_template_id,
       (:'detach_result'::jsonb->>'original_template_id') as returned_original_template_id,
       (:'detach_result'::jsonb->>'clone_created') as clone_created
\gset

select pg_temp.assert_true(:'clone_created' = 'true', 'Detach did not report a new clone.');
select pg_temp.assert_true(
  :'returned_original_template_id'::uuid = :'original_template_id'::uuid,
  'Detach returned the wrong original template.'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.user_workout_plan_weeks week
    where week.id = :'selected_week_id'::uuid
      and week.week_template_id = :'detached_template_id'::uuid
      and week.is_detached
  ),
  'Selected assigned week was not detached.'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.user_workout_plan_weeks week
    where week.id = :'shared_week_id'::uuid
      and week.week_template_id = :'original_template_id'::uuid
      and not week.is_detached
  ),
  'Detach modified a different assigned week.'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.user_workout_plan_week_templates template
    where template.id = :'detached_template_id'::uuid
      and template.derived_from_template_id = :'original_template_id'::uuid
  ),
  'Detached template provenance is missing.'
);
select pg_temp.assert_true(
  (select count(*) from public.user_workout_plan_sessions where week_template_id = :'detached_template_id'::uuid) = 1
  and (select count(*) from public.user_workout_plan_phases phase join public.user_workout_plan_sessions session on session.id = phase.plan_session_id where session.week_template_id = :'detached_template_id'::uuid) = 1
  and (select count(*) from public.user_workout_plan_activities activity join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id join public.user_workout_plan_sessions session on session.id = phase.plan_session_id where session.week_template_id = :'detached_template_id'::uuid) = 1,
  'Detach did not clone the complete active hierarchy.'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.user_workout_plan_activities cloned
    join public.user_workout_plan_phases phase on phase.id = cloned.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    where session.week_template_id = :'detached_template_id'::uuid
      and cloned.catalog_activity_id = 'catalog-activity-1'
      and cloned.metric_schema_snapshot->>'slug' = 'running_interval_v1'
      and cloned.planned_prescription = '{"repeats":6}'::jsonb
      and cloned.notes = 'Preserve this snapshot'
      and cloned.source_legacy_plan_exercise_id is null
  ),
  'Detach did not preserve activity snapshots or clear duplicate legacy identity.'
);

select public.detach_workout_plan_week_atomic(:'owner_id'::uuid, :'selected_week_id'::uuid) as second_detach_result
\gset

select pg_temp.assert_true(
  :'second_detach_result'::jsonb->>'clone_created' = 'false'
  and (:'second_detach_result'::jsonb->>'detached_template_id')::uuid = :'detached_template_id'::uuid
  and (:'second_detach_result'::jsonb->>'original_template_id')::uuid = :'original_template_id'::uuid,
  'Detach RPC is not idempotent.'
);

-- A second owner plan proves the composite same-plan reference invariant.
select (public.create_workout_plan_atomic(
  :'owner_id'::uuid,
  '{"name":"Other owner plan","source":"manual","days":[{"day_name":"Other day","exercises":[{"exercise_name":"Carry","sets":2,"reps":"30 sec"}]}]}'::jsonb,
  false,
  date '2026-07-15'
))->>'id' as other_plan_id
\gset

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'other_plan_id'::uuid, 'Other template', 1, 'manual')
returning id as other_template_id
\gset

select day.id as owner_legacy_day_id, exercise.id as owner_legacy_exercise_id
from public.user_workout_plan_days day
join public.user_workout_plan_exercises exercise on exercise.plan_day_id = day.id
where day.plan_id = :'owner_plan_id'::uuid
order by day.day_number, exercise.sort_order
limit 1
\gset

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'owner_plan_id'::uuid, 'Legacy integrity template', 2, 'manual')
returning id as integrity_template_id
\gset

insert into public.user_workout_plan_sessions(
  week_template_id, source_legacy_plan_day_id, source, title, day_offset,
  sport_slug, sport_name_snapshot, sort_order
) values (
  :'integrity_template_id'::uuid, :'owner_legacy_day_id'::uuid, 'legacy_backfill',
  'Valid legacy session mapping', 0, null, 'Legacy training', 1
) returning id as integrity_session_id
\gset

insert into public.user_workout_plan_phases(
  plan_session_id, phase_slug, phase_name_snapshot, sort_order
) values (
  :'integrity_session_id'::uuid, 'main_work', 'Main work', 1
) returning id as integrity_phase_id
\gset

insert into public.user_workout_plan_activities(
  plan_phase_id, source_legacy_plan_exercise_id, catalog_source,
  activity_name_snapshot, planned_prescription, sort_order
) values (
  :'integrity_phase_id'::uuid, :'owner_legacy_exercise_id'::uuid, 'legacy',
  'Valid legacy activity mapping', '{}'::jsonb, 1
);

insert into public.user_workout_plan_sessions(
  week_template_id, source, title, day_offset, sport_slug, sport_name_snapshot, sort_order
) values (
  :'other_template_id'::uuid, 'manual', 'Other plan integrity session',
  0, 'strength', 'Strength', 1
) returning id as other_integrity_session_id
\gset

insert into public.user_workout_plan_phases(
  plan_session_id, phase_slug, phase_name_snapshot, sort_order
) values (
  :'other_integrity_session_id'::uuid, 'main_work', 'Main work', 1
) returning id as other_integrity_phase_id
\gset

reset role;
select pg_temp.assert_same_plan_denied(:'owner_plan_id'::uuid, :'other_template_id'::uuid);
select pg_temp.assert_cross_plan_legacy_session_denied(
  :'other_template_id'::uuid,
  :'owner_legacy_day_id'::uuid
);
select pg_temp.assert_cross_plan_legacy_activity_denied(
  :'other_integrity_phase_id'::uuid,
  :'owner_legacy_exercise_id'::uuid
);

-- Another member cannot read, mutate, or detach the owner graph.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'intruder_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as intruder_visible_count
from public.user_workout_plan_week_templates
where id = :'original_template_id'::uuid
\gset
select pg_temp.assert_intruder_insert_denied(:'original_template_id'::uuid);
select pg_temp.assert_intruder_detach_denied(:'owner_id'::uuid, :'shared_week_id'::uuid);
reset role;
select pg_temp.assert_true(:'intruder_visible_count'::integer = 0, 'RLS exposed another member''s week template.');

-- Existing admin policy remains able to inspect member-owned program rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select count(*) as admin_visible_count
from public.user_workout_plan_week_templates
where id = :'original_template_id'::uuid
\gset
reset role;
select pg_temp.assert_true(:'admin_visible_count'::integer = 1, 'Existing admin access policy was not preserved.');

-- Rollback proof: a controlled descendant-clone failure must leave no clone.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'owner_plan_id'::uuid, 'Rollback template', 2, 'manual')
returning id as rollback_template_id
\gset

insert into public.user_workout_plan_weeks(plan_id, week_template_id, week_number)
values (:'owner_plan_id'::uuid, :'rollback_template_id'::uuid, 3)
returning id as rollback_week_id
\gset

insert into public.user_workout_plan_sessions(
  week_template_id, source, title, day_offset, sport_slug, sport_name_snapshot, sort_order
) values (
  :'rollback_template_id'::uuid, 'manual', 'Rollback session', 0, 'strength', 'Strength', 1
) returning id as rollback_session_id
\gset

insert into public.user_workout_plan_phases(plan_session_id, phase_slug, phase_name_snapshot, sort_order)
values (:'rollback_session_id'::uuid, 'main_work', 'Main work', 1)
returning id as rollback_phase_id
\gset

insert into public.user_workout_plan_activities(
  plan_phase_id, catalog_source, activity_name_snapshot, planned_prescription, sort_order
) values (
  :'rollback_phase_id'::uuid, 'manual', 'ROLLBACK_SENTINEL', '{}'::jsonb, 1
);

reset role;
create function pg_temp.fail_phase2a_clone()
returns trigger
language plpgsql
as $function$
begin
  if new.activity_name_snapshot = 'ROLLBACK_SENTINEL'
     and new.source_legacy_plan_exercise_id is null then
    raise exception 'controlled descendant clone failure';
  end if;
  return new;
end
$function$;

create trigger zz_phase2a_clone_failure
before insert on public.user_workout_plan_activities
for each row execute function pg_temp.fail_phase2a_clone();

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_detach_failure(:'owner_id'::uuid, :'rollback_week_id'::uuid);
reset role;

select pg_temp.assert_true(
  exists (
    select 1 from public.user_workout_plan_weeks week
    where week.id = :'rollback_week_id'::uuid
      and week.week_template_id = :'rollback_template_id'::uuid
      and not week.is_detached
  ),
  'Failed detach changed the assigned week.'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.user_workout_plan_week_templates template
    where template.derived_from_template_id = :'rollback_template_id'::uuid
  ),
  'Failed detach left a partial cloned template.'
);

drop trigger zz_phase2a_clone_failure on public.user_workout_plan_activities;

-- Plan deletion cascades through the complete Phase 2 structure.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'deletion_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select (public.create_workout_plan_atomic(
  :'deletion_id'::uuid,
  '{"name":"Delete cascade plan","source":"manual","days":[{"day_name":"Delete day","exercises":[{"exercise_name":"Delete exercise","sets":1,"reps":"1"}]}]}'::jsonb,
  false,
  date '2026-07-15'
))->>'id' as delete_plan_id
\gset

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'delete_plan_id'::uuid, 'Delete template', 1, 'manual')
returning id as delete_template_id
\gset

insert into public.user_workout_plan_weeks(plan_id, week_template_id, week_number)
values (:'delete_plan_id'::uuid, :'delete_template_id'::uuid, 1);

select public.delete_workout_plan_atomic(
  :'deletion_id'::uuid,
  :'delete_plan_id'::uuid,
  true,
  date '2026-07-15'
);
reset role;

select pg_temp.assert_true(
  not exists (select 1 from public.user_workout_plan_week_templates where plan_id = :'delete_plan_id'::uuid)
  and not exists (select 1 from public.user_workout_plan_weeks where plan_id = :'delete_plan_id'::uuid),
  'Plan deletion did not cascade through Train Phase 2A rows.'
);

-- Account deletion cascades through auth.users -> profile -> plans -> Phase 2 rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'deletion_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select (public.create_workout_plan_atomic(
  :'deletion_id'::uuid,
  '{"name":"Account cascade plan","source":"manual","days":[{"day_name":"Account day","exercises":[{"exercise_name":"Account exercise","sets":1,"reps":"1"}]}]}'::jsonb,
  false,
  date '2026-07-15'
))->>'id' as account_plan_id
\gset

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
values (:'account_plan_id'::uuid, 'Account template', 1, 'manual');

reset role;
delete from auth.users where id = :'deletion_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.user_workout_plans where id = :'account_plan_id'::uuid)
  and not exists (select 1 from public.user_workout_plan_week_templates where plan_id = :'account_plan_id'::uuid),
  'Account deletion did not remove Train Phase 2A user data.'
);

rollback;
