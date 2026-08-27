-- Disposable integration verification for Nutrition V1 long-term architectural corrections.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_long_term_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_long_term_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_long_term_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_long_term_rejected(text, text) to public;

do $catalog$
declare
  v_food regprocedure := to_regprocedure('public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)');
  v_start_over regprocedure := to_regprocedure('public.start_over_nutrition_cooking_session(uuid,timestamp with time zone)');
  v_create_recipe regprocedure := to_regprocedure('public.create_nutrition_recipe_draft(text,numeric,numeric,integer,text,jsonb)');
begin
  perform pg_temp.nv1_long_term_assert(v_food is not null, 'Nutrition V1 authoritative Food Library RPC missing.');
  perform pg_temp.nv1_long_term_assert(v_start_over is not null, 'Nutrition V1 atomic Start Over RPC missing.');
  perform pg_temp.nv1_long_term_assert(v_create_recipe is not null, 'Nutrition V1 atomic initial Recipe RPC missing.');

  perform pg_temp.nv1_long_term_assert(
    (select prosecdef from pg_proc where oid = v_food)
    and (select prosecdef from pg_proc where oid = v_start_over)
    and (select prosecdef from pg_proc where oid = v_create_recipe),
    'Nutrition V1 long-term RPCs must use explicit owner-derived security-definer authority.'
  );

  perform pg_temp.nv1_long_term_assert(
    has_function_privilege('authenticated', v_food, 'EXECUTE')
    and has_function_privilege('authenticated', v_start_over, 'EXECUTE')
    and has_function_privilege('authenticated', v_create_recipe, 'EXECUTE')
    and not has_function_privilege('anon', v_food, 'EXECUTE')
    and not has_function_privilege('anon', v_start_over, 'EXECUTE')
    and not has_function_privilege('anon', v_create_recipe, 'EXECUTE'),
    'Nutrition V1 long-term RPC execute grants invalid.'
  );

  perform pg_temp.nv1_long_term_assert(
    (select count(*) = 1 from cron.job where jobname = 'nutrition-v1-retention-purge-hourly' and active),
    'Nutrition V1 automatic retention purge scheduler missing or duplicated.'
  );
  perform pg_temp.nv1_long_term_assert(
    (select command like '%purge_expired_nutrition_reusable_sources%' from cron.job where jobname = 'nutrition-v1-retention-purge-hourly'),
    'Nutrition V1 retention scheduler does not invoke the canonical purge function.'
  );
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b2700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-long-term-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

-- 101 eligible rows prove that filtering and keyset paging operate over the
-- authoritative catalog rather than an arbitrary pre-filter candidate window.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  category, cuisine, nutrition_basis_amount, nutrition_basis_unit,
  is_global, lifecycle_status
)
select
  ('c0000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'LT Catalog ' || lpad(series::text, 3, '0'),
  '100 g', 120, 25, 4, 2,
  'LT scalable', 'LT cuisine', 100, 'g', true, 'active'
from generate_series(1, 101) as series;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $food_paging$
declare
  v_page jsonb;
  v_cursor text := null;
  v_page_number integer;
begin
  for v_page_number in 1..5 loop
    v_page := public.search_nutrition_food_library(
      '', 'en', v_cursor, 20, 'LT scalable', 'LT cuisine', 'all',
      '{"protein":{"operator":"gte","value":20}}'::jsonb
    );
    perform pg_temp.nv1_long_term_assert(
      jsonb_array_length(v_page->'items') = 20,
      format('Nutrition V1 Food Library page %s did not retain the approved 20-result scale.', v_page_number)
    );
    if v_page_number < 5 then
      perform pg_temp.nv1_long_term_assert(v_page->>'nextCursor' is not null, 'Nutrition V1 Food Library keyset cursor ended too early.');
    end if;
    v_cursor := v_page->>'nextCursor';
  end loop;

  perform pg_temp.nv1_long_term_assert(
    exists (
      select 1
      from jsonb_array_elements(v_page->'items') item
      where item->>'id' = 'c0000000-0000-4000-8000-000000000081'
    ),
    'Nutrition V1 Food Library could not discover/page the valid 81st catalog match.'
  );
end
$food_paging$;

-- Start Over failure injection: the invalid action key fails after the parent
-- transition point, and the function-level transaction must roll everything back.
insert into public.nutrition_cooking_sessions (
  id, user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot,
  serving_scale, current_action_key, status, state_revision
) values (
  'b2700000-0000-4000-8000-000000000010',
  'b2700000-0000-4000-8000-000000000001',
  'b2700000-0000-4000-8000-000000000020',
  'b2700000-0000-4000-8000-000000000021',
  '{"schemaVersion":1,"recipe":{"name":"Broken restart"},"ingredients":[],"actions":[{"id":"","dependency_action_ids":[]}],"equipment":[]}'::jsonb,
  1, null, 'active', 0
);

select pg_temp.nv1_long_term_rejected(
  $$select public.start_over_nutrition_cooking_session(
    'b2700000-0000-4000-8000-000000000010', '2026-08-27T10:30:00Z'
  )$$,
  'Nutrition V1 Start Over accepted a replacement whose required initial action state could not be created.'
);
select pg_temp.nv1_long_term_assert(
  (select status = 'active' and ended_at is null from public.nutrition_cooking_sessions where id = 'b2700000-0000-4000-8000-000000000010')
  and not exists (
    select 1 from public.nutrition_cooking_sessions
    where restart_parent_session_id = 'b2700000-0000-4000-8000-000000000010'
  ),
  'Nutrition V1 Start Over left an ended old session or partial replacement after injected failure.'
);

insert into public.nutrition_cooking_sessions (
  id, user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot,
  serving_scale, current_action_key, status, state_revision
) values (
  'b2700000-0000-4000-8000-000000000011',
  'b2700000-0000-4000-8000-000000000001',
  'b2700000-0000-4000-8000-000000000022',
  'b2700000-0000-4000-8000-000000000023',
  '{"schemaVersion":1,"recipe":{"name":"Valid restart"},"ingredients":[],"actions":[{"id":"step-1","dependency_action_ids":[]},{"id":"step-2","dependency_action_ids":["step-1"]}],"equipment":[]}'::jsonb,
  1, 'step-1', 'active', 0
);

do $start_over$
declare
  v_first jsonb;
  v_second jsonb;
  v_replacement_id uuid;
begin
  v_first := public.start_over_nutrition_cooking_session(
    'b2700000-0000-4000-8000-000000000011', '2026-08-27T10:31:00Z'
  );
  v_second := public.start_over_nutrition_cooking_session(
    'b2700000-0000-4000-8000-000000000011', '2026-08-27T10:31:01Z'
  );
  v_replacement_id := (v_first->>'sessionId')::uuid;

  perform pg_temp.nv1_long_term_assert(v_second->>'sessionId' = v_first->>'sessionId', 'Duplicate Start Over did not converge on the same replacement session.');
  perform pg_temp.nv1_long_term_assert(
    (select count(*) = 1 from public.nutrition_cooking_sessions where restart_parent_session_id = 'b2700000-0000-4000-8000-000000000011'),
    'Duplicate Start Over created inconsistent replacement sessions.'
  );
  perform pg_temp.nv1_long_term_assert(
    (select count(*) = 2 from public.nutrition_cooking_action_states where session_id = v_replacement_id),
    'Restarted Cooking Session exists without its complete required initial state.'
  );
  perform pg_temp.nv1_long_term_assert(
    (select status = 'ended' from public.nutrition_cooking_sessions where id = 'b2700000-0000-4000-8000-000000000011'),
    'Canonical Start Over did not terminally transition the source session.'
  );
end
$start_over$;

-- Initial Recipe + Working Draft failure injection. A failing child constraint
-- must roll back the root insert from the same RPC transaction.
select pg_temp.nv1_long_term_rejected(
  $$select public.create_nutrition_recipe_draft(
    'LT atomic failed recipe', -1, null, null, null, '{}'::jsonb
  )$$,
  'Nutrition V1 initial Recipe RPC accepted an invalid Working Draft.'
);
select pg_temp.nv1_long_term_assert(
  not exists (select 1 from public.nutrition_recipes where name = 'LT atomic failed recipe'),
  'Nutrition V1 failed initial Working Draft left a partial Recipe root behind.'
);

do $recipe_create$
declare
  v_created jsonb;
  v_recipe_id uuid;
  v_draft_id uuid;
begin
  v_created := public.create_nutrition_recipe_draft(
    'LT atomic valid recipe', 2, null, 15, 'fixture', '{"fixture":true}'::jsonb
  );
  v_recipe_id := (v_created->>'recipeId')::uuid;
  v_draft_id := (v_created->>'draftId')::uuid;
  perform pg_temp.nv1_long_term_assert(
    exists (select 1 from public.nutrition_recipes where id = v_recipe_id)
    and exists (select 1 from public.nutrition_recipe_drafts where id = v_draft_id and recipe_id = v_recipe_id),
    'Nutrition V1 atomic initial Recipe RPC did not create the root and Working Draft together.'
  );
end
$recipe_create$;

reset role;

-- Frozen downstream consumers intentionally retain lineage IDs/snapshots without
-- FKs to purgeable reusable-source roots. The scheduled purge must not erase them.
insert into public.nutrition_recipes (
  id, user_id, name, deleted_at, purge_after
) values (
  'b2700000-0000-4000-8000-000000000050',
  'b2700000-0000-4000-8000-000000000001',
  'LT expired recipe', now() - interval '31 days', now() - interval '1 hour'
);
insert into public.nutrition_saved_meals (
  id, user_id, name, deleted_at, purge_after
) values (
  'b2700000-0000-4000-8000-000000000060',
  'b2700000-0000-4000-8000-000000000001',
  'LT expired saved meal', now() - interval '31 days', now() - interval '1 hour'
);
insert into public.nutrition_meal_plan_weeks (
  id, user_id, week_start_date
) values (
  'b2700000-0000-4000-8000-000000000070',
  'b2700000-0000-4000-8000-000000000001',
  '2026-08-24'
);
insert into public.nutrition_planned_occurrences (
  id, week_id, user_id, plan_date, meal_slot_key, position, source_type,
  source_id, source_version_id, frozen_name, frozen_snapshot
) values
(
  'b2700000-0000-4000-8000-000000000071',
  'b2700000-0000-4000-8000-000000000070',
  'b2700000-0000-4000-8000-000000000001',
  '2026-08-24', 'lunch', 0, 'recipe',
  'b2700000-0000-4000-8000-000000000050',
  'b2700000-0000-4000-8000-000000000051',
  'Frozen expired recipe', '{"name":"Frozen expired recipe","calories":500}'::jsonb
),
(
  'b2700000-0000-4000-8000-000000000072',
  'b2700000-0000-4000-8000-000000000070',
  'b2700000-0000-4000-8000-000000000001',
  '2026-08-24', 'dinner', 0, 'saved_meal',
  'b2700000-0000-4000-8000-000000000060', null,
  'Frozen expired saved meal', '{"name":"Frozen expired saved meal","calories":700}'::jsonb
);
insert into public.nutrition_log_groups (
  id, user_id, log_date, meal_type, operation_id, source_type,
  source_id, source_version_id, frozen_snapshot
) values
(
  'b2700000-0000-4000-8000-000000000080',
  'b2700000-0000-4000-8000-000000000001',
  '2026-08-24', 'lunch', 'b2700000-0000-4000-8000-000000000081',
  'recipe', 'b2700000-0000-4000-8000-000000000050',
  'b2700000-0000-4000-8000-000000000051',
  '{"name":"Frozen history recipe","calories":500}'::jsonb
),
(
  'b2700000-0000-4000-8000-000000000082',
  'b2700000-0000-4000-8000-000000000001',
  '2026-08-24', 'dinner', 'b2700000-0000-4000-8000-000000000083',
  'saved_meal', 'b2700000-0000-4000-8000-000000000060', null,
  '{"name":"Frozen history saved meal","calories":700}'::jsonb
);

select public.purge_expired_nutrition_reusable_sources();

select pg_temp.nv1_long_term_assert(
  not exists (select 1 from public.nutrition_recipes where id = 'b2700000-0000-4000-8000-000000000050')
  and not exists (select 1 from public.nutrition_saved_meals where id = 'b2700000-0000-4000-8000-000000000060'),
  'Nutrition V1 retention purge did not permanently remove expired reusable-source roots.'
);
select pg_temp.nv1_long_term_assert(
  (select count(*) = 2 from public.nutrition_planned_occurrences where week_id = 'b2700000-0000-4000-8000-000000000070')
  and (select count(*) = 2 from public.nutrition_log_groups where id in ('b2700000-0000-4000-8000-000000000080','b2700000-0000-4000-8000-000000000082')),
  'Frozen Meal Plan or Diary/history consumers were lost when reusable sources were purged.'
);
select pg_temp.nv1_long_term_assert(
  (select frozen_snapshot->>'name' = 'Frozen expired recipe' from public.nutrition_planned_occurrences where id = 'b2700000-0000-4000-8000-000000000071')
  and (select frozen_snapshot->>'name' = 'Frozen history saved meal' from public.nutrition_log_groups where id = 'b2700000-0000-4000-8000-000000000082'),
  'Frozen downstream Nutrition snapshots changed after source purge.'
);

rollback;
