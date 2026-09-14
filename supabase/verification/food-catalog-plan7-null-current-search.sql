\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Plan 7 Workstream 1: executable NULL-current Search V2 proof.
-- This runs against an exact-Git disposable database before any Plan 7 fixture
-- activates a generation. It invokes the canonical Search V2 RPC under the
-- same authenticated compatibility boundary exposed to the application and
-- intentionally never invokes the projection rebuild authority.

begin;

select set_config(
  'plan7.generation_count_before',
  (select count(*)::text from public.food_catalog_generations),
  true
);

do $plan7_null_current_preconditions$
begin
  if not exists (
    select 1
    from public.food_catalog_current_generation
    where singleton_key=true
      and current_generation_id is null
  ) then
    raise exception 'Plan7 NULL-current proof requires a NULL current-generation pointer';
  end if;

  if exists (select 1 from public.food_catalog_search_documents) then
    raise exception 'Plan7 NULL-current proof requires zero SearchDocuments';
  end if;

  if to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is null then
    raise exception 'Plan7 NULL-current proof requires canonical Search V2 authority to exist';
  end if;
end
$plan7_null_current_preconditions$;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select set_config(
  'plan7.null_current_search_result',
  public.search_food_catalog_v2(
    '',
    'en',
    'Latn',
    null,
    null,
    20,
    null,
    null,
    'all',
    '{}'::jsonb
  )::text,
  true
);
reset role;

do $plan7_null_current_postconditions$
declare
  v_search_result jsonb := current_setting('plan7.null_current_search_result')::jsonb;
  v_generation_count_before bigint := current_setting('plan7.generation_count_before')::bigint;
begin
  if v_search_result is distinct from '{"items":[],"nextCursor":null}'::jsonb then
    raise exception 'Plan7 NULL-current canonical Search V2 payload is not the exact empty result: %', v_search_result;
  end if;

  if jsonb_array_length(v_search_result->'items') <> 0
     or v_search_result->'nextCursor' is distinct from 'null'::jsonb then
    raise exception 'Plan7 NULL-current canonical Search V2 emitted invalid items/cursor state';
  end if;

  if not exists (
    select 1
    from public.food_catalog_current_generation
    where singleton_key=true
      and current_generation_id is null
  ) then
    raise exception 'Plan7 NULL-current canonical Search V2 mutated the current-generation pointer';
  end if;

  if exists (select 1 from public.food_catalog_search_documents) then
    raise exception 'Plan7 NULL-current canonical Search V2 created SearchDocuments';
  end if;

  if (select count(*) from public.food_catalog_generations) <> v_generation_count_before then
    raise exception 'Plan7 NULL-current canonical Search V2 created a Catalog Generation';
  end if;
end
$plan7_null_current_postconditions$;

select '__PLAN7_NULL_CURRENT__' || json_build_object(
  'currentGenerationId', null,
  'searchDocumentCount', (select count(*) from public.food_catalog_search_documents),
  'generationCountBefore', current_setting('plan7.generation_count_before')::bigint,
  'generationCountAfter', (select count(*) from public.food_catalog_generations),
  'searchResult', current_setting('plan7.null_current_search_result')::jsonb,
  'rebuildInvoked', false,
  'canonicalRpcInvoked', true,
  'nullCurrentSearchVerified', true
)::text;

rollback;
