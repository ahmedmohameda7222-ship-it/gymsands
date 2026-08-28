-- Disposable verification for Nutrition V1 Recipe Draft graph identity preservation.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_graph_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

grant execute on function pg_temp.nv1_graph_assert(boolean, text) to public;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f3270000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-graph-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.nutrition_recipes (id, user_id, name) values (
  'f3270000-0000-4000-8000-000000000010',
  'f3270000-0000-4000-8000-000000000001',
  'Graph fixture'
);
insert into public.nutrition_recipe_drafts (
  id, recipe_id, user_id, name, servings, draft_metadata
) values (
  'f3270000-0000-4000-8000-000000000011',
  'f3270000-0000-4000-8000-000000000010',
  'f3270000-0000-4000-8000-000000000001',
  'Graph fixture', 2, '{}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3270000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $owner$
declare
  v_saved jsonb;
  v_ingredients jsonb := '[{"id":"f3270000-0000-4000-8000-000000000020","ingredient_name":"Chicken","quantity":300,"unit":"g","frozen_nutrition":{"calories":495}}]'::jsonb;
  v_equipment jsonb := '[{"id":"f3270000-0000-4000-8000-000000000030","name":"Pan","quantity":1,"note":"heavy"}]'::jsonb;
  v_actions jsonb := '[{"id":"f3270000-0000-4000-8000-000000000040","instruction":"Prepare chicken.","ingredient_refs":[{"ingredient_id":"f3270000-0000-4000-8000-000000000020"}],"equipment_refs":[{"equipment_id":"f3270000-0000-4000-8000-000000000030"}],"duration_seconds":120,"prep_ahead_cue":"Can prep early","track_key":"prep","dependency_action_ids":[],"can_run_in_background":true,"metadata":{"source":"mcp","note":"keep-me"}},{"id":"f3270000-0000-4000-8000-000000000041","instruction":"Cook chicken.","ingredient_refs":["f3270000-0000-4000-8000-000000000020"],"equipment_refs":["f3270000-0000-4000-8000-000000000030"],"duration_seconds":600,"heat_or_temperature":"medium-high","doneness_or_result_cue":"golden","track_key":"main","dependency_action_ids":["f3270000-0000-4000-8000-000000000040"],"can_run_in_background":false,"metadata":{"source":"import","stage":2}}]'::jsonb;
begin
  v_saved := public.autosave_nutrition_recipe_draft(
    'f3270000-0000-4000-8000-000000000010',
    0,
    '{"name":"Graph fixture","servings":2,"draft_metadata":{}}'::jsonb,
    v_ingredients,
    v_actions,
    v_equipment
  );

  perform pg_temp.nv1_graph_assert((v_saved->>'revision')::bigint = 1, 'Initial graph autosave did not advance revision.');
  perform pg_temp.nv1_graph_assert(
    exists (
      select 1 from public.nutrition_recipe_ingredients
      where id = 'f3270000-0000-4000-8000-000000000020'
        and recipe_draft_id = 'f3270000-0000-4000-8000-000000000011'
    ),
    'Submitted ingredient identity was not preserved.'
  );
  perform pg_temp.nv1_graph_assert(
    exists (
      select 1 from public.nutrition_recipe_equipment
      where id = 'f3270000-0000-4000-8000-000000000030'
        and recipe_draft_id = 'f3270000-0000-4000-8000-000000000011'
    ),
    'Submitted equipment identity was not preserved.'
  );
  perform pg_temp.nv1_graph_assert(
    exists (
      select 1 from public.nutrition_recipe_actions
      where id = 'f3270000-0000-4000-8000-000000000041'
        and recipe_draft_id = 'f3270000-0000-4000-8000-000000000011'
        and dependency_action_ids = array['f3270000-0000-4000-8000-000000000040'::uuid]
        and ingredient_refs = '["f3270000-0000-4000-8000-000000000020"]'::jsonb
        and equipment_refs = '["f3270000-0000-4000-8000-000000000030"]'::jsonb
        and track_key = 'main'
        and can_run_in_background = false
        and metadata = '{"source":"import","stage":2}'::jsonb
    ),
    'Structured Recipe action graph was not preserved.'
  );

  v_saved := public.autosave_nutrition_recipe_draft(
    'f3270000-0000-4000-8000-000000000010',
    1,
    '{"name":"Graph fixture renamed","servings":2,"draft_metadata":{}}'::jsonb,
    v_ingredients,
    v_actions,
    v_equipment
  );

  perform pg_temp.nv1_graph_assert((v_saved->>'revision')::bigint = 2, 'Second graph autosave did not advance revision.');
  perform pg_temp.nv1_graph_assert(
    (select count(*) = 2 from public.nutrition_recipe_actions where recipe_draft_id = 'f3270000-0000-4000-8000-000000000011')
    and exists (
      select 1 from public.nutrition_recipe_actions
      where id = 'f3270000-0000-4000-8000-000000000040'
        and track_key = 'prep'
        and can_run_in_background = true
        and metadata = '{"source":"mcp","note":"keep-me"}'::jsonb
    )
    and exists (
      select 1 from public.nutrition_recipe_actions
      where id = 'f3270000-0000-4000-8000-000000000041'
        and dependency_action_ids = array['f3270000-0000-4000-8000-000000000040'::uuid]
    ),
    'Unrelated Draft autosave regenerated child identities or lost structured action data.'
  );

  begin
    perform public.autosave_nutrition_recipe_draft(
      'f3270000-0000-4000-8000-000000000010',
      2,
      '{"name":"Invalid dependency","servings":2,"draft_metadata":{}}'::jsonb,
      v_ingredients,
      '[{"id":"f3270000-0000-4000-8000-000000000041","instruction":"Broken","dependency_action_ids":["f3270000-0000-4000-8000-000000000099"]}]'::jsonb,
      v_equipment
    );
    raise exception 'Dangling Recipe action dependency unexpectedly succeeded.';
  exception when invalid_parameter_value then
    null;
  end;

  perform pg_temp.nv1_graph_assert(
    (select revision = 2 and name = 'Graph fixture renamed' from public.nutrition_recipe_drafts where id = 'f3270000-0000-4000-8000-000000000011'),
    'Rejected dangling dependency modified canonical Draft state.'
  );
end
$owner$;

rollback;
