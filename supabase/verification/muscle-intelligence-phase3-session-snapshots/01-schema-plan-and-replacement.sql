do $schema$
declare
  table_name text;
  privilege_name text;
  routine_oid oid;
begin
  foreach table_name in array array[
    'workout_session_muscle_snapshots',
    'workout_session_muscle_snapshot_items'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing Phase 3 table: %', table_name;
    end if;
    if not exists (select 1 from pg_class where oid = ('public.' || table_name)::regclass and relrowsecurity) then
      raise exception 'RLS is not enabled on Phase 3 table: %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has Phase 3 table access: %', table_name;
    end if;
    if has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      raise exception 'Member has authoritative Phase 3 table mutation access: %', table_name;
    end if;
  end loop;

  foreach table_name in array array[
    'user_workout_plans',
    'user_workout_plan_days',
    'user_workout_plan_exercises'
  ] loop
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', 'public.' || table_name, privilege_name) then
        raise exception 'Authenticated retains direct canonical plan-table privilege: %.%', table_name, privilege_name;
      end if;
    end loop;
  end loop;

  foreach routine_oid in array array[
    to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)'),
    to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'),
    to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'),
    to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)'),
    to_regprocedure('public.get_workout_session_frozen_global_mappings(uuid,uuid)'),
    to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)'),
    to_regprocedure('public.get_workout_replacement_candidate_eligibility(uuid,jsonb)'),
    to_regprocedure('public.publish_user_custom_exercise_mapping_set(uuid)')
  ] loop
    if routine_oid is null or not (select prosecdef from pg_proc where oid = routine_oid) then
      raise exception 'Required authenticated domain RPC is missing or is not SECURITY DEFINER: %', routine_oid;
    end if;
    if not coalesce((
      select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""'
      from pg_proc where oid = routine_oid
    ), false) then
      raise exception 'Authenticated domain RPC search_path is not exactly hardened: %', routine_oid;
    end if;
    if has_function_privilege('anon', routine_oid, 'EXECUTE')
       or not has_function_privilege('authenticated', routine_oid, 'EXECUTE')
       or not has_function_privilege('service_role', routine_oid, 'EXECUTE') then
      raise exception 'Authenticated domain RPC grants are incorrect: %', routine_oid;
    end if;
    if exists (
      select 1
      from pg_proc routine
      cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
      where routine.oid = routine_oid
        and grant_acl.grantee = 0
        and grant_acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can execute reviewed Phase 3 RPC: %', routine_oid;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in ('workout_session_muscle_snapshots', 'workout_session_muscle_snapshot_items')
      and column_info.column_name in (
        'health', 'health_data', 'health_profile',
        'profile', 'profile_data',
        'conversation', 'conversation_data', 'conversation_history'
      )
  ) then
    raise exception 'Phase 3 snapshot schema contains prohibited health/profile/conversation data.';
  end if;
end
$schema$;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;

create function pg_temp.assert_upsert_failure(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb,
  p_expected_sqlstate text,
  p_message text
)
returns void language plpgsql as $assert$
begin
  begin
    perform public.upsert_workout_set_logs_atomic(p_user_id, p_session_id, p_logs);
  exception when others then
    if sqlstate = p_expected_sqlstate then return; end if;
    raise exception '% Expected SQLSTATE %, received %: %', p_message, p_expected_sqlstate, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$assert$;

create function pg_temp.assert_completion_failure(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb,
  p_duration_minutes integer,
  p_expected_sqlstate text,
  p_message text
)
returns void language plpgsql as $assert$
begin
  begin
    perform public.complete_workout_session_atomic(
      p_user_id, p_session_id, p_logs, p_duration_minutes, null
    );
  exception when others then
    if sqlstate = p_expected_sqlstate then return; end if;
    raise exception '% Expected SQLSTATE %, received %: %', p_message, p_expected_sqlstate, sqlstate, sqlerrm;
  end;
  raise exception '%', p_message;
end
$assert$;


create function pg_temp.assert_snapshot_item_update_denied(p_item_id uuid)
returns void language plpgsql as $assert$
begin
  if not exists (
    select 1
    from public.workout_session_muscle_snapshot_items
    where id = p_item_id
  ) then
    raise exception 'Snapshot item immutability test target is missing.';
  end if;

  perform set_config(
    'plaivra.session_snapshot_mutation_id',
    '',
    true
  );

  begin
    update public.workout_session_muscle_snapshot_items
    set state = case
      when state = 'completed' then 'adjusted'
      else 'completed'
    end
    where id = p_item_id;
  exception when check_violation then
    return;
  end;

  raise exception 'Frozen snapshot item update unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_snapshot_update_denied(p_snapshot_id uuid)
returns void language plpgsql as $assert$
begin
  if not exists (
    select 1
    from public.workout_session_muscle_snapshots
    where id = p_snapshot_id
  ) then
    raise exception 'Snapshot immutability test target is missing.';
  end if;

  perform set_config(
    'plaivra.session_snapshot_mutation_id',
    '',
    true
  );

  begin
    update public.workout_session_muscle_snapshots
    set frozen_at = frozen_at + interval '1 microsecond'
    where id = p_snapshot_id;
  exception when check_violation then
    return;
  end;

  raise exception 'Frozen snapshot update unexpectedly succeeded.';
end
$assert$;






create function pg_temp.assert_plan_delete_denied(p_plan_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    delete from public.user_workout_plans where id = p_plan_id;
  exception when check_violation or foreign_key_violation then return;
  end;
  raise exception 'Plan delete unexpectedly erased performed history.';
end
$assert$;

create function pg_temp.assert_cross_owner_replacement_denied(
  p_other_user_id uuid, p_session_id uuid, p_plan_exercise_id uuid
)
returns void language plpgsql as $assert$
begin
  begin
    perform public.replace_workout_session_snapshot_item_atomic(
      p_other_user_id, p_session_id, p_plan_exercise_id,
      'global_exercise', '1ee4a77a-0f7a-5fad-b281-52a191a2a685', null
    );
  exception when insufficient_privilege then return;
  end;
  raise exception 'Cross-owner replacement unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_name_only_replacement_denied(
  p_user_id uuid, p_session_id uuid, p_plan_exercise_id uuid
)
returns void language plpgsql as $assert$
begin
  begin
    perform public.replace_workout_session_snapshot_item_atomic(
      p_user_id, p_session_id, p_plan_exercise_id, 'global_exercise', 'Bench Press', null
    );
  exception when invalid_parameter_value then return;
  end;
  raise exception 'Name-only replacement unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_raw_direct_insert_denied(p_user_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.workout_sessions(user_id, workout_id, workout_name, status, source)
    values (p_user_id, null, 'Untrusted name-only direct session', 'started', 'manual');
  exception when check_violation then return;
  end;
  raise exception 'Direct raw insert unexpectedly bypassed the authoritative start operation.';
end
$assert$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated;
grant execute on function pg_temp.assert_upsert_failure(uuid, uuid, jsonb, text, text) to anon, authenticated;
grant execute on function pg_temp.assert_completion_failure(uuid, uuid, jsonb, integer, text, text) to anon, authenticated;
grant execute on function pg_temp.assert_cross_owner_replacement_denied(uuid, uuid, uuid) to authenticated;
grant execute on function pg_temp.assert_name_only_replacement_denied(uuid, uuid, uuid) to authenticated;
grant execute on function pg_temp.assert_raw_direct_insert_denied(uuid) to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  :'member_id'::uuid, 'authenticated', 'authenticated', 'phase3@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
), (
  :'other_member_id'::uuid, 'authenticated', 'authenticated', 'phase3-other@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.user_workout_plans(user_id, name, is_active, is_default, archived_at)
values (:'member_id'::uuid, 'Phase 3 verification plan', true, true, null)
returning id as plan_id \gset
select pg_temp.assert_true(
  (select is_active and is_default and archived_at is null
   from public.user_workout_plans where id = :'plan_id'::uuid),
  'Phase 3 active plan fixture violates active/default/archive invariants.'
);

insert into public.user_workout_plan_days(plan_id, day_number, day_name)
values (:'plan_id'::uuid, 1, 'Snapshot day')
returning id as plan_day_id \gset
insert into public.user_workout_plan_exercises(
  plan_day_id, source_workout_id, exercise_name, sets, reps, rest_seconds, sort_order
) values (
  :'plan_day_id'::uuid, '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b',
  'Frozen display name', 3, '8', 90, 1
) returning id as plan_exercise_id \gset
insert into public.user_workout_sessions(
  user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
  session_number, scheduled_date, day_title, status
) values (
  :'member_id'::uuid, :'plan_id'::uuid, :'plan_day_id'::uuid, 1, 1,
  1, current_date, 'Snapshot day', 'scheduled'
) returning id as scheduled_session_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select (public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid, :'plan_day_id'::uuid, :'scheduled_session_id'::uuid
)->'session'->>'id') as session_id \gset
select public.start_or_resume_workout_session_atomic(
  :'member_id'::uuid, :'plan_day_id'::uuid, :'scheduled_session_id'::uuid
);

select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshots where workout_session_id = :'session_id'::uuid) = 1,
  'Start/resume did not preserve exactly one snapshot.'
);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshot_items item
   join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
   where snapshot.workout_session_id = :'session_id'::uuid) = 1,
  'Start/resume did not preserve exactly one item set.'
);
select pg_temp.assert_true(
  (select status = 'started' from public.user_workout_sessions where id = :'scheduled_session_id'::uuid),
  'Plan-session start did not transition the linked scheduled session exactly once.'
);

select id as snapshot_id from public.workout_session_muscle_snapshots where workout_session_id = :'session_id'::uuid \gset
select id as snapshot_item_id from public.workout_session_muscle_snapshot_items where snapshot_id = :'snapshot_id'::uuid \gset

select set_config('request.jwt.claim.sub', :'other_member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshots where id = :'snapshot_id'::uuid) = 0,
  'Cross-owner snapshot read unexpectedly succeeded.'
);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshot_items where id = :'snapshot_item_id'::uuid) = 0,
  'Cross-owner snapshot item read unexpectedly succeeded.'
);
select pg_temp.assert_cross_owner_replacement_denied(:'member_id'::uuid, :'session_id'::uuid, :'plan_exercise_id'::uuid);

select set_config('request.jwt.claim.sub', :'member_id', true);
select pg_temp.assert_true(
  (select count(*) from public.workout_session_muscle_snapshot_items item
   join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
   where snapshot.workout_session_id = :'session_id'::uuid
     and item.source_plan_exercise_id = :'plan_exercise_id'::uuid
     and item.planned_global_exercise_id = '3eab8f04-2b5f-5c5e-9fed-41c63b90d45b'
     and item.planned_mapping_set_id is not null
     and item.planned_mapping_checksum ~ '^[0-9a-f]{64}$') = 1,
  'Session start did not freeze exact planned identity and mapping.'
);

select pg_temp.assert_name_only_replacement_denied(:'member_id'::uuid, :'session_id'::uuid, :'plan_exercise_id'::uuid);
select public.replace_workout_session_snapshot_item_atomic(
  :'member_id'::uuid,
  :'session_id'::uuid,
  :'plan_exercise_id'::uuid,
  'global_exercise',
  '1ee4a77a-0f7a-5fad-b281-52a191a2a685',
  null
);
select actual_mapping_set_id as frozen_actual_mapping_id,
       actual_mapping_checksum as frozen_actual_mapping_checksum
from public.workout_session_muscle_snapshot_items
where snapshot_id = :'snapshot_id'::uuid \gset
