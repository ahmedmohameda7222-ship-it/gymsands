begin;

do $preflight$
declare
  v_marker text;
begin
  if to_regclass('public.exercise_logs') is null
     or to_regprocedure('private.workout_set_type(text,text)') is null then
    raise exception 'Structured workout set type must exist before refresh hardening.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before set-type refresh hardening: %.', v_marker;
  end if;
end
$preflight$;

create temporary table phase4c1_set_type_marker on commit drop as
select migration_version as marker
from public.release_schema_compatibility
where singleton;

create or replace function private.normalize_exercise_log_set_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.set_type is not distinct from old.set_type then
    -- Existing upsert authorities update notes but intentionally do not trust a
    -- client-owned structured value. Re-derive it whenever the note payload changes.
    new.set_type := private.workout_set_type(new.notes, null);
  else
    new.set_type := private.workout_set_type(new.notes, new.set_type);
  end if;
  return new;
end
$function$;

do $postconditions$
declare
  v_marker text;
  v_baseline text;
begin
  if pg_get_functiondef(to_regprocedure('private.normalize_exercise_log_set_type()'))
       !~* 'new\.set_type is not distinct from old\.set_type' then
    raise exception 'Set-type update refresh hardening is missing.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  select marker into strict v_baseline from phase4c1_set_type_marker;
  if v_marker is distinct from v_baseline then
    raise exception 'Compatibility marker changed during set-type refresh hardening.';
  end if;
end
$postconditions$;

commit;
