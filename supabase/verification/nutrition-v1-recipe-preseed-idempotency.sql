-- Disposable verification for Nutrition V1 Food -> New Recipe atomic preseed.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_recipe_preseed_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

grant execute on function pg_temp.nv1_recipe_preseed_assert(boolean, text) to public;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f3280000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-recipe-preseed-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g, lifecycle_status
) values (
  'f3280000-0000-4000-8000-000000000003',
  'Atomic chicken', '100 g', 110, 21, 0, 2, 'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3280000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $owner$
declare
  v_operation_id uuid := 'f3280000-0000-4000-8000-000000000002';
  v_ingredient jsonb := '{"food_id":"f3280000-0000-4000-8000-000000000003","ingredient_name":"Atomic chicken","quantity":2,"unit":"100 g","frozen_nutrition":{"calories":220,"protein_g":42}}'::jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_recipe_id uuid;
  v_draft_id uuid;
begin
  v_first := public.create_preseeded_nutrition_recipe_draft(v_operation_id, v_ingredient);
  v_retry := public.create_preseeded_nutrition_recipe_draft(v_operation_id, v_ingredient);
  v_recipe_id := (v_first->>'recipeId')::uuid;
  v_draft_id := (v_first->>'draftId')::uuid;

  perform pg_temp.nv1_recipe_preseed_assert(v_recipe_id is not null, 'Atomic preseed did not return a Recipe ID.');
  perform pg_temp.nv1_recipe_preseed_assert(v_draft_id is not null, 'Atomic preseed did not return a Draft ID.');
  perform pg_temp.nv1_recipe_preseed_assert(v_retry->>'recipeId' = v_first->>'recipeId', 'Retry created or returned a different Recipe.');
  perform pg_temp.nv1_recipe_preseed_assert(v_retry->>'draftId' = v_first->>'draftId', 'Retry created or returned a different Draft.');
  perform pg_temp.nv1_recipe_preseed_assert((v_first->>'reused')::boolean = false, 'First atomic preseed was unexpectedly marked as replayed.');
  perform pg_temp.nv1_recipe_preseed_assert((v_retry->>'reused')::boolean = true, 'Retry did not converge through replay authority.');

  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from public.nutrition_recipes where id = v_recipe_id and user_id = 'f3280000-0000-4000-8000-000000000001'),
    'Atomic preseed did not create exactly one owner-scoped Recipe root.'
  );
  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from public.nutrition_recipe_drafts where id = v_draft_id and recipe_id = v_recipe_id and user_id = 'f3280000-0000-4000-8000-000000000001'),
    'Atomic preseed did not create exactly one owner-scoped Working Draft.'
  );
  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from public.nutrition_recipe_ingredients where recipe_draft_id = v_draft_id and user_id = 'f3280000-0000-4000-8000-000000000001' and position = 0 and ingredient_name = 'Atomic chicken' and quantity = 2 and unit = '100 g'),
    'Atomic preseed did not create exactly one frozen first ingredient.'
  );

  begin
    perform public.create_preseeded_nutrition_recipe_draft(
      v_operation_id,
      jsonb_set(v_ingredient, '{quantity}', '3'::jsonb)
    );
    raise exception 'Reusing a Recipe creation Operation ID with different input unexpectedly succeeded.';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.create_preseeded_nutrition_recipe_draft(
      'f3280000-0000-4000-8000-000000000004',
      jsonb_set(v_ingredient, '{food_id}', '"f3280000-0000-4000-8000-000000000099"'::jsonb)
    );
    raise exception 'Unowned or unavailable Food unexpectedly seeded a Recipe.';
  exception when invalid_parameter_value then
    null;
  end;

  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from public.nutrition_recipes where user_id = 'f3280000-0000-4000-8000-000000000001'),
    'Rejected replay or unavailable Food created another Recipe root.'
  );
  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from public.nutrition_recipe_ingredients where recipe_draft_id = v_draft_id),
    'Rejected replay or unavailable Food changed the preseeded ingredient graph.'
  );
end
$owner$;

reset role;

do $ledger$
begin
  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from private.nutrition_recipe_creation_operations where user_id = 'f3280000-0000-4000-8000-000000000001' and operation_id = 'f3280000-0000-4000-8000-000000000002'),
    'Atomic Recipe creation replay ledger did not retain exactly one operation record.'
  );
  perform pg_temp.nv1_recipe_preseed_assert(
    (select count(*) = 1 from private.nutrition_recipe_creation_operations where user_id = 'f3280000-0000-4000-8000-000000000001'),
    'Rejected unavailable Food unexpectedly created a replay-ledger record.'
  );
end
$ledger$;

rollback;
