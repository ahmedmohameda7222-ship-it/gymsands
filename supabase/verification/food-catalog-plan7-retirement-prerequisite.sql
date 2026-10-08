\set ON_ERROR_STOP on

-- food_catalog_plan7_retirement_prerequisite
-- Task 16 non-destructive prerequisite verification. No owner/catalog fixture survives.
begin;

create or replace function pg_temp.plan7_retirement_prerequisite_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 7 retirement prerequisite assertion failed: %',p_message;
  end if;
end
$$;

grant execute on function pg_temp.plan7_retirement_prerequisite_assert(boolean,text) to public;

select count(*)::bigint as before_user_food_favorites
from public.user_food_favorites \gset
select count(*)::bigint as before_food_personal_corrections
from public.food_personal_corrections \gset

select pg_temp.plan7_retirement_prerequisite_assert(
  to_regprocedure('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null,
  'current browser/MCP Search V2 surface is incomplete'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  position('public.food_personal_corrections' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))=0
  and position('public.food_personal_overrides' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('public.food_personal_override_revisions' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('revision.revision_number is distinct from pointer.pointer_revision' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('override_revision.revision_number = override_pointer.pointer_revision' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('jsonb_typeof(override_revision.nutrition_override' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('public.food_catalog_generation_foods' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('public.food_nutrition_revisions' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('private.food_catalog_search_per_100_v2' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0,
  'Search V2 did not cut legacy Personal Corrections while preserving exact Plan 6/current-generation authority'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  position('v_cursor_context_sha256' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('candidate.match_tier' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('doc.generation_id = v_generation_id' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0
  and position('doc.projection_version = v_projection_version' in lower(pg_get_functiondef(
    'private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure
  )))>0,
  'Search V2 cursor/ranking/current-generation binding drifted'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  not has_function_privilege('anon','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'current browser/MCP Search V2 execution boundary drifted'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  to_regprocedure('public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)') is not null
  and not has_function_privilege('anon','public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'old Food Library RPC must remain present but non-executable by runtime roles'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  to_regprocedure('private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)') is not null
  and position('public.food_personal_corrections' in lower(pg_get_functiondef(
    'private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)'::regprocedure
  )))=0
  and position('private.nutrition_v1_core_purge_account_application_data_atomic(p_user_id)' in lower(pg_get_functiondef(
    'private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)'::regprocedure
  )))>0
  and position('delete from public.food_favorites where user_id = p_user_id' in lower(pg_get_functiondef(
    'private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)'::regprocedure
  )))>0
  and position('food_personal_corrections_deleted' in lower(pg_get_functiondef(
    'private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)'::regprocedure
  )))>0,
  'canonical account purge did not remove only the legacy correction-table dependency'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  to_regclass('public.food_personal_corrections') is not null
  and to_regclass('public.user_food_favorites') is not null
  and to_regclass('public.food_aliases') is not null
  and to_regclass('public.food_market_relevance') is not null
  and to_regclass('public.food_items') is not null,
  'a retained Plan 7 compatibility/owner object was dropped'
);

select pg_temp.plan7_retirement_prerequisite_assert(
  (select count(*)::bigint from public.user_food_favorites)=:'before_user_food_favorites'::bigint
  and (select count(*)::bigint from public.food_personal_corrections)=:'before_food_personal_corrections'::bigint,
  'verification mutated retained owner/legacy state'
);

rollback;
