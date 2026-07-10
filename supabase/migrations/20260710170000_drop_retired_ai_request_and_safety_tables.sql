-- Remove retired pre-constitution tables after the replacement application
-- and canonical functional-fitness-constraints model were deployed and verified.
--
-- Safety gates:
-- 1. The canonical replacement table must exist.
-- 2. Every legacy safety-profile owner must already have a canonical row.
-- 3. The obsolete AI action-request queue must remain empty.

do $$
begin
  if to_regclass('public.user_fitness_constraints') is null then
    raise exception 'Cannot remove legacy safety profiles: public.user_fitness_constraints does not exist';
  end if;

  if to_regclass('public.user_safety_profiles') is not null
     and exists (
       select 1
       from public.user_safety_profiles legacy
       where not exists (
         select 1
         from public.user_fitness_constraints canonical
         where canonical.user_id = legacy.user_id
       )
     ) then
    raise exception 'Cannot remove legacy safety profiles: unmigrated users remain';
  end if;

  if to_regclass('public.ai_action_requests') is not null
     and exists (select 1 from public.ai_action_requests) then
    raise exception 'Cannot remove ai_action_requests: rows remain';
  end if;
end
$$;

drop table if exists public.ai_action_requests;
drop table if exists public.user_safety_profiles;
