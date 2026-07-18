begin;

do $preflight$
declare
  v_marker text;
  v_routine oid;
  v_definition text;
begin
  if to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.get_workout_replacement_candidate_eligibility(uuid,jsonb)') is null then
    raise exception 'The preceding Phase 3 forward corrections must be applied first.';
  end if;

  v_routine := to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)');
  if v_routine is null then
    raise exception 'Plan-day workout-session start RPC is missing.';
  end if;

  select lower(pg_get_functiondef(v_routine))
  into v_definition;

  if v_definition !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)' then
    raise exception 'Refusing to elevate the plan-day session-start RPC without its actor check.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before plan-session authority correction: %.', v_marker;
  end if;
end
$preflight$;

alter function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid)
  security definer set search_path = '';

revoke all on function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid)
  to authenticated, service_role;

do $postconditions$
declare
  v_marker text;
  v_routine oid := to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)');
begin
  if v_routine is null
     or not (select prosecdef from pg_proc where oid = v_routine)
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_routine), '') not like '%search_path=%' then
    raise exception 'Plan-day session-start RPC is missing or not hardened.';
  end if;

  if has_function_privilege('anon', v_routine, 'EXECUTE')
     or not has_function_privilege('authenticated', v_routine, 'EXECUTE')
     or not has_function_privilege('service_role', v_routine, 'EXECUTE') then
    raise exception 'Plan-day session-start RPC grants are incorrect.';
  end if;

  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid = v_routine
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute the plan-day session-start RPC.';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id = session.id
    where snapshot.id is null
  ) then
    raise exception 'A workout session is missing its Phase 3 snapshot.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.user_id <> session.user_id
  ) then
    raise exception 'A Phase 3 snapshot ownership mismatch exists.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker changed during plan-session authority correction.';
  end if;
end
$postconditions$;

commit;
