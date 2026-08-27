-- Disposable verification for Nutrition V1 post-review atomicity corrections.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_review_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_review_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_review_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_review_rejected(text, text) to public;

do $catalog$
declare
  v_cooking regprocedure := to_regprocedure('public.sync_nutrition_cooking_session_state(uuid,bigint,text,timestamp with time zone,jsonb,jsonb)');
  v_recipe regprocedure := to_regprocedure('public.autosave_nutrition_recipe_draft(uuid,jsonb,jsonb,jsonb,jsonb)');
begin
  if v_cooking is null then
    raise exception 'Nutrition V1 cooking atomic sync RPC missing.';
  end if;
  if v_recipe is null then
    raise exception 'Nutrition V1 recipe atomic autosave RPC missing.';
  end if;
  if not (select prosecdef from pg_proc where oid = v_cooking)
     or not (select prosecdef from pg_proc where oid = v_recipe)
     or position('auth.uid()' in pg_get_functiondef(v_cooking)) = 0
     or position('auth.uid()' in pg_get_functiondef(v_recipe)) = 0 then
    raise exception 'Nutrition V1 atomic review RPC owner authority invalid.';
  end if;
  if not has_function_privilege('authenticated', v_cooking, 'EXECUTE')
     or not has_function_privilege('authenticated', v_recipe, 'EXECUTE')
     or not has_function_privilege('service_role', v_cooking, 'EXECUTE')
     or not has_function_privilege('service_role', v_recipe, 'EXECUTE')
     or has_function_privilege('anon', v_cooking, 'EXECUTE')
     or has_function_privilege('anon', v_recipe, 'EXECUTE') then
    raise exception 'Nutrition V1 atomic review RPC execute grants invalid.';
  end if;
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a2700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'nutrition-review-owner@example.invalid', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_cooking_sessions (
  id, user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot, current_action_key, state_revision
) values (
  'a2700000-0000-4000-8000-000000000010',
  'a2700000-0000-4000-8000-000000000001',
  'a2700000-0000-4000-8000-000000000020',
  'a2700000-0000-4000-8000-000000000021',
  '{"schemaVersion":1,"recipe":{"name":"Fixture"},"ingredients":[],"actions":[],"equipment":[]}'::jsonb,
  'step-1', 0
);
insert into public.nutrition_cooking_action_states (
  id, session_id, user_id, action_key, state, state_revision
) values (
  'a2700000-0000-4000-8000-000000000030',
  'a2700000-0000-4000-8000-000000000010',
  'a2700000-0000-4000-8000-000000000001',
  'step-1', 'active', 0
);

select public.sync_nutrition_cooking_session_state(
  'a2700000-0000-4000-8000-000000000010', 0, 'step-1', clock_timestamp(),
  '[{"id":"a2700000-0000-4000-8000-000000000030","action_key":"step-1","state":"completed","state_revision":1,"completed_at":"2026-08-27T06:00:00Z"}]'::jsonb,
  '[]'::jsonb
);
select pg_temp.nv1_review_assert(
  (select state_revision = 1 from public.nutrition_cooking_sessions where id = 'a2700000-0000-4000-8000-000000000010')
  and (select state = 'completed' from public.nutrition_cooking_action_states where id = 'a2700000-0000-4000-8000-000000000030'),
  'Nutrition V1 cooking atomic sync RPC did not persist the complete state.'
);

select pg_temp.nv1_review_rejected(
  $$select public.sync_nutrition_cooking_session_state(
    'a2700000-0000-4000-8000-000000000010', 1, 'step-1', clock_timestamp(),
    '[{"id":"a2700000-0000-4000-8000-000000000030","action_key":"step-1","state":"completed","state_revision":2,"completed_at":"2026-08-27T06:01:00Z"}]'::jsonb,
    '[{"id":"a2700000-0000-4000-8000-000000000040","action_state_id":"a2700000-0000-4000-8000-000000000099","timer_name":"Bad","duration_seconds":60,"status":"idle"}]'::jsonb
  )$$,
  'Nutrition V1 cooking atomic sync RPC accepted an invalid timer owner relation.'
);
select pg_temp.nv1_review_assert(
  (select state_revision = 1 from public.nutrition_cooking_sessions where id = 'a2700000-0000-4000-8000-000000000010'),
  'Nutrition V1 cooking atomic sync RPC failed to roll back its parent revision.'
);

insert into public.nutrition_recipes (id, user_id, name) values (
  'a2700000-0000-4000-8000-000000000050', 'a2700000-0000-4000-8000-000000000001', 'Original recipe'
);
insert into public.nutrition_recipe_drafts (id, recipe_id, user_id, name, servings) values (
  'a2700000-0000-4000-8000-000000000051', 'a2700000-0000-4000-8000-000000000050',
  'a2700000-0000-4000-8000-000000000001', 'Original draft', 2
);
insert into public.nutrition_recipe_ingredients (
  id, user_id, recipe_draft_id, position, ingredient_name, quantity, unit
) values (
  'a2700000-0000-4000-8000-000000000052', 'a2700000-0000-4000-8000-000000000001',
  'a2700000-0000-4000-8000-000000000051', 0, 'Original ingredient', 1, 'g'
);

select pg_temp.nv1_review_rejected(
  $$select public.autosave_nutrition_recipe_draft(
    'a2700000-0000-4000-8000-000000000050',
    '{"name":"Broken replacement","servings":4,"draft_metadata":{}}'::jsonb,
    '[{"ingredient_name":"","quantity":1,"unit":"g"}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb
  )$$,
  'Nutrition V1 recipe atomic autosave RPC accepted an invalid replacement.'
);
select pg_temp.nv1_review_assert(
  (select name = 'Original draft' from public.nutrition_recipe_drafts where id = 'a2700000-0000-4000-8000-000000000051')
  and exists (select 1 from public.nutrition_recipe_ingredients where id = 'a2700000-0000-4000-8000-000000000052' and ingredient_name = 'Original ingredient'),
  'Nutrition V1 recipe atomic autosave RPC failed to preserve the prior valid draft after rejection.'
);

rollback;
