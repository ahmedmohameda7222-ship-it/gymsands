do $$
declare
  helper_oid oid := to_regprocedure('private.profile_role_unchanged(public.user_role)');
  helper_security_definer boolean;
  helper_volatility "char";
  helper_config text[];
  policy_using text;
  policy_check text;
begin
  if helper_oid is null then
    raise exception 'Missing private.profile_role_unchanged(public.user_role).';
  end if;

  select p.prosecdef, p.provolatile, p.proconfig
    into helper_security_definer, helper_volatility, helper_config
  from pg_proc p
  where p.oid = helper_oid;

  if helper_security_definer is not true then
    raise exception 'profile_role_unchanged must remain SECURITY DEFINER.';
  end if;

  if helper_volatility <> 's' then
    raise exception 'profile_role_unchanged must remain STABLE.';
  end if;

  if not ('search_path=pg_catalog, public' = any(coalesce(helper_config, '{}'::text[]))) then
    raise exception 'profile_role_unchanged must pin search_path to pg_catalog, public.';
  end if;

  if has_function_privilege('anon', helper_oid, 'EXECUTE') then
    raise exception 'anon must not execute profile_role_unchanged.';
  end if;

  if not has_function_privilege('authenticated', helper_oid, 'EXECUTE') then
    raise exception 'authenticated must execute profile_role_unchanged for RLS evaluation.';
  end if;

  select
    pg_get_expr(policy.polqual, policy.polrelid),
    pg_get_expr(policy.polwithcheck, policy.polrelid)
  into policy_using, policy_check
  from pg_policy policy
  join pg_class relation on relation.oid = policy.polrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'profiles'
    and policy.polname = 'profiles_update_own_basic';

  if policy_using is null or policy_check is null then
    raise exception 'Missing profiles_update_own_basic policy expressions.';
  end if;

  if policy_using not like '%auth.uid()%' then
    raise exception 'profiles_update_own_basic USING must remain owner-scoped.';
  end if;

  if policy_check not like '%private.profile_role_unchanged(role)%' then
    raise exception 'profiles_update_own_basic must use the non-recursive role-preservation helper.';
  end if;

  if policy_check ~* 'from[[:space:]]+profiles' then
    raise exception 'profiles_update_own_basic must not query profiles from its own policy.';
  end if;
end;
$$;
