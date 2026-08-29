-- Disposable integration verification for Nutrition V1 final architecture corrections.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_final_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_final_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.nv1_final_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_final_rejected(text, text) to public;

do $catalog$
declare
  v_start regprocedure := to_regprocedure('public.start_nutrition_cooking_session(uuid,uuid,numeric,timestamp with time zone)');
begin
  perform pg_temp.nv1_final_assert(v_start is not null, 'Nutrition V1 atomic initial Cooking RPC missing.');
  perform pg_temp.nv1_final_assert(
    (select prosecdef from pg_proc where oid = v_start),
    'Nutrition V1 initial Cooking RPC must use owner-derived SECURITY DEFINER authority.'
  );
  perform pg_temp.nv1_final_assert(
    has_function_privilege('authenticated', v_start, 'EXECUTE')
    and has_function_privilege('service_role', v_start, 'EXECUTE')
    and not has_function_privilege('anon', v_start, 'EXECUTE'),
    'Nutrition V1 initial Cooking RPC execute grants invalid.'
  );

  perform pg_temp.nv1_final_assert(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'nutrition_food_items_normalized_name_trgm_idx'
        and indexdef like '%gin_trgm_ops%'
        and indexdef like '%normalize_nutrition_food_search_text%'
    ),
    'Nutrition V1 normalized catalog Food-name trigram index missing.'
  );
  perform pg_temp.nv1_final_assert(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'nutrition_food_aliases_normalized_text_trgm_idx'
        and indexdef like '%gin_trgm_ops%'
        and indexdef like '%normalize_nutrition_food_search_text%'
    ),
    'Nutrition V1 normalized alias trigram index missing.'
  );
  perform pg_temp.nv1_final_assert(
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'nutrition_user_food_items_normalized_name_trgm_idx'
        and indexdef like '%gin_trgm_ops%'
        and indexdef like '%normalize_nutrition_food_search_text%'
    ),
    'Nutrition V1 normalized personal Food-name trigram index missing.'
  );
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'd2800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-final-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

-- Canonical Recipe graph for initial Cooking creation and retry convergence.
insert into public.nutrition_recipes (id, user_id, name) values (
  'd2800000-0000-4000-8000-000000000010',
  'd2800000-0000-4000-8000-000000000001',
  'Final atomic cooking recipe'
);
insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings, total_time_minutes, metadata
) values (
  'd2800000-0000-4000-8000-000000000011',
  'd2800000-0000-4000-8000-000000000010',
  'd2800000-0000-4000-8000-000000000001',
  1, 'Final atomic cooking recipe', 2, 20, '{"fixture":true}'::jsonb
);
insert into public.nutrition_recipe_ingredients (
  id, user_id, recipe_version_id, position, ingredient_name, quantity, unit, frozen_nutrition
) values (
  'd2800000-0000-4000-8000-000000000012',
  'd2800000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000011',
  0, 'Fixture ingredient', 100, 'g', '{"calories":100}'::jsonb
);
insert into public.nutrition_recipe_actions (
  id, user_id, recipe_version_id, position, instruction, dependency_action_ids
) values
(
  'd2800000-0000-4000-8000-000000000013',
  'd2800000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000011',
  0, 'First canonical action', '{}'
),
(
  'd2800000-0000-4000-8000-000000000014',
  'd2800000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000011',
  1, 'Second canonical action', array['d2800000-0000-4000-8000-000000000013'::uuid]
);
insert into public.nutrition_recipe_equipment (
  id, user_id, recipe_version_id, position, name, quantity
) values (
  'd2800000-0000-4000-8000-000000000015',
  'd2800000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000011',
  0, 'Fixture pan', 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $start_convergence$
declare
  v_first jsonb;
  v_second jsonb;
  v_session_id uuid;
  v_snapshot jsonb;
begin
  v_first := public.start_nutrition_cooking_session(
    'd2800000-0000-4000-8000-000000000010',
    'd2800000-0000-4000-8000-000000000011',
    1,
    '2026-08-28T03:30:00Z'
  );
  v_second := public.start_nutrition_cooking_session(
    'd2800000-0000-4000-8000-000000000010',
    'd2800000-0000-4000-8000-000000000011',
    1,
    '2026-08-28T03:30:01Z'
  );
  v_session_id := (v_first->>'sessionId')::uuid;
  v_snapshot := v_first->'snapshot';

  perform pg_temp.nv1_final_assert(v_session_id is not null, 'Nutrition V1 initial Cooking RPC returned no session.');
  perform pg_temp.nv1_final_assert(v_second->>'sessionId' = v_first->>'sessionId', 'Duplicate initial Cooking start did not converge on the active session.');
  perform pg_temp.nv1_final_assert((v_first->>'reused')::boolean is false, 'First initial Cooking start was incorrectly marked reused.');
  perform pg_temp.nv1_final_assert((v_second->>'reused')::boolean is true, 'Retry initial Cooking start did not report canonical reuse.');
  perform pg_temp.nv1_final_assert(
    (select count(*) = 1 from public.nutrition_cooking_sessions
      where user_id = 'd2800000-0000-4000-8000-000000000001'
        and recipe_id = 'd2800000-0000-4000-8000-000000000010'
        and status = 'active'),
    'Initial Cooking retry created multiple active sessions.'
  );
  perform pg_temp.nv1_final_assert(
    (select count(*) = 2 from public.nutrition_cooking_action_states where session_id = v_session_id),
    'Initial Cooking Session exists without its complete canonical action state.'
  );
  perform pg_temp.nv1_final_assert(
    (select state = 'ready' from public.nutrition_cooking_action_states
      where session_id = v_session_id and action_key = 'd2800000-0000-4000-8000-000000000013')
    and
    (select state = 'not_available' from public.nutrition_cooking_action_states
      where session_id = v_session_id and action_key = 'd2800000-0000-4000-8000-000000000014'),
    'Initial Cooking action dependency states were not materialized canonically.'
  );
  perform pg_temp.nv1_final_assert(
    jsonb_array_length(v_snapshot->'ingredients') = 1
    and jsonb_array_length(v_snapshot->'actions') = 2
    and jsonb_array_length(v_snapshot->'equipment') = 1
    and v_snapshot->'recipe'->>'id' = 'd2800000-0000-4000-8000-000000000011',
    'Initial Cooking frozen snapshot was not built from one canonical published Recipe version.'
  );
end
$start_convergence$;

reset role;

-- Failure is injected after the parent session insert. The RPC transaction must
-- roll the parent back rather than depend on a compensating delete.
insert into public.nutrition_recipes (id, user_id, name) values (
  'd2800000-0000-4000-8000-000000000020',
  'd2800000-0000-4000-8000-000000000001',
  'Final failed cooking recipe'
);
insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings, metadata
) values (
  'd2800000-0000-4000-8000-000000000021',
  'd2800000-0000-4000-8000-000000000020',
  'd2800000-0000-4000-8000-000000000001',
  1, 'Final failed cooking recipe', 1, '{"fixture":true}'::jsonb
);
insert into public.nutrition_recipe_actions (
  id, user_id, recipe_version_id, position, instruction, dependency_action_ids
) values (
  'd2800000-0000-4000-8000-000000000022',
  'd2800000-0000-4000-8000-000000000001',
  'd2800000-0000-4000-8000-000000000021',
  0, 'Injected failure action', '{}'
);

create or replace function public.nv1_final_fail_initial_cooking_state()
returns trigger
language plpgsql
as $function$
begin
  if new.action_key = 'd2800000-0000-4000-8000-000000000022' then
    raise exception 'Injected initial Cooking action-state failure.' using errcode = '23514';
  end if;
  return new;
end
$function$;

drop trigger if exists nv1_final_fail_initial_cooking_state on public.nutrition_cooking_action_states;
create trigger nv1_final_fail_initial_cooking_state
before insert on public.nutrition_cooking_action_states
for each row execute function public.nv1_final_fail_initial_cooking_state();

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.nv1_final_rejected(
  $$select public.start_nutrition_cooking_session(
    'd2800000-0000-4000-8000-000000000020',
    'd2800000-0000-4000-8000-000000000021',
    1,
    '2026-08-28T03:31:00Z'
  )$$,
  'Nutrition V1 initial Cooking RPC accepted a child-state failure.'
);
select pg_temp.nv1_final_assert(
  not exists (
    select 1 from public.nutrition_cooking_sessions
    where user_id = 'd2800000-0000-4000-8000-000000000001'
      and recipe_id = 'd2800000-0000-4000-8000-000000000020'
  ),
  'Initial Cooking child failure left a partial durable session behind.'
);

reset role;
drop trigger nv1_final_fail_initial_cooking_state on public.nutrition_cooking_action_states;
drop function public.nv1_final_fail_initial_cooking_state();

-- Realistic enough selective catalog fixture to prove the exact normalization
-- predicates are usable by the new trigram indexes, then verify the public RPC.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  category, cuisine, nutrition_basis_amount, nutrition_basis_unit,
  is_global, lifecycle_status
)
select
  ('d2810000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'Final filler catalog food ' || lpad(series::text, 5, '0'),
  '100 g', 100, 10, 10, 2,
  'Final scale', 'Final test', 100, 'g', true, 'active'
from generate_series(1, 12000) as series;

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  category, cuisine, nutrition_basis_amount, nutrition_basis_unit,
  is_global, lifecycle_status
) values (
  'd2820000-0000-4000-8000-000000000001',
  'Scalable Needle Protein', '100 g', 120, 25, 3, 2,
  'Final scale', 'Final test', 100, 'g', true, 'active'
),(
  'd2820000-0000-4000-8000-000000000002',
  'Alias carrier', '100 g', 130, 22, 4, 3,
  'Final scale', 'Final test', 100, 'g', true, 'active'
);

insert into public.food_aliases (food_id, locale, alias, normalized_alias, alias_type)
select
  ('d2810000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'en',
  'Final filler alias ' || lpad(series::text, 5, '0'),
  'final filler alias ' || lpad(series::text, 5, '0'),
  'alias'
from generate_series(1, 12000) as series;
insert into public.food_aliases (food_id, locale, alias, normalized_alias, alias_type) values (
  'd2820000-0000-4000-8000-000000000002', 'en', 'Hidden Scalable Needle Alias', 'hidden scalable needle alias', 'alias'
);

analyze public.food_items;
analyze public.food_aliases;

do $index_plans$
declare
  v_name_plan json;
  v_alias_plan json;
begin
  execute $sql$
    explain (analyze, buffers, format json)
    select food.id
    from public.food_items food
    where food.is_global = true
      and food.lifecycle_status = 'active'
      and food.merged_into_food_id is null
      and private.normalize_nutrition_food_search_text(food.food_name) like '%scalable needle%'
  $sql$ into v_name_plan;

  execute $sql$
    explain (analyze, buffers, format json)
    select alias.food_id
    from public.food_aliases alias
    where private.normalize_nutrition_food_search_text(alias.alias) like '%scalable needle%'
  $sql$ into v_alias_plan;

  perform pg_temp.nv1_final_assert(
    v_name_plan::text like '%nutrition_food_items_normalized_name_trgm_idx%',
    'Normalized Food-name search did not use the canonical trigram index on the scaled fixture.'
  );
  perform pg_temp.nv1_final_assert(
    v_alias_plan::text like '%nutrition_food_aliases_normalized_text_trgm_idx%',
    'Normalized Food-alias search did not use the canonical trigram index on the scaled fixture.'
  );
end
$index_plans$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $public_search$
declare
  v_page jsonb;
begin
  v_page := public.search_nutrition_food_library(
    'scalable needle', 'en', null, 20, 'Final scale', 'Final test', 'all', '{}'::jsonb
  );
  perform pg_temp.nv1_final_assert(
    exists (
      select 1
      from jsonb_array_elements(v_page->'items') item
      where item->>'id' in (
        'd2820000-0000-4000-8000-000000000001',
        'd2820000-0000-4000-8000-000000000002'
      )
    ),
    'Scaled Food Library search could not discover a normalized name/alias match.'
  );
end
$public_search$;

rollback;
