-- Nutrition V1 post-review atomicity corrections.
-- Repository-only additive migration. Do not apply to Production without explicit authority.

create or replace function public.sync_nutrition_cooking_session_state(
  p_session_id uuid,
  p_expected_revision bigint,
  p_current_action_key text,
  p_last_active_at timestamptz,
  p_action_states jsonb default '[]'::jsonb,
  p_timers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_next_revision bigint;
  v_item jsonb;
  v_action_id uuid;
  v_action_state_id uuid;
  v_timer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid Cooking Session revision.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_action_states, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_timers, '[]'::jsonb)) <> 'array' then
    raise exception 'Cooking Session state payload must use arrays.' using errcode = '22023';
  end if;

  select state_revision
    into v_current_revision
  from public.nutrition_cooking_sessions
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active'
    and state_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'Cooking Session revision conflict: local state is stale.' using errcode = '40001';
  end if;

  v_next_revision := p_expected_revision + 1;
  update public.nutrition_cooking_sessions
  set current_action_key = p_current_action_key,
      last_active_at = coalesce(p_last_active_at, clock_timestamp()),
      state_revision = v_next_revision
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active'
    and state_revision = p_expected_revision;

  for v_item in select value from jsonb_array_elements(coalesce(p_action_states, '[]'::jsonb)) loop
    v_action_id := nullif(v_item->>'id', '')::uuid;
    update public.nutrition_cooking_action_states
    set state = v_item->>'state',
        state_revision = (v_item->>'state_revision')::bigint,
        activated_at = nullif(v_item->>'activated_at', '')::timestamptz,
        completed_at = nullif(v_item->>'completed_at', '')::timestamptz,
        deferred_at = nullif(v_item->>'deferred_at', '')::timestamptz,
        skipped_at = nullif(v_item->>'skipped_at', '')::timestamptz
    where id = v_action_id
      and session_id = p_session_id
      and user_id = v_user_id
      and action_key = v_item->>'action_key';
    if not found then
      raise exception 'Cooking Session action state does not belong to this session.' using errcode = '42501';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_timers, '[]'::jsonb)) loop
    v_timer_id := nullif(v_item->>'id', '')::uuid;
    v_action_state_id := nullif(v_item->>'action_state_id', '')::uuid;
    perform 1
    from public.nutrition_cooking_action_states
    where id = v_action_state_id
      and session_id = p_session_id
      and user_id = v_user_id;
    if not found then
      raise exception 'Cooking Session timer action state does not belong to this session.' using errcode = '42501';
    end if;

    insert into public.nutrition_cooking_timers (
      id, action_state_id, user_id, timer_name, duration_seconds, status,
      started_at, target_at, paused_at, paused_remaining_seconds, completed_at, cancelled_at
    ) values (
      v_timer_id,
      v_action_state_id,
      v_user_id,
      btrim(v_item->>'timer_name'),
      (v_item->>'duration_seconds')::integer,
      v_item->>'status',
      nullif(v_item->>'started_at', '')::timestamptz,
      nullif(v_item->>'target_at', '')::timestamptz,
      nullif(v_item->>'paused_at', '')::timestamptz,
      nullif(v_item->>'paused_remaining_seconds', '')::integer,
      nullif(v_item->>'completed_at', '')::timestamptz,
      nullif(v_item->>'cancelled_at', '')::timestamptz
    )
    on conflict (id) do update
    set action_state_id = excluded.action_state_id,
        timer_name = excluded.timer_name,
        duration_seconds = excluded.duration_seconds,
        status = excluded.status,
        started_at = excluded.started_at,
        target_at = excluded.target_at,
        paused_at = excluded.paused_at,
        paused_remaining_seconds = excluded.paused_remaining_seconds,
        completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at
    where nutrition_cooking_timers.user_id = v_user_id;
    if not found then
      raise exception 'Cooking Session timer does not belong to this owner.' using errcode = '42501';
    end if;
  end loop;

  return jsonb_build_object('stateRevision', v_next_revision);
end;
$$;

revoke all on function public.sync_nutrition_cooking_session_state(uuid, bigint, text, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.sync_nutrition_cooking_session_state(uuid, bigint, text, timestamptz, jsonb, jsonb) to authenticated, service_role;

create or replace function public.autosave_nutrition_recipe_draft(
  p_recipe_id uuid,
  p_draft jsonb,
  p_ingredients jsonb default '[]'::jsonb,
  p_instructions jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_item jsonb;
  v_position bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_draft, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_instructions, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_equipment, '[]'::jsonb)) <> 'array' then
    raise exception 'Recipe Working Draft autosave payload is invalid.' using errcode = '22023';
  end if;

  perform 1
  from public.nutrition_recipes
  where id = p_recipe_id
    and user_id = v_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Active Recipe not found.' using errcode = 'P0002';
  end if;

  select draft.*
    into v_draft
  from public.nutrition_recipe_drafts draft
  where draft.recipe_id = p_recipe_id
    and draft.user_id = v_user_id
  for update;
  if not found then
    raise exception 'Recipe Working Draft was not found.' using errcode = 'P0002';
  end if;

  update public.nutrition_recipe_drafts draft
  set name = nullif(btrim(p_draft->>'name'), ''),
      servings = nullif(p_draft->>'servings', '')::numeric,
      total_cooked_weight_g = nullif(p_draft->>'total_cooked_weight_g', '')::numeric,
      total_time_minutes = nullif(p_draft->>'total_time_minutes', '')::integer,
      notes = nullif(btrim(p_draft->>'notes'), ''),
      draft_metadata = coalesce(p_draft->'draft_metadata', '{}'::jsonb)
  where draft.id = v_draft.id
    and draft.user_id = v_user_id
  returning draft.* into v_draft;

  delete from public.nutrition_recipe_ingredients
  where recipe_draft_id = v_draft.id and user_id = v_user_id;
  delete from public.nutrition_recipe_actions
  where recipe_draft_id = v_draft.id and user_id = v_user_id;
  delete from public.nutrition_recipe_equipment
  where recipe_draft_id = v_draft.id and user_id = v_user_id;

  for v_item, v_position in
    select value, ordinality - 1
    from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) with ordinality
  loop
    insert into public.nutrition_recipe_ingredients (
      user_id, recipe_version_id, recipe_draft_id, position, food_id, ingredient_name, quantity, unit, frozen_nutrition
    ) values (
      v_user_id, null, v_draft.id, v_position::integer, nullif(v_item->>'food_id', '')::uuid,
      btrim(v_item->>'ingredient_name'), nullif(v_item->>'quantity', '')::numeric,
      nullif(btrim(v_item->>'unit'), ''),
      case when jsonb_typeof(v_item->'frozen_nutrition') = 'null' then null else v_item->'frozen_nutrition' end
    );
  end loop;

  for v_item, v_position in
    select value, ordinality - 1
    from jsonb_array_elements(coalesce(p_instructions, '[]'::jsonb)) with ordinality
  loop
    insert into public.nutrition_recipe_actions (
      user_id, recipe_version_id, recipe_draft_id, position, instruction, ingredient_refs, equipment_refs,
      duration_seconds, heat_or_temperature, doneness_or_result_cue, prep_ahead_cue, track_key,
      dependency_action_ids, can_run_in_background, metadata
    ) values (
      v_user_id, null, v_draft.id, v_position::integer, btrim(v_item->>'instruction'),
      coalesce(v_item->'ingredient_refs', '[]'::jsonb), coalesce(v_item->'equipment_refs', '[]'::jsonb),
      nullif(v_item->>'duration_seconds', '')::integer, nullif(btrim(v_item->>'heat_or_temperature'), ''),
      nullif(btrim(v_item->>'doneness_or_result_cue'), ''), nullif(btrim(v_item->>'prep_ahead_cue'), ''),
      nullif(btrim(v_item->>'track_key'), ''),
      coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(v_item->'dependency_action_ids', '[]'::jsonb))), '{}'::uuid[]),
      coalesce((v_item->>'can_run_in_background')::boolean, false), coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_item, v_position in
    select value, ordinality - 1
    from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) with ordinality
  loop
    insert into public.nutrition_recipe_equipment (
      user_id, recipe_version_id, recipe_draft_id, position, name, quantity, note
    ) values (
      v_user_id, null, v_draft.id, v_position::integer, btrim(v_item->>'name'),
      nullif(v_item->>'quantity', '')::numeric, nullif(btrim(v_item->>'note'), '')
    );
  end loop;

  return to_jsonb(v_draft);
end;
$$;

revoke all on function public.autosave_nutrition_recipe_draft(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.autosave_nutrition_recipe_draft(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
