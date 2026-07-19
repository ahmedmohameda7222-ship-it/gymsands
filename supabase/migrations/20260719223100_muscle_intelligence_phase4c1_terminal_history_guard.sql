begin;

do $preflight$
declare
  v_marker text;
begin
  if to_regclass('public.workout_sessions') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null then
    raise exception 'Workout history authority is missing.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before terminal history protection: %.', v_marker;
  end if;
end
$preflight$;

create temporary table phase4c1_terminal_history_marker on commit drop as
select migration_version as marker
from public.release_schema_compatibility
where singleton;

create or replace function private.enforce_terminal_workout_session_delete()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status = 'started' then
    return old;
  end if;

  -- The reviewed account purge runs as its trusted SECURITY DEFINER owner. Ordinary
  -- authenticated members must not erase completed analysis by deleting its parent.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return old;
  end if;

  raise exception 'Completed workout sessions are immutable. Delete the account through the privacy workflow instead.'
    using errcode = '23514';
end
$function$;

revoke all on function private.enforce_terminal_workout_session_delete()
  from public, anon, authenticated;

drop trigger if exists workout_sessions_terminal_delete_guard on public.workout_sessions;
create trigger workout_sessions_terminal_delete_guard
before delete on public.workout_sessions
for each row execute function private.enforce_terminal_workout_session_delete();

do $postconditions$
declare
  v_marker text;
  v_baseline text;
begin
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  select marker into strict v_baseline from phase4c1_terminal_history_marker;
  if v_marker is distinct from v_baseline then
    raise exception 'Compatibility marker changed while protecting terminal history.';
  end if;
  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where not trigger_row.tgisinternal
      and schema_row.nspname = 'public'
      and table_row.relname = 'workout_sessions'
      and trigger_row.tgname = 'workout_sessions_terminal_delete_guard'
  ) then
    raise exception 'Terminal workout-session deletion guard is missing.';
  end if;
end
$postconditions$;

commit;
