\set ON_ERROR_STOP on

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
  and to_regprocedure('private.search_food_catalog_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)') is not null
  and to_regprocedure('public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)') is not null,
  'Task 14 owner/search authority functions are missing'
);

select pg_temp.plan7_expand_assert(
  has_function_privilege('authenticated','public.food_catalog_get_current_personal_override_v1(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.food_catalog_get_current_personal_override_v1(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.food_catalog_get_current_personal_override_for_mcp_v1(uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.search_food_catalog_v2_for_mcp_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
  'browser/MCP function ACL boundary drifted'
);

select pg_temp.plan7_expand_assert(
  not has_table_privilege('service_role','public.food_personal_overrides','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.food_personal_override_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.food_personal_override_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated','public.food_personal_overrides','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated','public.food_personal_override_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated','public.food_personal_override_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'Personal Override direct table authority widened'
);

select pg_temp.plan7_expand_assert(
  (
    select position('food_personal_corrections' in lower(pg_get_functiondef(p.oid)))=0
      and position('private.search_food_catalog_v2_for_owner_v1' in lower(pg_get_functiondef(p.oid)))>0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='search_food_catalog_v2' and p.pronargs=10
  )
  and (
    select position('food_personal_corrections' in lower(pg_get_functiondef(p.oid)))=0
      and position('public.food_catalog_generation_foods' in lower(pg_get_functiondef(p.oid)))>0
      and position('public.food_nutrition_revisions' in lower(pg_get_functiondef(p.oid)))>0
      and position('private.food_catalog_get_current_personal_override_for_owner_v1' in lower(pg_get_functiondef(p.oid)))>0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='search_food_catalog_v2_for_owner_v1' and p.pronargs=11
  ),
  'current search authority retained legacy correction semantics or lost current-generation nutrition binding'
);

select pg_temp.plan7_expand_assert(
  not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (
      (n.nspname='public' and p.proname in ('food_catalog_get_current_personal_override_for_mcp_v1','search_food_catalog_v2_for_mcp_v1'))
      or (n.nspname='private' and p.proname='food_catalog_owner_for_active_mcp_connection_v1')
    )
    and (
      position('p_user_id' in lower(pg_get_functiondef(p.oid)))>0
      or position('request.jwt.claim.sub' in lower(pg_get_functiondef(p.oid)))>0
      or position('set_config' in lower(pg_get_functiondef(p.oid)))>0
    )
  ),
  'MCP bridge accepts caller owner identity or impersonates auth.uid()'
);

\set owner_a '74000000-0000-4000-8000-000000000001'
\set owner_b '74000000-0000-4000-8000-000000000002'
\set food_a '74000000-0000-4000-8000-000000000101'
\set rev_a '74000000-0000-4000-8000-000000000201'
\set rev_b '74000000-0000-4000-8000-000000000202'
\set connection_a '74000000-0000-4000-8000-000000000301'
\set connection_b '74000000-0000-4000-8000-000000000302'
\set connection_inactive '74000000-0000-4000-8000-000000000303'
\set connection_revoked '74000000-0000-4000-8000-000000000304'
\set connection_unknown '74000000-0000-4000-8000-000000000399'
\set my_food_a '74000000-0000-4000-8000-000000000401'
\set my_food_b '74000000-0000-4000-8000-000000000402'

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

insert into public.chatgpt_connections(
  id,user_id,token_hash,label,scopes,is_active,revoked_at,created_at,updated_at
) values
(:'connection_a',:'owner_a','plan7-expand-token-a','Task14 A',array['read:nutrition']::text[],true,null,clock_timestamp(),clock_timestamp()),
(:'connection_b',:'owner_b','plan7-expand-token-b','Task14 B',array['read:nutrition']::text[],true,null,clock_timestamp(),clock_timestamp()),
(:'connection_inactive',:'owner_a','plan7-expand-token-inactive','Task14 inactive',array['read:nutrition']::text[],false,null,clock_timestamp(),clock_timestamp()),
(:'connection_revoked',:'owner_a','plan7-expand-token-revoked','Task14 revoked',array['read:nutrition']::text[],false,clock_timestamp(),clock_timestamp(),clock_timestamp());

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
(:'food_a','Plan 7 expand canonical fixture',true,'active');

insert into public.food_personal_override_revisions(
  id,user_id,food_id,revision_number,supersedes_revision_id,nutrition_override,serving_label,note,is_deleted,created_at
) values
(:'rev_a',:'owner_a',:'food_a',1,null,'{"calories":0,"protein_g":null}'::jsonb,null,'Owner A',false,clock_timestamp()),
(:'rev_b',:'owner_b',:'food_a',1,null,'{"calories":222}'::jsonb,null,'Owner B',false,clock_timestamp());

insert into public.food_personal_overrides(
  user_id,food_id,current_revision_id,pointer_revision,updated_at
) values
(:'owner_a',:'food_a',:'rev_a',1,clock_timestamp()),
(:'owner_b',:'food_a',:'rev_b',1,clock_timestamp());

insert into public.user_food_items(
  id,user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,
  nutrition_basis_amount,nutrition_basis_unit,notes,category,deleted_at
) values
(:'my_food_a',:'owner_a','Plan7 MCP oatmeal','40 g',150,5,25,3,40,'g','Owner A fixture','Custom',null),
(:'my_food_b',:'owner_b','Plan7 MCP oatmeal','50 g',160,6,26,4,50,'g','Owner B fixture','Custom',null);

set local role service_role;
select public.food_catalog_get_current_personal_override_for_mcp_v1(:'connection_a',:'food_a') as override_a \gset
select pg_temp.plan7_expand_assert(
  (:'override_a'::jsonb->>'revisionId')::uuid=:'rev_a'::uuid
  and :'override_a'::jsonb->'nutritionOverride'->'calories'='0'::jsonb
  and :'override_a'::jsonb->'nutritionOverride'->'protein_g'='null'::jsonb,
  'active connection A did not resolve exact owner A pointer/zero/null state'
);
select public.food_catalog_get_current_personal_override_for_mcp_v1(:'connection_b',:'food_a') as override_b \gset
select pg_temp.plan7_expand_assert(
  (:'override_b'::jsonb->>'revisionId')::uuid=:'rev_b'::uuid
  and (:'override_b'::jsonb->'nutritionOverride'->>'calories')::numeric=222,
  'connection B did not resolve only owner B override'
);

select public.search_food_catalog_v2_for_mcp_v1(
  :'connection_a','Plan7 MCP oatmeal','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as mcp_search_a \gset
select pg_temp.plan7_expand_assert(
  jsonb_array_length(:'mcp_search_a'::jsonb->'items')=1
  and (:'mcp_search_a'::jsonb->'items'->0->>'id')::uuid=:'my_food_a'::uuid
  and :'mcp_search_a'::jsonb->'items'->0->>'source'='my_food',
  'MCP connection A search leaked or missed My Food owner state'
);
select public.search_food_catalog_v2_for_mcp_v1(
  :'connection_b','Plan7 MCP oatmeal','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as mcp_search_b \gset
select pg_temp.plan7_expand_assert(
  jsonb_array_length(:'mcp_search_b'::jsonb->'items')=1
  and (:'mcp_search_b'::jsonb->'items'->0->>'id')::uuid=:'my_food_b'::uuid,
  'MCP connection B search leaked owner A My Food state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select public.search_food_catalog_v2(
  'Plan7 MCP oatmeal','en',null,null,null,20,null,null,'my_food','{}'::jsonb
) as browser_search_a \gset
select pg_temp.plan7_expand_assert(
  :'browser_search_a'::jsonb=:'mcp_search_a'::jsonb,
  'authenticated and MCP V2 search are not equivalent for the same owner/arguments'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.search_food_catalog_v2_for_mcp_v1(%L::uuid,%L)',:'connection_a','Plan7 MCP oatmeal'),
  '42501','authenticated browser called service-role MCP search bridge'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_a',:'food_a'),
  '42501','authenticated browser called service-role MCP point bridge'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.search_food_catalog_v2_for_mcp_v1(%L::uuid,%L)',:'connection_a','Plan7 MCP oatmeal'),
  '42501','anon called MCP search bridge'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_a',:'food_a'),
  '42501','anon called MCP point bridge'
);
reset role;

set local role service_role;
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_inactive',:'food_a'),
  '42501','inactive MCP connection accepted'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_revoked',:'food_a'),
  '42501','revoked MCP connection accepted'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_for_mcp_v1(%L::uuid,%L::uuid)',:'connection_unknown',:'food_a'),
  '42501','unknown MCP connection accepted'
);
select pg_temp.plan7_expand_expect_sqlstate(
  format('select public.search_food_catalog_v2_for_mcp_v1(%L::uuid,%L)',:'connection_inactive','Plan7 MCP oatmeal'),
  '42501','inactive MCP connection searched owner state'
);
reset role;

rollback;
