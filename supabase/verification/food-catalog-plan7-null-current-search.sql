\set ON_ERROR_STOP on

-- Plan 7 Workstream 1: executable NULL-current Search V2 proof.
-- This runs against an exact-Git disposable database before any Plan 7 fixture
-- activates a generation. It intentionally does NOT call
-- rebuild_food_catalog_search_projection_v2(NULL).

begin;

do $plan7_null_current$
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

  if to_regprocedure('public.rebuild_food_catalog_search_projection_v2(uuid,text,text)') is null then
    raise exception 'Plan7 NULL-current proof requires Search V2 rebuild authority to exist';
  end if;
end
$plan7_null_current$;

select json_build_object(
  'currentGenerationId', null,
  'searchDocumentCount', (select count(*) from public.food_catalog_search_documents),
  'rebuildInvoked', false,
  'nullCurrentSearchVerified', true
)::text as plan7_null_current_search_evidence;

rollback;
