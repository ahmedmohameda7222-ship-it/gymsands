\set ON_ERROR_STOP on

-- food_catalog_plan7_owner_reconciliation_expand
-- Task 14 expand-only verification. All fixture writes are rolled back.
begin;

create or replace function pg_temp.plan7_expand_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 7 owner reconciliation expand assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.plan7_expand_expect_sqlstate(
  p_sql text,p_expected_sqlstate text,p_message text
)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 7 owner reconciliation expand expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 7 owner reconciliation expand expected rejection did not occur:%' then raise; end if;
    if sqlstate is distinct from p_expected_sqlstate then
      raise exception 'Plan 7 owner reconciliation expand rejection had SQLSTATE %, expected %: %',
        sqlstate,p_expected_sqlstate,p_message;
    end if;
  end;
end
$$;

grant execute on function pg_temp.plan7_expand_assert(boolean,text) to public;
grant execute on function pg_temp.plan7_expand_expect_sqlstate(text,text,text) to public;

select pg_temp.plan7_expand_assert(
  to_regprocedure('private.food_catalog_get_current_personal_override_for_owner_v1(uuid,uuid)') is not null
  and to_regprocedure('public.food_catalog_get_current_personal_override_v1(uuid)') is not null
  and to_regprocedure('public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)') is not null
  and to_regprocedure('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null,
  'required shared/public/MCP function surface is incomplete'
);

select pg_temp.plan7_expand_assert(
  pg_get_function_identity_arguments('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure)
    = 'p_query text, p_language_tag text, p_script_code text, p_market_scope_code text, p_cursor text, p_limit integer, p_category text, p_cuisine text, p_scope text, p_filters jsonb',
  'browser Search V2 public signature drifted'
);

select pg_temp.plan7_expand_assert(
  has_function_privilege('authenticated','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'browser Search V2 grants drifted'
);

select pg_temp.plan7_expand_assert(
  has_function_privilege('service_role','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'MCP bridge RPC ACLs are not service-role only'
);

select pg_temp.plan7_expand_assert(
  not has_function_privilege('public','private.food_catalog_get_current_personal_override_for_owner_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','private.food_catalog_get_current_personal_override_for_owner_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.food_catalog_get_current_personal_override_for_owner_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('service_role','private.food_catalog_get_current_personal_override_for_owner_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('public','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'private owner/search core became directly executable by application roles'
);

select pg_temp.plan7_expand_assert(
  not has_table_privilege('service_role','public.food_personal_overrides','SELECT')
  and not has_table_privilege('service_role','public.food_personal_override_revisions','SELECT')
  and not has_table_privilege('service_role','public.food_personal_override_operations','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_overrides','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_override_revisions','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_override_operations','SELECT'),
  'direct Personal Override table SELECT authority widened'
);

select pg_temp.plan7_expand_assert(
  position('p_user_id' in pg_get_function_identity_arguments('public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)'::regprocedure))=0
  and position('p_user_id' in pg_get_function_identity_arguments('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))=0,
  'public MCP bridge signature accepts caller-supplied owner identity'
);

select pg_temp.plan7_expand_assert(
  position('request.jwt.claim.sub' in pg_get_functiondef('public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)'::regprocedure))=0
  and position('request.jwt.claim.sub' in pg_get_functiondef('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))=0
  and position('set_config' in lower(pg_get_functiondef('private.food_catalog_owner_for_mcp_connection_v1(uuid)'::regprocedure)))=0,
  'MCP bridge impersonates auth.uid() state'
);

select pg_temp.plan7_expand_assert(
  position('public.chatgpt_connections' in pg_get_functiondef('private.food_catalog_owner_for_mcp_connection_v1(uuid)'::regprocedure))>0
  and position('connection.id = p_connection_id' in pg_get_functiondef('private.food_catalog_owner_for_mcp_connection_v1(uuid)'::regprocedure))>0
  and position('connection.is_active = true' in pg_get_functiondef('private.food_catalog_owner_for_mcp_connection_v1(uuid)'::regprocedure))>0
  and position('connection.revoked_at is null' in lower(pg_get_functiondef('private.food_catalog_owner_for_mcp_connection_v1(uuid)'::regprocedure)))>0,
  'MCP owner derivation is not bound to an exact active non-revoked connection'
);

select pg_temp.plan7_expand_assert(
  position('public.food_personal_corrections' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))=0
  and position('public.food_personal_overrides' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('public.food_personal_override_revisions' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('public.food_catalog_generation_foods' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('public.food_nutrition_revisions' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('private.food_catalog_search_per_100_v2' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0,
  'search core did not replace legacy Personal Correction authority with exact Plan 6/current-generation nutrition authority'
);

select pg_temp.plan7_expand_assert(
  position('jsonb_typeof(override_revision.nutrition_override -> ''calories''::text) = ''number''::text' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  or position('jsonb_typeof((override_revision.nutrition_override -> ''calories''::text)) = ''number''::text' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0,
  'search core no longer distinguishes numeric zero from missing/JSON-null override values'
);

select pg_temp.plan7_expand_assert(
  position('v_cursor_context_sha256' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('candidate.match_tier' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('doc.generation_id = v_generation_id' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0
  and position('doc.projection_version = v_projection_version' in pg_get_functiondef('private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)'::regprocedure))>0,
  'cursor/ranking/current SearchDocument generation binding drifted'
);

\set owner_a '73000000-0000-4000-8000-000000000001'
\set owner_b '73000000-0000-4000-8000-000000000002'
\set connection_a '73000000-0000-4000-8000-000000000011'
\set connection_b '73000000-0000-4000-8000-000000000012'
\set connection_revoked '73000000-0000-4000-8000-000000000013'
\set connection_inactive '73000000-0000-4000-8000-000000000014'
\set connection_unknown '73000000-0000-4000-8000-000000000099'
\set my_food_a '73000000-0000-4000-8000-000000000101'
\set my_food_b '73000000-0000-4000-8000-000000000102'
\set catalog_food '73000000-0000-4000-8000-000000000201'
\set override_a '73000000-0000-4000-8000-000000000301'
\set override_b '73000000-0000-4000-8000-000000000302'

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
(:'owner_a','authenticated','authenticated','plan7-expand-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_b','authenticated','authenticated','plan7-expand-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.account_access_states(user_id,state,reason_code,disabled_at) values
(:'owner_a','active','plan7-expand-fixture',null),
(:'owner_b','active','plan7-expand-fixture',null)
on conflict(user_id) do update
set state=excluded.state,reason_code=excluded.reason_code,disabled_at=excluded.disabled_at,updated_at=clock_timestamp();

insert into public.chatgpt_connections(id,user_id,token_hash,label,scopes,is_active,revoked_at) values
(:'connection_a',:'owner_a','plan7-expand-token-a','Plan7 A','{}',true,null),
(:'connection_b',:'owner_b','plan7-expand-token-b','Plan7 B','{}',true,null),
(:'connection_revoked',:'owner_a','plan7-expand-token-revoked','Plan7 revoked','{}',true,clock_timestamp()),
(:'connection_inactive',:'owner_a','plan7-expand-token-inactive','Plan7 inactive','{}',false,null);

insert into public.user_food_items(
  id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,
  category,cuisine,nutrition_basis_amount,nutrition_basis_unit,created_at,updated_at
) values
(:'my_food_a',:'owner_a','MCP Owner A Food','1 serving',90,9,10,2,'personal','fixture',1,'serving',clock_timestamp(),clock_timestamp()),
(:'my_food_b',:'owner_b','MCP Owner B Food','1 serving',190,19,20,3,'personal','fixture',1,'serving',clock_timestamp(),clock_timestamp());

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
(:'catalog_food','MCP Override Fixture',true,'active');

insert into public.food_personal_override_revisions(
  id,user_id,food_id,revision_number,nutrition_override,serving_label,note,is_deleted,created_at
) values
(:'override_a',:'owner_a',:'catalog_food',1,'{"calories":0}'::jsonb,null,'owner A',false,clock_timestamp()),
(:'override_b',:'owner_b',:'catalog_food',1,'{"calories":222}'::jsonb,null,'owner B',false,clock_timestamp());

insert into public.food_personal_overrides(user_id,food_id,current_revision_id,pointer_revision,updated_at) values
(:'owner_a',:'catalog_food',:'override_a',1,clock_timestamp()),
(:'owner_b',:'catalog_food',:'override_b',1,clock_timestamp());

set local role service_role;
select public.food_catalog_get_current_personal_override_for_mcp_v1(:'connection_a',:'catalog_food') as mcp_override_a \gset
select pg_temp.plan7_expand_assert(
  (:'mcp_override_a'::jsonb->>'revisionId')::uuid=:'override_a'::uuid
  and (:'mcp_override_a'::jsonb->>'revisionId')::uuid<>:'override_b'::uuid
  and :'mcp_override_a'::jsonb->'nutritionOverride'->'calories'='0'::jsonb,
  'connection A did not resolve only owner A Personal Override state'
);

select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_revoked',:'catalog_food'),
  '42501','revoked connection'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_inactive',:'catalog_food'),
  '42501','inactive connection'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_unknown',:'catalog_food'),
  '42501','unknown connection'
);

select public.search_food_catalog_v2_for_mcp_v1(
  :'connection_a','MCP Owner A Food','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as mcp_search_a \gset
select public.search_food_catalog_v2_for_mcp_v1(
  :'connection_b','MCP Owner B Food','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as mcp_search_b \gset
select pg_temp.plan7_expand_assert(
  (:'mcp_search_a'::jsonb->'items'->0->>'id')::uuid=:'my_food_a'::uuid
  and (:'mcp_search_b'::jsonb->'items'->0->>'id')::uuid=:'my_food_b'::uuid,
  'MCP search owner identity did not derive from the exact connection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select public.search_food_catalog_v2(
  'MCP Owner A Food','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as browser_search_a \gset
select pg_temp.plan7_expand_assert(
  :'browser_search_a'::jsonb=:'mcp_search_a'::jsonb,
  'authenticated public search and MCP search are not equivalent for the same owner/arguments'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_a',:'catalog_food'),
  '42501','authenticated browser called MCP Personal Override bridge'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.search_food_catalog_v2_for_mcp_v1(%L::uuid,%L,%L,null,null,null,20,null,null,%L,%L::jsonb)',
    :'connection_a','MCP Owner A Food','en','my_food','{}'),
  '42501','authenticated browser called MCP search bridge'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_a',:'catalog_food'),
  '42501','anonymous caller called MCP Personal Override bridge'
);
reset role;

rollback;
