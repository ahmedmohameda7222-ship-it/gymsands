-- Food Catalog Plan 7 Task 17: explicit retirement contract.
-- Approved destructive scope only:
--   1. public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)
--   2. public.food_aliases
--   3. public.food_market_relevance
-- No owner-state retirement, root Food-column retirement, compatibility promotion, or data population.

do $plan7_retirement_preflight$
declare
  v_old_search regprocedure :=
    to_regprocedure('public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)');
  v_unexpected text[];
begin
  if v_old_search is null then
    raise exception 'Plan 7 retirement expected old Food Library RPC is missing.';
  end if;

  if to_regclass('public.food_aliases') is null then
    raise exception 'Plan 7 retirement expected public.food_aliases is missing.';
  end if;
  if to_regclass('public.food_market_relevance') is null then
    raise exception 'Plan 7 retirement expected public.food_market_relevance is missing.';
  end if;

  if (select count(*) from public.food_aliases) <> 0 then
    raise exception 'Plan 7 retirement refuses non-empty public.food_aliases.';
  end if;
  if (select count(*) from public.food_market_relevance) <> 0 then
    raise exception 'Plan 7 retirement refuses non-empty public.food_market_relevance.';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    left join pg_roles role on role.oid = acl.grantee
    where p.oid = v_old_search
      and acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = 0
        or role.rolname in ('anon', 'authenticated', 'service_role')
      )
  ) then
    raise exception 'Plan 7 retirement refuses old Food Library RPC while an application role can execute it.';
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
    into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind = 'f'
    and p.oid <> v_old_search
    and position('public.food_aliases' in lower(pg_get_functiondef(p.oid))) > 0;

  if coalesce(array_length(v_unexpected, 1), 0) > 0 then
    raise exception 'Plan 7 retirement found unexpected public.food_aliases function dependencies: %', v_unexpected;
  end if;

  if exists (
    select 1
    from pg_views
    where schemaname in ('public', 'private')
      and position('public.food_aliases' in lower(definition)) > 0
  ) then
    raise exception 'Plan 7 retirement found unexpected public.food_aliases view dependencies.';
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
    into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind = 'f'
    and position('public.food_market_relevance' in lower(pg_get_functiondef(p.oid))) > 0;

  if coalesce(array_length(v_unexpected, 1), 0) > 0 then
    raise exception 'Plan 7 retirement found unexpected public.food_market_relevance function dependencies: %', v_unexpected;
  end if;

  if exists (
    select 1
    from pg_views
    where schemaname in ('public', 'private')
      and position('public.food_market_relevance' in lower(definition)) > 0
  ) then
    raise exception 'Plan 7 retirement found unexpected public.food_market_relevance view dependencies.';
  end if;
end
$plan7_retirement_preflight$;

drop function public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb);
drop table public.food_aliases;
drop table public.food_market_relevance;
