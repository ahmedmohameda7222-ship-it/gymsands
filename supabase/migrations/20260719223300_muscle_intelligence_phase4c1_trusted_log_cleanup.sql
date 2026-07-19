begin;

do $preflight$
declare
  v_marker text;
begin
  if to_regprocedure('private.enforce_terminal_exercise_log_immutability()') is null
     or to_regprocedure('public.purge_account_application_data_atomic(uuid)') is null then
    raise exception 'Terminal log guard and trusted privacy purge must exist first.';
  end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.purge_account_application_data_atomic(uuid)'))
     or (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure('public.purge_account_application_data_atomic(uuid)'))
          not in ('postgres', 'supabase_admin') then
    raise exception 'Account purge authority is not owned by a trusted SECURITY DEFINER role.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before terminal log cleanup hardening: %.', v_marker;
  end if;
end
$preflight$;

create temporary table phase4c1_trusted_log_marker on commit drop as
select migration_version as marker
from public.release_schema_compatibility
where singleton;

create or replace function private.enforce_terminal_exercise_log_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_old_status text;
  v_new_status text;
  v_old_session uuid := case when tg_op = 'INSERT' then null else old.workout_session_id end;
  v_new_session uuid := case when tg_op = 'DELETE' then null else new.workout_session_id end;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_old_session is not null then
    select session.status into v_old_status
    from public.workout_sessions session
    where session.id = v_old_session;
  end if;
  if v_new_session is not null then
    select session.status into v_new_status
    from public.workout_sessions session
    where session.id = v_new_session;
  end if;

  if v_old_session is not null and v_old_status is distinct from 'started' then
    raise exception 'Completed workout set logs are immutable.' using errcode = '23514';
  end if;
  if v_new_session is not null and v_new_status is distinct from 'started' then
    raise exception 'Completed workout set logs are immutable.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function private.enforce_terminal_exercise_log_immutability()
  from public, anon, authenticated;

do $postconditions$
declare
  v_guard oid := to_regprocedure('private.enforce_terminal_exercise_log_immutability()');
  v_marker text;
  v_baseline text;
begin
  if v_guard is null or (select prosecdef from pg_proc where oid = v_guard) then
    raise exception 'Terminal exercise-log guard must remain SECURITY INVOKER.';
  end if;
  if pg_get_functiondef(v_guard) !~* 'current_user in \(''postgres'', ''supabase_admin'', ''service_role''\)' then
    raise exception 'Trusted account-cleanup role allowance is missing.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  select marker into strict v_baseline from phase4c1_trusted_log_marker;
  if v_marker is distinct from v_baseline then
    raise exception 'Compatibility marker changed during terminal log cleanup hardening.';
  end if;
end
$postconditions$;

commit;
