-- Disposable verification for Nutrition V1 Saved Meal creation uncertain-completion replay.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_saved_meal_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

grant execute on function pg_temp.nv1_saved_meal_assert(boolean, text) to public;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  'f3290000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-saved-meal-owner-a@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
),
(
  'f3290000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'nutrition-saved-meal-owner-b@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3290000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $owner_a$
declare
  v_operation_id uuid := 'f3290000-0000-4000-8000-000000000010';
  v_failed_operation_id uuid := 'f3290000-0000-4000-8000-000000000011';
  v_items jsonb := '[{"kind":"food","food_id":"f3290000-0000-4000-8000-000000000020","frozen_name":"Greek yogurt","resolved_quantity":2,"resolved_serving_label":"170 g","frozen_nutrition":{"calories":260,"protein_g":36}}]'::jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_saved_meal_id uuid;
begin
  v_first := public.create_nutrition_saved_meal_idempotent(v_operation_id, 'Breakfast', null, false, v_items);
  v_retry := public.create_nutrition_saved_meal_idempotent(v_operation_id, 'Breakfast', null, false, v_items);
  v_saved_meal_id := (v_first->>'id')::uuid;

  perform pg_temp.nv1_saved_meal_assert(v_saved_meal_id is not null, 'Saved Meal create did not return an ID.');
  perform pg_temp.nv1_saved_meal_assert(v_retry->>'id' = v_first->>'id', 'Exact replay returned a different Saved Meal.');
  perform pg_temp.nv1_saved_meal_assert((v_first->>'reused')::boolean = false, 'First Saved Meal create was unexpectedly marked replayed.');
  perform pg_temp.nv1_saved_meal_assert((v_retry->>'reused')::boolean = true, 'Exact Saved Meal retry did not converge through replay authority.');
  perform pg_temp.nv1_saved_meal_assert(
    (select count(*) = 1 from public.nutrition_saved_meals where id = v_saved_meal_id and user_id = 'f3290000-0000-4000-8000-000000000001'),
    'Exact retry created more than one owner-scoped Saved Meal root.'
  );
  perform pg_temp.nv1_saved_meal_assert(
    (select count(*) = 1 from public.nutrition_saved_meal_items where saved_meal_id = v_saved_meal_id and user_id = 'f3290000-0000-4000-8000-000000000001'),
    'Exact retry changed the atomic Saved Meal item set.'
  );

  begin
    perform public.create_nutrition_saved_meal_idempotent(v_operation_id, 'Different breakfast', null, false, v_items);
    raise exception 'Reusing a Saved Meal operation ID with different input unexpectedly succeeded.';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.create_nutrition_saved_meal_idempotent(
      v_failed_operation_id,
      'Broken meal',
      null,
      false,
      '[{"kind":"saved_meal"}]'::jsonb
    );
    raise exception 'Invalid Saved Meal create unexpectedly succeeded.';
  exception when invalid_parameter_value then
    null;
  end;
end
$owner_a$;

reset role;

do $owner_a_ledger$
begin
  perform pg_temp.nv1_saved_meal_assert(
    (select count(*) = 1 from private.nutrition_saved_meal_creation_operations where user_id = 'f3290000-0000-4000-8000-000000000001' and operation_id = 'f3290000-0000-4000-8000-000000000010'),
    'Owner A replay ledger did not retain exactly one successful operation.'
  );
  perform pg_temp.nv1_saved_meal_assert(
    not exists (select 1 from private.nutrition_saved_meal_creation_operations where user_id = 'f3290000-0000-4000-8000-000000000001' and operation_id = 'f3290000-0000-4000-8000-000000000011'),
    'Failed Saved Meal create left replay residue.'
  );
end
$owner_a_ledger$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3290000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $owner_b$
declare
  v_result jsonb;
begin
  v_result := public.create_nutrition_saved_meal_idempotent(
    'f3290000-0000-4000-8000-000000000010',
    'Breakfast',
    null,
    false,
    '[{"kind":"food","food_id":"f3290000-0000-4000-8000-000000000020","frozen_name":"Greek yogurt","resolved_quantity":2,"resolved_serving_label":"170 g","frozen_nutrition":{"calories":260,"protein_g":36}}]'::jsonb
  );
  perform pg_temp.nv1_saved_meal_assert((v_result->>'id')::uuid is not null, 'Owner B could not use the same operation UUID in its own namespace.');
  perform pg_temp.nv1_saved_meal_assert(
    not exists (
      select 1
      from public.nutrition_saved_meals a
      join public.nutrition_saved_meals b on a.id = b.id
      where a.user_id = 'f3290000-0000-4000-8000-000000000001'
        and b.user_id = 'f3290000-0000-4000-8000-000000000002'
    ),
    'Saved Meal replay result leaked across owners.'
  );
end
$owner_b$;

reset role;

select pg_temp.nv1_saved_meal_assert(
  (select count(*) = 2 from private.nutrition_saved_meal_creation_operations where operation_id = 'f3290000-0000-4000-8000-000000000010'),
  'Owner-scoped operation namespace did not keep one replay row per owner.'
);
select pg_temp.nv1_saved_meal_assert(
  not has_table_privilege('authenticated', 'private.nutrition_saved_meal_creation_operations', 'SELECT'),
  'Authenticated members can read the private Saved Meal replay ledger.'
);
select pg_temp.nv1_saved_meal_assert(
  not has_function_privilege('anon', 'public.create_nutrition_saved_meal_idempotent(uuid,text,text,boolean,jsonb)', 'EXECUTE'),
  'Anonymous role can execute Saved Meal idempotent creation.'
);
select pg_temp.nv1_saved_meal_assert(
  has_function_privilege('authenticated', 'public.create_nutrition_saved_meal_idempotent(uuid,text,text,boolean,jsonb)', 'EXECUTE'),
  'Authenticated role cannot execute Saved Meal idempotent creation.'
);

rollback;
