begin;

-- Verified workout-derived records are server-owned projections. A normal
-- authenticated browser must never be able to choose a derived value and call
-- the replacement authority directly, even when the source session belongs to
-- that member.
revoke all on function public.replace_workout_derived_records_atomic(
  uuid,uuid,smallint,text,jsonb
) from public,anon,authenticated;
grant execute on function public.replace_workout_derived_records_atomic(
  uuid,uuid,smallint,text,jsonb
) to service_role;

-- Keep the private implementation inaccessible to every API role. The public
-- wrapper remains the narrow service-role entry point used after an authenticated
-- server route has resolved the member identity.
revoke all on function private.replace_workout_derived_records_atomic(
  uuid,uuid,smallint,text,jsonb
) from public,anon,authenticated,service_role;

do $verified_record_authority_postflight$
begin
  if has_function_privilege(
    'authenticated',
    'public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)',
    'execute'
  ) then
    raise exception 'Workout-derived record replacement remains browser executable.';
  end if;
  if has_function_privilege(
    'anon',
    'public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)',
    'execute'
  ) then
    raise exception 'Anonymous workout-derived record replacement remains executable.';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb)',
    'execute'
  ) then
    raise exception 'Service-role workout-derived record replacement grant is missing.';
  end if;
end
$verified_record_authority_postflight$;

notify pgrst, 'reload schema';

commit;
