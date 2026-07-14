begin;

-- SECURITY DEFINER changes current_user to the function owner. Preserve the
-- intended service-role path by consulting the verified Supabase JWT role as
-- well as current_user, while authenticated members must still match auth.uid().
create or replace function public.assert_workout_actor(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '23514';
  end if;
  if auth.uid() is null
     and current_user <> 'service_role'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Workout data belongs to another user.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_workout_actor(uuid) from public, anon;
grant execute on function public.assert_workout_actor(uuid) to authenticated, service_role;

-- The canonical Train plan RPCs are the narrow browser-write boundary. The
-- underlying plan tables are intentionally not granted directly to
-- authenticated members, so these routines must execute with their owner's
-- table privileges while continuing to reject any mismatched auth.uid().
do $ownership_contract$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'public.activate_workout_plan_atomic(uuid,uuid,date,timestamp with time zone)',
    'public.archive_workout_plan_atomic(uuid,uuid,text,date)',
    'public.create_workout_plan_atomic(uuid,jsonb,boolean,date)',
    'public.delete_workout_plan_atomic(uuid,uuid,boolean,date)',
    'public.save_workout_plan_atomic(uuid,uuid,jsonb,date,timestamp with time zone)',
    'public.save_workout_plan_day_atomic(uuid,uuid,jsonb,date,timestamp with time zone,boolean)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Missing canonical Train RPC: %', signature;
    end if;

    select lower(pg_get_functiondef(to_regprocedure(signature)))
    into definition;

    if definition !~ 'perform\s+public\.assert_workout_actor\s*\(\s*p_user_id\s*\)' then
      raise exception 'Refusing to elevate Train RPC without its actor check: %', signature;
    end if;
  end loop;
end
$ownership_contract$;

alter function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz)
  security definer set search_path = '';
alter function public.archive_workout_plan_atomic(uuid, uuid, text, date)
  security definer set search_path = '';
alter function public.create_workout_plan_atomic(uuid, jsonb, boolean, date)
  security definer set search_path = '';
alter function public.delete_workout_plan_atomic(uuid, uuid, boolean, date)
  security definer set search_path = '';
alter function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)
  security definer set search_path = '';
alter function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)
  security definer set search_path = '';

revoke all on function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.archive_workout_plan_atomic(uuid, uuid, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.create_workout_plan_atomic(uuid, jsonb, boolean, date)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_workout_plan_atomic(uuid, uuid, boolean, date)
  from public, anon, authenticated, service_role;
revoke all on function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz)
  to authenticated, service_role;
grant execute on function public.archive_workout_plan_atomic(uuid, uuid, text, date)
  to authenticated, service_role;
grant execute on function public.create_workout_plan_atomic(uuid, jsonb, boolean, date)
  to authenticated, service_role;
grant execute on function public.delete_workout_plan_atomic(uuid, uuid, boolean, date)
  to authenticated, service_role;
grant execute on function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)
  to authenticated, service_role;
grant execute on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
