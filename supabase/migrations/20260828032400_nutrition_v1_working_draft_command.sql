begin;

-- Published Recipe -> Working Draft is one owner-scoped transaction.
-- The application resolves a cloned graph with fresh IDs, while PostgreSQL owns
-- the race check, source-version validation, draft creation, and all child writes.
create or replace function public.create_nutrition_recipe_working_draft(
  p_recipe_id uuid,
  p_base_recipe_version_id uuid,
  p_ingredients jsonb default '[]'::jsonb,
  p_actions jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_version public.nutrition_recipe_versions%rowtype;
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_item jsonb;
  v_dependencies uuid[];
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_recipe_id is null or p_base_recipe_version_id is null then
    raise exception 'Published Recipe source is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_equipment, '[]'::jsonb)) <> 'array' then
    raise exception 'Working Draft graph must be arrays.' using errcode = '22023';
  end if;

  -- Serialize creation for one Recipe and reject deleted/foreign roots before
  -- exposing whether a draft or version exists.
  perform 1
  from public.nutrition_recipes
  where id = p_recipe_id
    and user_id = v_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Recipe not found.' using errcode = 'P0002';
  end if;

  -- Concurrent/retried POSTs converge on the already-created Working Draft.
  select * into v_draft
  from public.nutrition_recipe_drafts
  where recipe_id = p_recipe_id
    and user_id = v_user_id;
  if found then
    return jsonb_build_object(
      'recipeId', p_recipe_id,
      'draftId', v_draft.id,
      'created', false
    );
  end if;

  -- A stale client must not clone an older publication after a newer immutable
  -- Recipe version has become current.
  select * into v_version
  from public.nutrition_recipe_versions
  where recipe_id = p_recipe_id
    and user_id = v_user_id
  order by version_number desc
  limit 1;
  if not found then
    raise exception 'Published Recipe version not found.' using errcode = 'P0002';
  end if;
  if v_version.id <> p_base_recipe_version_id then
    raise exception 'Published Recipe version changed; reload before editing.' using errcode = '40001';
  end if;

  insert into public.nutrition_recipe_drafts (
    recipe_id,
    user_id,
    base_recipe_version_id,
    name,
    servings,
    total_cooked_weight_g,
    total_time_minutes,
    notes,
    draft_metadata
  ) values (
    p_recipe_id,
    v_user_id,
    v_version.id,
    v_version.name,
    v_version.servings,
    v_version.total_cooked_weight_g,
    v_version.total_time_minutes,
    v_version.notes,
    coalesce(v_version.metadata, '{}'::jsonb)
  )
  returning * into v_draft;

  for v_item in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    insert into public.nutrition_recipe_ingredients (
      id, user_id, recipe_version_id, recipe_draft_id, position,
      food_id, ingredient_name, quantity, unit, frozen_nutrition
    ) values (
      (v_item->>'id')::uuid,
      v_user_id,
      null,
      v_draft.id,
      (v_item->>'position')::integer,
      nullif(v_item->>'food_id', '')::uuid,
      btrim(v_item->>'ingredient_name'),
      nullif(v_item->>'quantity', '')::numeric,
      nullif(btrim(coalesce(v_item->>'unit', '')), ''),
      case
        when v_item ? 'frozen_nutrition' and v_item->'frozen_nutrition' <> 'null'::jsonb
          then v_item->'frozen_nutrition'
        else null
      end
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb))
  loop
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_dependencies
    from jsonb_array_elements_text(coalesce(v_item->'dependency_action_ids', '[]'::jsonb));

    insert into public.nutrition_recipe_actions (
      id, user_id, recipe_version_id, recipe_draft_id, position,
      instruction, ingredient_refs, equipment_refs, duration_seconds,
      heat_or_temperature, doneness_or_result_cue, prep_ahead_cue,
      track_key, dependency_action_ids, can_run_in_background, metadata
    ) values (
      (v_item->>'id')::uuid,
      v_user_id,
      null,
      v_draft.id,
      (v_item->>'position')::integer,
      btrim(v_item->>'instruction'),
      coalesce(v_item->'ingredient_refs', '[]'::jsonb),
      coalesce(v_item->'equipment_refs', '[]'::jsonb),
      nullif(v_item->>'duration_seconds', '')::integer,
      nullif(btrim(coalesce(v_item->>'heat_or_temperature', '')), ''),
      nullif(btrim(coalesce(v_item->>'doneness_or_result_cue', '')), ''),
      nullif(btrim(coalesce(v_item->>'prep_ahead_cue', '')), ''),
      nullif(btrim(coalesce(v_item->>'track_key', '')), ''),
      v_dependencies,
      coalesce((v_item->>'can_run_in_background')::boolean, false),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb))
  loop
    insert into public.nutrition_recipe_equipment (
      id, user_id, recipe_version_id, recipe_draft_id, position,
      name, quantity, note
    ) values (
      (v_item->>'id')::uuid,
      v_user_id,
      null,
      v_draft.id,
      (v_item->>'position')::integer,
      btrim(v_item->>'name'),
      nullif(v_item->>'quantity', '')::numeric,
      nullif(btrim(coalesce(v_item->>'note', '')), '')
    );
  end loop;

  return jsonb_build_object(
    'recipeId', p_recipe_id,
    'draftId', v_draft.id,
    'created', true
  );
end
$function$;

revoke all on function public.create_nutrition_recipe_working_draft(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_nutrition_recipe_working_draft(uuid, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
