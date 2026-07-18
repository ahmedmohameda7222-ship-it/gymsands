begin;

do $preflight$
declare
  v_marker text;
  v_start oid := to_regprocedure('public.start_or_resume_workout_session_atomic(uuid,uuid,uuid)');
  v_upsert oid := to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)');
  v_complete oid := to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)');
  v_upsert_definition text;
  v_complete_definition text;
  v_upsert_owner oid;
  v_complete_owner oid;
  v_upsert_owner_name text;
  v_complete_owner_name text;
begin
  if to_regprocedure('private.phase3_refresh_snapshot_completeness(uuid,text)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)') is null
     or to_regprocedure('public.get_workout_session_frozen_global_mappings(uuid,uuid)') is null
     or to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.get_workout_replacement_candidate_eligibility(uuid,jsonb)') is null then
    raise exception 'The preceding Phase 3 forward corrections must be applied first.';
  end if;

  if v_start is null
     or not (select prosecdef from pg_proc where oid = v_start)
     or not coalesce((
       select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""'
       from pg_proc where oid = v_start
     ), false) then
    raise exception 'Plan-day session-start authority correction is missing or drifted.';
  end if;

  if v_upsert is null or v_complete is null then
    raise exception 'The reviewed workout set-log or completion RPC is missing.';
  end if;

  select lower(pg_get_functiondef(v_upsert)), proowner, pg_get_userbyid(proowner)
  into v_upsert_definition, v_upsert_owner, v_upsert_owner_name
  from pg_proc
  where oid = v_upsert;

  select lower(pg_get_functiondef(v_complete)), proowner, pg_get_userbyid(proowner)
  into v_complete_definition, v_complete_owner, v_complete_owner_name
  from pg_proc
  where oid = v_complete;

  if (select prosecdef from pg_proc where oid = v_upsert)
     or (select prosecdef from pg_proc where oid = v_complete) then
    raise exception 'Set-log/completion authority correction appears partially applied.';
  end if;

  if not coalesce((
       select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""'
       from pg_proc where oid = v_upsert
     ), false)
     or not coalesce((
       select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""'
       from pg_proc where oid = v_complete
     ), false) then
    raise exception 'Reviewed session persistence RPC search_path drifted before elevation.';
  end if;

  if v_upsert_owner_name not in ('postgres', 'supabase_admin')
     or v_complete_owner_name not in ('postgres', 'supabase_admin') then
    raise exception 'Refusing to elevate a session persistence RPC owned by an untrusted role: %, %.',
      v_upsert_owner_name, v_complete_owner_name;
  end if;

  if v_upsert_definition !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)'
     or v_complete_definition !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)' then
    raise exception 'Refusing to elevate a session persistence RPC without its direct actor check.';
  end if;

  if v_upsert_definition !~ 'where\s+id\s*=\s*p_session_id\s+and\s+user_id\s*=\s*p_user_id'
     or v_complete_definition !~ 'where\s+id\s*=\s*p_session_id\s+and\s+user_id\s*=\s*p_user_id' then
    raise exception 'Reviewed session persistence ownership predicates drifted.';
  end if;

  if v_upsert_definition !~ 'e\.id\s*=\s*v_plan_exercise_id\s+and\s+e\.plan_day_id\s*=\s*v_session\.plan_day_id' then
    raise exception 'Set-log stable plan-exercise validation drifted.';
  end if;

  if v_complete_definition !~ 'public\.upsert_workout_set_logs_atomic\s*\(\s*p_user_id\s*,\s*p_session_id\s*,\s*p_logs\s*\)' then
    raise exception 'Completion no longer delegates to the authoritative set-log routine.';
  end if;

  if v_complete_definition !~ 'v_schedule\.user_workout_plan_id\s+is\s+distinct\s+from\s+v_session\.plan_id'
     or v_complete_definition !~ 'v_schedule\.plan_day_id\s+is\s+distinct\s+from\s+v_session\.plan_day_id'
     or v_complete_definition !~ 'where\s+id\s*=\s*v_session\.scheduled_session_id\s+and\s+user_id\s*=\s*p_user_id\s+and\s+status\s+in\s*\(\s*''scheduled''\s*,\s*''started''\s*\)' then
    raise exception 'Completion scheduled-session ownership or atomic transition predicates drifted.';
  end if;

  if has_function_privilege('anon', v_upsert, 'EXECUTE')
     or has_function_privilege('anon', v_complete, 'EXECUTE')
     or not has_function_privilege('authenticated', v_upsert, 'EXECUTE')
     or not has_function_privilege('authenticated', v_complete, 'EXECUTE')
     or not has_function_privilege('service_role', v_upsert, 'EXECUTE')
     or not has_function_privilege('service_role', v_complete, 'EXECUTE') then
    raise exception 'Reviewed session persistence RPC ACL drifted before elevation.';
  end if;

  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid in (v_upsert, v_complete)
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly has session persistence RPC execute authority.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before set-log/completion authority correction: %.', v_marker;
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id = session.id
    where snapshot.id is null
  ) then
    raise exception 'A workout session is missing its Phase 3 snapshot before authority correction.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.user_id <> session.user_id
  ) then
    raise exception 'A Phase 3 snapshot ownership mismatch exists before authority correction.';
  end if;

  if exists (
    select snapshot.workout_session_id
    from public.workout_session_muscle_snapshots snapshot
    group by snapshot.workout_session_id
    having count(*) <> 1
  ) then
    raise exception 'A duplicate Phase 3 snapshot envelope exists before authority correction.';
  end if;

  create temporary table phase3_set_log_completion_authority_baseline
  on commit drop
  as
  select
    v_marker as marker,
    v_upsert_owner as upsert_owner,
    v_complete_owner as complete_owner,
    (select count(*) from public.workout_sessions) as session_count,
    (select md5(coalesce(string_agg(md5(to_jsonb(session_row)::text), '' order by session_row.id), ''))
       from public.workout_sessions session_row) as session_hash,
    (select count(*) from public.workout_session_muscle_snapshots) as snapshot_count,
    (select md5(coalesce(string_agg(md5(to_jsonb(snapshot_row)::text), '' order by snapshot_row.id), ''))
       from public.workout_session_muscle_snapshots snapshot_row) as snapshot_hash,
    (select count(*) from public.workout_session_muscle_snapshot_items) as item_count,
    (select md5(coalesce(string_agg(md5(to_jsonb(item_row)::text), '' order by item_row.id), ''))
       from public.workout_session_muscle_snapshot_items item_row) as item_hash;
end
$preflight$;

alter function public.upsert_workout_set_logs_atomic(uuid, uuid, jsonb)
  security definer
  set search_path = '';

alter function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text)
  security definer
  set search_path = '';

revoke all on function public.upsert_workout_set_logs_atomic(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text)
  from public, anon, authenticated, service_role;

grant execute on function public.upsert_workout_set_logs_atomic(uuid, uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text)
  to authenticated, service_role;

do $postconditions$
declare
  v_marker text;
  v_upsert oid := to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)');
  v_complete oid := to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)');
  v_routine oid;
  v_definition text;
  v_expected_owner oid;
  v_baseline phase3_set_log_completion_authority_baseline%rowtype;
begin
  select * into strict v_baseline
  from phase3_set_log_completion_authority_baseline;

  foreach v_routine in array array[v_upsert, v_complete]
  loop
    if v_routine is null
       or not (select prosecdef from pg_proc where oid = v_routine)
       or not coalesce((
         select cardinality(proconfig) = 1 and proconfig[1] = 'search_path=""'
         from pg_proc where oid = v_routine
       ), false) then
      raise exception 'Session persistence RPC is missing or not hardened: %.', v_routine;
    end if;

    v_expected_owner := case when v_routine = v_upsert
      then v_baseline.upsert_owner else v_baseline.complete_owner end;
    if (select proowner from pg_proc where oid = v_routine) is distinct from v_expected_owner then
      raise exception 'Session persistence RPC owner changed during hardening: %.', v_routine;
    end if;

    select lower(pg_get_functiondef(v_routine)) into v_definition;
    if v_definition !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)' then
      raise exception 'Session persistence actor check changed during hardening: %.', v_routine;
    end if;

    if has_function_privilege('anon', v_routine, 'EXECUTE')
       or not has_function_privilege('authenticated', v_routine, 'EXECUTE')
       or not has_function_privilege('service_role', v_routine, 'EXECUTE') then
      raise exception 'Session persistence RPC grants are incorrect: %.', v_routine;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid in (v_upsert, v_complete)
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute a hardened session persistence RPC.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker is distinct from v_baseline.marker then
    raise exception 'Compatibility marker changed during set-log/completion authority correction.';
  end if;

  if (select count(*) from public.workout_sessions) is distinct from v_baseline.session_count
     or (select md5(coalesce(string_agg(md5(to_jsonb(session_row)::text), '' order by session_row.id), ''))
           from public.workout_sessions session_row) is distinct from v_baseline.session_hash
     or (select count(*) from public.workout_session_muscle_snapshots) is distinct from v_baseline.snapshot_count
     or (select md5(coalesce(string_agg(md5(to_jsonb(snapshot_row)::text), '' order by snapshot_row.id), ''))
           from public.workout_session_muscle_snapshots snapshot_row) is distinct from v_baseline.snapshot_hash
     or (select count(*) from public.workout_session_muscle_snapshot_items) is distinct from v_baseline.item_count
     or (select md5(coalesce(string_agg(md5(to_jsonb(item_row)::text), '' order by item_row.id), ''))
           from public.workout_session_muscle_snapshot_items item_row) is distinct from v_baseline.item_hash then
    raise exception 'Workout session or Phase 3 snapshot data changed during authority-only hardening.';
  end if;

  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id = session.id
    where snapshot.id is null
  ) then
    raise exception 'A workout session is missing its Phase 3 snapshot after authority correction.';
  end if;

  if exists (
    select 1
    from public.workout_session_muscle_snapshots snapshot
    join public.workout_sessions session on session.id = snapshot.workout_session_id
    where snapshot.user_id <> session.user_id
  ) then
    raise exception 'A Phase 3 snapshot ownership mismatch exists after authority correction.';
  end if;

  if exists (
    select snapshot.workout_session_id
    from public.workout_session_muscle_snapshots snapshot
    group by snapshot.workout_session_id
    having count(*) <> 1
  ) then
    raise exception 'A duplicate Phase 3 snapshot envelope exists after authority correction.';
  end if;
end
$postconditions$;

notify pgrst, 'reload schema';

commit;
