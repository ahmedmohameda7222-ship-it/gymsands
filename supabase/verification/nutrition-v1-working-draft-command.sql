-- Disposable verification for the published Recipe -> Working Draft transaction.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_working_draft_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_working_draft_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_working_draft_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_working_draft_rejected(text, text) to public;

do $catalog$
declare
  v_command regprocedure := to_regprocedure('public.create_nutrition_recipe_working_draft(uuid,uuid,jsonb,jsonb,jsonb)');
begin
  perform pg_temp.nv1_working_draft_assert(
    v_command is not null,
    'Nutrition V1 Working Draft transactional command missing.'
  );
  perform pg_temp.nv1_working_draft_assert(
    (select prosecdef from pg_proc where oid = v_command),
    'Nutrition V1 Working Draft command must use database owner authority.'
  );
  perform pg_temp.nv1_working_draft_assert(
    exists (
      select 1
      from pg_proc
      where oid = v_command
        and coalesce(proconfig, '{}') @> array['search_path=pg_catalog, public']
    ),
    'Nutrition V1 Working Draft command search_path is not fixed.'
  );
  perform pg_temp.nv1_working_draft_assert(
    has_function_privilege('authenticated', v_command, 'EXECUTE')
    and has_function_privilege('service_role', v_command, 'EXECUTE')
    and not has_function_privilege('anon', v_command, 'EXECUTE'),
    'Nutrition V1 Working Draft command grants invalid.'
  );
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'e2810000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-working-draft-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e2810000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-working-draft-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

-- Seed immutable published graphs as database fixture authority.
reset role;
insert into public.nutrition_recipes (id, user_id, name) values
  ('e2810000-0000-4000-8000-000000000100', 'e2810000-0000-4000-8000-000000000001', 'Published source'),
  ('e2810000-0000-4000-8000-000000000200', 'e2810000-0000-4000-8000-000000000001', 'Rollback source'),
  ('e2810000-0000-4000-8000-000000000300', 'e2810000-0000-4000-8000-000000000001', 'Stale source');

insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings,
  total_cooked_weight_g, total_time_minutes, notes, metadata
) values
  (
    'e2810000-0000-4000-8000-000000000101',
    'e2810000-0000-4000-8000-000000000100',
    'e2810000-0000-4000-8000-000000000001',
    1, 'Published source', 2, 500, 20, 'Published notes',
    '{"nutrition_per_serving":{"calories":320}}'::jsonb
  ),
  (
    'e2810000-0000-4000-8000-000000000201',
    'e2810000-0000-4000-8000-000000000200',
    'e2810000-0000-4000-8000-000000000001',
    1, 'Rollback source', 2, null, 10, null, '{}'::jsonb
  ),
  (
    'e2810000-0000-4000-8000-000000000301',
    'e2810000-0000-4000-8000-000000000300',
    'e2810000-0000-4000-8000-000000000001',
    1, 'Stale source v1', 1, null, 5, null, '{}'::jsonb
  ),
  (
    'e2810000-0000-4000-8000-000000000302',
    'e2810000-0000-4000-8000-000000000300',
    'e2810000-0000-4000-8000-000000000001',
    2, 'Stale source v2', 1, null, 6, null, '{}'::jsonb
  );

insert into public.nutrition_recipe_ingredients (
  id, user_id, recipe_version_id, position, ingredient_name, quantity, unit
) values (
  'e2810000-0000-4000-8000-000000000102',
  'e2810000-0000-4000-8000-000000000001',
  'e2810000-0000-4000-8000-000000000101',
  0, 'Rice', 100, 'g'
);
insert into public.nutrition_recipe_actions (
  id, user_id, recipe_version_id, position, instruction,
  ingredient_refs, dependency_action_ids
) values (
  'e2810000-0000-4000-8000-000000000103',
  'e2810000-0000-4000-8000-000000000001',
  'e2810000-0000-4000-8000-000000000101',
  0, 'Cook rice',
  '["e2810000-0000-4000-8000-000000000102"]'::jsonb,
  '{}'
);
insert into public.nutrition_recipe_equipment (
  id, user_id, recipe_version_id, position, name, quantity
) values (
  'e2810000-0000-4000-8000-000000000104',
  'e2810000-0000-4000-8000-000000000001',
  'e2810000-0000-4000-8000-000000000101',
  0, 'Pot', 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2810000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Valid transition commits the draft header and complete remapped graph together.
do $valid$
declare
  v_result jsonb;
  v_draft_id uuid;
begin
  v_result := public.create_nutrition_recipe_working_draft(
    'e2810000-0000-4000-8000-000000000100',
    'e2810000-0000-4000-8000-000000000101',
    '[{"id":"e2810000-0000-4000-8000-000000000112","position":0,"food_id":null,"ingredient_name":"Rice","quantity":100,"unit":"g","frozen_nutrition":null}]'::jsonb,
    '[{"id":"e2810000-0000-4000-8000-000000000113","position":0,"instruction":"Cook rice","ingredient_refs":["e2810000-0000-4000-8000-000000000112"],"equipment_refs":["e2810000-0000-4000-8000-000000000114"],"duration_seconds":null,"heat_or_temperature":null,"doneness_or_result_cue":null,"prep_ahead_cue":null,"track_key":null,"dependency_action_ids":[],"can_run_in_background":false,"metadata":{}}]'::jsonb,
    '[{"id":"e2810000-0000-4000-8000-000000000114","position":0,"name":"Pot","quantity":1,"note":null}]'::jsonb
  );
  v_draft_id := (v_result->>'draftId')::uuid;

  perform pg_temp.nv1_working_draft_assert(
    (v_result->>'recipeId')::uuid = 'e2810000-0000-4000-8000-000000000100'
    and coalesce((v_result->>'created')::boolean, false)
    and v_draft_id is not null,
    'Nutrition V1 Working Draft command did not return the created identity.'
  );
  perform pg_temp.nv1_working_draft_assert(
    exists (
      select 1
      from public.nutrition_recipe_drafts
      where id = v_draft_id
        and recipe_id = 'e2810000-0000-4000-8000-000000000100'
        and user_id = 'e2810000-0000-4000-8000-000000000001'
        and base_recipe_version_id = 'e2810000-0000-4000-8000-000000000101'
        and name = 'Published source'
        and servings = 2
        and notes = 'Published notes'
    )
    and (select count(*) = 1 from public.nutrition_recipe_ingredients where recipe_draft_id = v_draft_id)
    and (select count(*) = 1 from public.nutrition_recipe_actions where recipe_draft_id = v_draft_id)
    and (select count(*) = 1 from public.nutrition_recipe_equipment where recipe_draft_id = v_draft_id),
    'Nutrition V1 Working Draft atomic graph contract missing.'
  );
end
$valid$;

-- A retried/concurrent command converges on the existing draft without adding children.
do $retry$
declare
  v_before uuid;
  v_result jsonb;
begin
  select id into v_before
  from public.nutrition_recipe_drafts
  where recipe_id = 'e2810000-0000-4000-8000-000000000100';

  v_result := public.create_nutrition_recipe_working_draft(
    'e2810000-0000-4000-8000-000000000100',
    'e2810000-0000-4000-8000-000000000101',
    '[{"id":"e2810000-0000-4000-8000-000000000122","position":0,"ingredient_name":"Should not insert","quantity":1}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );

  perform pg_temp.nv1_working_draft_assert(
    (v_result->>'draftId')::uuid = v_before
    and not coalesce((v_result->>'created')::boolean, true)
    and (select count(*) = 1 from public.nutrition_recipe_drafts where recipe_id = 'e2810000-0000-4000-8000-000000000100')
    and (select count(*) = 1 from public.nutrition_recipe_ingredients where recipe_draft_id = v_before),
    'Nutrition V1 Working Draft retry did not converge on one identity.'
  );
end
$retry$;

-- A child failure occurs after draft insertion inside the function and must roll
-- the entire transaction back to the previously published-only state.
select pg_temp.nv1_working_draft_rejected(
  $$select public.create_nutrition_recipe_working_draft(
    'e2810000-0000-4000-8000-000000000200',
    'e2810000-0000-4000-8000-000000000201',
    '[{"id":"e2810000-0000-4000-8000-000000000212","position":0,"ingredient_name":"","quantity":1}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'Nutrition V1 Working Draft command accepted an invalid child.'
);
select pg_temp.nv1_working_draft_assert(
  not exists (
    select 1 from public.nutrition_recipe_drafts
    where recipe_id = 'e2810000-0000-4000-8000-000000000200'
  ),
  'Nutrition V1 Working Draft child failure left a partial draft.'
);

-- A stale immutable source version must fail closed instead of cloning old truth.
select pg_temp.nv1_working_draft_rejected(
  $$select public.create_nutrition_recipe_working_draft(
    'e2810000-0000-4000-8000-000000000300',
    'e2810000-0000-4000-8000-000000000301',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'Nutrition V1 Working Draft command accepted a stale published version.'
);
select pg_temp.nv1_working_draft_assert(
  not exists (
    select 1 from public.nutrition_recipe_drafts
    where recipe_id = 'e2810000-0000-4000-8000-000000000300'
  ),
  'Nutrition V1 stale Working Draft request created durable state.'
);

-- Owner-derived command authority must not expose or mutate another member's Recipe.
select set_config('request.jwt.claim.sub', 'e2810000-0000-4000-8000-000000000002', true);
select pg_temp.nv1_working_draft_rejected(
  $$select public.create_nutrition_recipe_working_draft(
    'e2810000-0000-4000-8000-000000000200',
    'e2810000-0000-4000-8000-000000000201',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'Nutrition V1 Working Draft cross-owner command leaked Recipe authority.'
);
select pg_temp.nv1_working_draft_assert(
  not exists (
    select 1 from public.nutrition_recipe_drafts
    where recipe_id = 'e2810000-0000-4000-8000-000000000200'
  ),
  'Nutrition V1 Working Draft cross-owner access created durable state.'
);

rollback;
