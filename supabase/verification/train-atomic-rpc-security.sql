-- Disposable-database security verification for the six canonical Train plan RPCs.
-- This script must run after a clean local migration reset. All fixtures and
-- test-only helpers are rolled back.

\set ON_ERROR_STOP on
\set owner_id '10000000-0000-4000-8000-000000000001'
\set intruder_id '20000000-0000-4000-8000-000000000002'

begin;

do $catalog$
declare
  signature text;
  routine_oid oid;
  is_definer boolean;
  settings text[];
begin
  foreach signature in array array[
    'public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)',
    'public.archive_workout_plan_atomic(uuid,uuid,text,date)',
    'public.create_workout_plan_atomic(uuid,jsonb,boolean,date)',
    'public.delete_workout_plan_atomic(uuid,uuid,boolean,date)',
    'public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)',
    'public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)'
  ] loop
    routine_oid := to_regprocedure(signature);
    if routine_oid is null then
      raise exception 'Missing canonical Train RPC: %', signature;
    end if;

    select prosecdef, proconfig
    into is_definer, settings
    from pg_proc
    where oid = routine_oid;

    if is_definer then
      raise exception 'Train RPC must remain SECURITY INVOKER: %', signature;
    end if;
    if coalesce(array_to_string(settings, ','), '') not like '%search_path=%' then
      raise exception 'Train RPC search_path is not hardened: %', signature;
    end if;
    if not has_function_privilege('authenticated', routine_oid, 'EXECUTE') then
      raise exception 'authenticated lacks EXECUTE on Train RPC: %', signature;
    end if;
    if not has_function_privilege('service_role', routine_oid, 'EXECUTE') then
      raise exception 'service_role lacks EXECUTE on Train RPC: %', signature;
    end if;
    if has_function_privilege('anon', routine_oid, 'EXECUTE') then
      raise exception 'anon can EXECUTE Train RPC: %', signature;
    end if;
    if exists (
      select 1
      from pg_proc granted_function
      cross join lateral aclexplode(coalesce(
        granted_function.proacl,
        acldefault('f', granted_function.proowner)
      )) grant_acl
      where granted_function.oid = routine_oid
        and grant_acl.grantee = 0
        and grant_acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can EXECUTE Train RPC: %', signature;
    end if;
  end loop;

  if exists (
    select 1
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
  ) then
    raise exception 'A legacy Train RPC overload without explicit local date remains.';
  end if;

  if exists (
    select 1
    from (values
      ('user_workout_plans'),
      ('user_workout_plan_days'),
      ('user_workout_plan_exercises'),
      ('user_workout_sessions')
    ) required(table_name)
    left join pg_class relation on relation.relname = required.table_name
      and relation.relnamespace = 'public'::regnamespace
    where relation.oid is null or relation.relrowsecurity is not true
  ) then
    raise exception 'A Train RPC member-data table is missing RLS.';
  end if;
end
$catalog$;

-- Auth fixtures create their corresponding public.profile rows through the
-- production on_auth_user_created trigger.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'owner_id'::uuid, 'authenticated', 'authenticated',
   'train-owner-security@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'intruder_id'::uuid, 'authenticated', 'authenticated',
   'train-intruder-security@example.invalid', '',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Owner success: create.
select (public.create_workout_plan_atomic(
  :'owner_id'::uuid,
  '{"name":"Owner security plan","source":"manual","days":[{"day_name":"Owner day","weekday":"Monday","exercises":[{"exercise_name":"Squat","sets":3,"reps":"8","rest_seconds":90}]}]}'::jsonb,
  false,
  date '2026-07-14'
))->>'id' as owner_plan_id
\gset

select id as owner_day_id
from public.user_workout_plan_days
where plan_id = :'owner_plan_id'::uuid
\gset

select id as owner_exercise_id
from public.user_workout_plan_exercises
where plan_day_id = :'owner_day_id'::uuid
\gset

-- Owner success: save one day.
select public.save_workout_plan_day_atomic(
  :'owner_id'::uuid,
  :'owner_day_id'::uuid,
  jsonb_build_object(
    'day_name', 'Owner day revised',
    'weekday', 'Monday',
    'exercises', jsonb_build_array(jsonb_build_object(
      'id', :'owner_exercise_id',
      'exercise_name', 'Back squat',
      'sets', 4,
      'reps', '6',
      'rest_seconds', 120
    ))
  ),
  date '2026-07-14',
  null,
  false
);

-- Owner success: save the complete plan graph.
select public.save_workout_plan_atomic(
  :'owner_id'::uuid,
  :'owner_plan_id'::uuid,
  jsonb_build_object(
    'name', 'Owner security plan revised',
    'source', 'manual',
    'days', jsonb_build_array(jsonb_build_object(
      'id', :'owner_day_id',
      'day_name', 'Owner day revised',
      'weekday', 'Monday',
      'exercises', jsonb_build_array(jsonb_build_object(
        'id', :'owner_exercise_id',
        'exercise_name', 'Back squat',
        'sets', 4,
        'reps', '6',
        'rest_seconds', 120
      ))
    ))
  ),
  date '2026-07-14',
  null
);

-- Owner success: activate.
select public.activate_workout_plan_atomic(
  :'owner_id'::uuid,
  :'owner_plan_id'::uuid,
  date '2026-07-14',
  null
);

-- Owner success: archive an inactive history-free plan.
select (public.create_workout_plan_atomic(
  :'owner_id'::uuid,
  '{"name":"Archive security plan","source":"manual","days":[{"day_name":"Archive day","exercises":[{"exercise_name":"Row","sets":3,"reps":"8","rest_seconds":75}]}]}'::jsonb,
  false,
  date '2026-07-14'
))->>'id' as archive_plan_id
\gset

select public.archive_workout_plan_atomic(
  :'owner_id'::uuid,
  :'archive_plan_id'::uuid,
  'Disposable security verification',
  date '2026-07-14'
);

-- Owner success: delete a separate inactive history-free plan.
select (public.create_workout_plan_atomic(
  :'owner_id'::uuid,
  '{"name":"Delete security plan","source":"manual","days":[{"day_name":"Delete day","exercises":[{"exercise_name":"Press","sets":3,"reps":"8","rest_seconds":75}]}]}'::jsonb,
  false,
  date '2026-07-14'
))->>'id' as delete_plan_id
\gset

select public.delete_workout_plan_atomic(
  :'owner_id'::uuid,
  :'delete_plan_id'::uuid,
  true,
  date '2026-07-14'
);

reset role;

create temporary table train_rpc_security_snapshot (
  state jsonb not null
) on commit drop;

insert into train_rpc_security_snapshot(state)
select jsonb_build_object(
  'plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plans row_value), '[]'::jsonb),
  'days', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plan_days row_value), '[]'::jsonb),
  'exercises', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plan_exercises row_value), '[]'::jsonb),
  'schedule', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_sessions row_value), '[]'::jsonb)
);

-- Test-only SECURITY INVOKER helper. Each call must fail with 42501 before the
-- target RPC performs a write.
create function pg_temp.assert_all_train_rpcs_denied(
  p_target_user_id uuid,
  p_plan_id uuid,
  p_day_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $denials$
begin
  begin
    perform public.activate_workout_plan_atomic(p_target_user_id, p_plan_id, date '2026-07-14', null);
    raise exception 'activate_workout_plan_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.archive_workout_plan_atomic(p_target_user_id, p_plan_id, 'Denied verification', date '2026-07-14');
    raise exception 'archive_workout_plan_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_workout_plan_atomic(p_target_user_id, '{}'::jsonb, false, date '2026-07-14');
    raise exception 'create_workout_plan_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_workout_plan_atomic(p_target_user_id, p_plan_id, true, date '2026-07-14');
    raise exception 'delete_workout_plan_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_workout_plan_atomic(p_target_user_id, p_plan_id, '{}'::jsonb, date '2026-07-14', null);
    raise exception 'save_workout_plan_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_workout_plan_day_atomic(p_target_user_id, p_day_id, '{}'::jsonb, date '2026-07-14', null, false);
    raise exception 'save_workout_plan_day_atomic unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end
$denials$;

revoke all on function pg_temp.assert_all_train_rpcs_denied(uuid,uuid,uuid) from public;
grant execute on function pg_temp.assert_all_train_rpcs_denied(uuid,uuid,uuid) to authenticated, anon;

-- Cross-user denial: the intruder attempts to act as the owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'intruder_id', true);
select pg_temp.assert_all_train_rpcs_denied(
  :'owner_id'::uuid, :'owner_plan_id'::uuid, :'owner_day_id'::uuid
);
reset role;

-- Impersonation denial: the owner attempts to submit another user id.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select pg_temp.assert_all_train_rpcs_denied(
  :'intruder_id'::uuid, :'owner_plan_id'::uuid, :'owner_day_id'::uuid
);
reset role;

-- Anonymous denial is verified at the function-grant boundary.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select pg_temp.assert_all_train_rpcs_denied(
  :'owner_id'::uuid, :'owner_plan_id'::uuid, :'owner_day_id'::uuid
);
reset role;

do $mutation_check$
declare
  before_state jsonb;
  after_state jsonb;
begin
  select state into before_state from train_rpc_security_snapshot;
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plans row_value), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plan_days row_value), '[]'::jsonb),
    'exercises', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_plan_exercises row_value), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(to_jsonb(row_value) order by id) from public.user_workout_sessions row_value), '[]'::jsonb)
  ) into after_state;

  if before_state is distinct from after_state then
    raise exception 'A denied Train RPC mutated member data.';
  end if;
end
$mutation_check$;

rollback;

\echo 'Train atomic RPC security verification passed: invoker mode, hardened search_path, least-privilege grants, owner success, denied cross-user/anon/impersonation calls, and zero mutation after denial.'
