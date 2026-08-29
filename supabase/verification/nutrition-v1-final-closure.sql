-- Disposable verification for Nutrition V1 final closure transactions and ownership.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_closure_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_closure_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_closure_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_closure_rejected(text, text) to public;

do $catalog$
declare
  v_create regprocedure := to_regprocedure('public.create_nutrition_saved_meal(text,text,boolean,jsonb)');
  v_update regprocedure := to_regprocedure('public.update_nutrition_saved_meal(uuid,text,text,boolean,jsonb)');
  v_duplicate regprocedure := to_regprocedure('public.duplicate_nutrition_recipe(uuid,uuid,text,numeric,numeric,integer,text,jsonb,jsonb,jsonb,jsonb)');
begin
  perform pg_temp.nv1_closure_assert(v_create is not null, 'Atomic Saved Meal create command missing.');
  perform pg_temp.nv1_closure_assert(v_update is not null, 'Atomic Saved Meal update command missing.');
  perform pg_temp.nv1_closure_assert(v_duplicate is not null, 'Atomic Recipe duplicate command missing.');
  perform pg_temp.nv1_closure_assert(
    (select prosecdef from pg_proc where oid = v_create)
    and (select prosecdef from pg_proc where oid = v_update)
    and (select prosecdef from pg_proc where oid = v_duplicate),
    'Nutrition V1 closure commands must use owner-derived database authority.'
  );
  perform pg_temp.nv1_closure_assert(
    has_function_privilege('authenticated', v_create, 'EXECUTE')
    and has_function_privilege('authenticated', v_update, 'EXECUTE')
    and has_function_privilege('authenticated', v_duplicate, 'EXECUTE')
    and not has_function_privilege('anon', v_create, 'EXECUTE')
    and not has_function_privilege('anon', v_update, 'EXECUTE')
    and not has_function_privilege('anon', v_duplicate, 'EXECUTE'),
    'Nutrition V1 closure command grants invalid.'
  );
  perform pg_temp.nv1_closure_assert(
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.nutrition_recipes'::regclass
        and conname = 'recipe_cover_path_owner'
        and pg_get_constraintdef(oid) like '%split_part%user_id%'
    ),
    'Recipe cover owner-path constraint missing.'
  );
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'e2800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-closure-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e2800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-closure-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Saved Meal create: the root and complete child set commit together.
do $saved_create$
declare
  v_created jsonb;
  v_id uuid;
begin
  v_created := public.create_nutrition_saved_meal(
    'Atomic breakfast',
    'closure fixture',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'food',
        'food_id', 'e2800000-0000-4000-8000-000000000101',
        'frozen_name', 'Fixture yogurt',
        'resolved_quantity', 1,
        'resolved_serving_label', '170 g',
        'frozen_nutrition', jsonb_build_object('calories', 120, 'protein_g', 17, 'carbs_g', null, 'fat_g', 2, 'fiber_g', null)
      )
    )
  );
  v_id := (v_created->>'id')::uuid;
  perform pg_temp.nv1_closure_assert(
    v_id is not null
    and (select count(*) = 1 from public.nutrition_saved_meals where id = v_id and user_id = 'e2800000-0000-4000-8000-000000000001')
    and (select count(*) = 1 from public.nutrition_saved_meal_items where saved_meal_id = v_id and user_id = 'e2800000-0000-4000-8000-000000000001'),
    'Valid Saved Meal create did not commit one complete bundle.'
  );
end
$saved_create$;

-- An invalid child must roll the root back with it.
select pg_temp.nv1_closure_rejected(
  $$select public.create_nutrition_saved_meal(
    'Invalid atomic breakfast', null, false,
    '[{"kind":"food","food_id":"e2800000-0000-4000-8000-000000000101","frozen_name":"Bad","resolved_quantity":0,"resolved_serving_label":"170 g","frozen_nutrition":{"calories":0}}]'::jsonb
  )$$,
  'Saved Meal create accepted an invalid child.'
);
select pg_temp.nv1_closure_assert(
  not exists (select 1 from public.nutrition_saved_meals where user_id = 'e2800000-0000-4000-8000-000000000001' and name = 'Invalid atomic breakfast'),
  'Invalid Saved Meal child left an orphan root.'
);

-- Update is a complete replacement transaction. Keep its former bundle when replacement fails.
do $saved_update$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select id into v_id from public.nutrition_saved_meals
  where user_id = 'e2800000-0000-4000-8000-000000000001' and name = 'Atomic breakfast';

  perform public.update_nutrition_saved_meal(
    v_id,
    'Atomic breakfast updated',
    'new note',
    true,
    '[{"kind":"food","food_id":"e2800000-0000-4000-8000-000000000102","frozen_name":"Fixture oats","resolved_quantity":2,"resolved_serving_label":"40 g","frozen_nutrition":{"calories":300,"protein_g":10,"carbs_g":null,"fat_g":6,"fiber_g":null}}]'::jsonb
  );
  select jsonb_build_object(
    'name', meal.name,
    'note', meal.note,
    'favorite', meal.is_favorite,
    'items', (select jsonb_agg(item.frozen_snapshot order by item.position) from public.nutrition_saved_meal_items item where item.saved_meal_id = meal.id)
  ) into v_before
  from public.nutrition_saved_meals meal where meal.id = v_id;

  begin
    perform public.update_nutrition_saved_meal(
      v_id,
      'Should roll back',
      'bad replacement',
      false,
      '[{"kind":"food","food_id":"e2800000-0000-4000-8000-000000000103","frozen_name":"Broken","resolved_quantity":0,"resolved_serving_label":"1 serving","frozen_nutrition":{"calories":0}}]'::jsonb
    );
    raise exception 'Invalid Saved Meal update unexpectedly succeeded.';
  exception when check_violation or invalid_parameter_value or numeric_value_out_of_range then
    null;
  end;

  select jsonb_build_object(
    'name', meal.name,
    'note', meal.note,
    'favorite', meal.is_favorite,
    'items', (select jsonb_agg(item.frozen_snapshot order by item.position) from public.nutrition_saved_meal_items item where item.saved_meal_id = meal.id)
  ) into v_after
  from public.nutrition_saved_meals meal where meal.id = v_id;

  perform pg_temp.nv1_closure_assert(v_after = v_before, 'Failed Saved Meal replacement changed the previous whole state.');
end
$saved_update$;

-- Delete/recovery keeps the same reusable identity inside the 30-day window.
do $saved_recovery$
declare
  v_id uuid;
  v_deleted jsonb;
  v_restored jsonb;
begin
  select id into v_id from public.nutrition_saved_meals
  where user_id = 'e2800000-0000-4000-8000-000000000001' and name = 'Atomic breakfast updated';
  v_deleted := public.soft_delete_nutrition_saved_meal(v_id);
  perform pg_temp.nv1_closure_assert(
    (v_deleted->>'id')::uuid = v_id
    and (select deleted_at is not null and purge_after > deleted_at from public.nutrition_saved_meals where id = v_id),
    'Saved Meal soft delete did not preserve recoverable identity.'
  );
  v_restored := public.restore_nutrition_saved_meal(v_id);
  perform pg_temp.nv1_closure_assert(
    (v_restored->>'id')::uuid = v_id
    and (select deleted_at is null and purge_after is null from public.nutrition_saved_meals where id = v_id),
    'Saved Meal restore did not recover the same identity.'
  );
end
$saved_recovery$;

-- Seed one immutable published Recipe graph for atomic duplication.
reset role;
insert into public.nutrition_recipes (id, user_id, name) values (
  'e2800000-0000-4000-8000-000000000200',
  'e2800000-0000-4000-8000-000000000001',
  'Duplicate source'
);
insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings, total_time_minutes, metadata
) values (
  'e2800000-0000-4000-8000-000000000201',
  'e2800000-0000-4000-8000-000000000200',
  'e2800000-0000-4000-8000-000000000001',
  1, 'Duplicate source', 2, 15, '{"nutrition_per_serving":{"calories":300}}'::jsonb
);
insert into public.nutrition_recipe_ingredients (
  id, user_id, recipe_version_id, position, ingredient_name, quantity, unit
) values (
  'e2800000-0000-4000-8000-000000000202',
  'e2800000-0000-4000-8000-000000000001',
  'e2800000-0000-4000-8000-000000000201',
  0, 'Rice', 100, 'g'
);
insert into public.nutrition_recipe_actions (
  id, user_id, recipe_version_id, position, instruction, ingredient_refs, dependency_action_ids
) values (
  'e2800000-0000-4000-8000-000000000203',
  'e2800000-0000-4000-8000-000000000001',
  'e2800000-0000-4000-8000-000000000201',
  0, 'Cook rice', '["e2800000-0000-4000-8000-000000000202"]'::jsonb, '{}'
);
insert into public.nutrition_recipe_equipment (
  id, user_id, recipe_version_id, position, name, quantity
) values (
  'e2800000-0000-4000-8000-000000000204',
  'e2800000-0000-4000-8000-000000000001',
  'e2800000-0000-4000-8000-000000000201',
  0, 'Pot', 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $duplicate_valid$
declare
  v_result jsonb;
  v_recipe_id uuid;
  v_draft_id uuid;
begin
  v_result := public.duplicate_nutrition_recipe(
    'e2800000-0000-4000-8000-000000000200',
    'e2800000-0000-4000-8000-000000000201',
    'Duplicate source copy', 2, null, 15, null,
    '{"nutrition_per_serving":{"calories":300}}'::jsonb,
    '[{"id":"e2800000-0000-4000-8000-000000000212","position":0,"food_id":null,"ingredient_name":"Rice","quantity":100,"unit":"g","frozen_nutrition":null}]'::jsonb,
    '[{"id":"e2800000-0000-4000-8000-000000000213","position":0,"instruction":"Cook rice","ingredient_refs":["e2800000-0000-4000-8000-000000000212"],"equipment_refs":["e2800000-0000-4000-8000-000000000214"],"duration_seconds":null,"heat_or_temperature":null,"doneness_or_result_cue":null,"prep_ahead_cue":null,"track_key":null,"dependency_action_ids":[],"can_run_in_background":false,"metadata":{}}]'::jsonb,
    '[{"id":"e2800000-0000-4000-8000-000000000214","position":0,"name":"Pot","quantity":1,"note":null}]'::jsonb
  );
  v_recipe_id := (v_result->>'recipeId')::uuid;
  v_draft_id := (v_result->>'draftId')::uuid;
  perform pg_temp.nv1_closure_assert(
    v_recipe_id is not null and v_draft_id is not null
    and (select count(*) = 1 from public.nutrition_recipe_drafts where id = v_draft_id and recipe_id = v_recipe_id)
    and (select count(*) = 1 from public.nutrition_recipe_ingredients where recipe_draft_id = v_draft_id)
    and (select count(*) = 1 from public.nutrition_recipe_actions where recipe_draft_id = v_draft_id)
    and (select count(*) = 1 from public.nutrition_recipe_equipment where recipe_draft_id = v_draft_id),
    'Valid Recipe duplicate did not commit one complete remapped draft graph.'
  );
end
$duplicate_valid$;

-- Child failure occurs after root+draft creation inside the RPC; transaction must remove both.
select pg_temp.nv1_closure_rejected(
  $$select public.duplicate_nutrition_recipe(
    'e2800000-0000-4000-8000-000000000200',
    'e2800000-0000-4000-8000-000000000201',
    'Invalid duplicate copy', 2, null, 15, null, '{}'::jsonb,
    '[{"id":"e2800000-0000-4000-8000-000000000222","position":0,"food_id":null,"ingredient_name":"","quantity":100,"unit":"g","frozen_nutrition":null}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )$$,
  'Recipe duplicate accepted an invalid child graph.'
);
select pg_temp.nv1_closure_assert(
  not exists (select 1 from public.nutrition_recipes where user_id = 'e2800000-0000-4000-8000-000000000001' and name = 'Invalid duplicate copy')
  and not exists (
    select 1 from public.nutrition_recipe_drafts draft
    join public.nutrition_recipes recipe on recipe.id = draft.recipe_id
    where recipe.user_id = 'e2800000-0000-4000-8000-000000000001' and recipe.name = 'Invalid duplicate copy'
  ),
  'Invalid Recipe graph left an orphan duplicate root or draft.'
);

-- Cover paths must stay inside the authenticated owner's storage prefix.
update public.nutrition_recipes
set cover_path = 'e2800000-0000-4000-8000-000000000001/covers/owned.webp'
where id = 'e2800000-0000-4000-8000-000000000200';
select pg_temp.nv1_closure_assert(
  (select cover_path = 'e2800000-0000-4000-8000-000000000001/covers/owned.webp' from public.nutrition_recipes where id = 'e2800000-0000-4000-8000-000000000200'),
  'Owner Recipe cover path was rejected.'
);
select pg_temp.nv1_closure_rejected(
  $$update public.nutrition_recipes
    set cover_path = 'e2800000-0000-4000-8000-000000000002/covers/foreign.webp'
    where id = 'e2800000-0000-4000-8000-000000000200'$$,
  'Foreign Recipe cover path was accepted.'
);

-- Same RPCs must fail when another authenticated owner targets these sources.
select set_config('request.jwt.claim.sub', 'e2800000-0000-4000-8000-000000000002', true);
select pg_temp.nv1_closure_rejected(
  $$select public.update_nutrition_saved_meal(
    (select id from public.nutrition_saved_meals where name = 'Atomic breakfast updated' limit 1),
    'Intruder edit', null, false,
    '[{"kind":"food","food_id":"e2800000-0000-4000-8000-000000000101","frozen_name":"Bad","resolved_quantity":1,"resolved_serving_label":"170 g","frozen_nutrition":{"calories":1}}]'::jsonb
  )$$,
  'Cross-owner Saved Meal update was accepted.'
);
select pg_temp.nv1_closure_rejected(
  $$select public.duplicate_nutrition_recipe(
    'e2800000-0000-4000-8000-000000000200',
    'e2800000-0000-4000-8000-000000000201',
    'Intruder duplicate', 2, null, 15, null, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  'Cross-owner Recipe duplicate was accepted.'
);

rollback;
