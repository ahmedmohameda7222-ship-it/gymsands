begin;

-- Nutrition V1 final closure commands.
-- Forward-only and intentionally separate from the earlier pending corrections so
-- migration identity/checksums remain stable throughout independent QA.

-- Recipe cover metadata may only reference the authenticated owner's storage prefix.
alter table public.nutrition_recipes
  drop constraint if exists recipe_cover_path_owner;
alter table public.nutrition_recipes
  add constraint recipe_cover_path_owner
  check (cover_path is null or split_part(cover_path, '/', 1) = user_id::text);

-- Saved Meal create is one atomic root+children transaction.
create or replace function public.create_nutrition_saved_meal(
  p_name text,
  p_note text default null,
  p_is_favorite boolean default false,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_root public.nutrition_saved_meals%rowtype;
  v_item jsonb;
  v_position integer;
  v_kind text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Saved Meal name is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) not between 1 and 100 then
    raise exception 'Saved Meal requires between 1 and 100 items.' using errcode = '22023';
  end if;

  insert into public.nutrition_saved_meals (user_id, name, note, is_favorite)
  values (v_user_id, btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_is_favorite, false))
  returning * into v_root;

  for v_item, v_position in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'food' then
      insert into public.nutrition_saved_meal_items (
        saved_meal_id, user_id, position, item_type, food_id,
        recipe_id, recipe_version_id, resolved_quantity,
        resolved_serving_label, frozen_name, frozen_snapshot
      ) values (
        v_root.id,
        v_user_id,
        v_position,
        'food',
        (v_item->>'food_id')::uuid,
        null,
        null,
        (v_item->>'resolved_quantity')::numeric,
        btrim(v_item->>'resolved_serving_label'),
        btrim(v_item->>'frozen_name'),
        v_item
      );
    elsif v_kind = 'recipe' then
      insert into public.nutrition_saved_meal_items (
        saved_meal_id, user_id, position, item_type, food_id,
        recipe_id, recipe_version_id, resolved_quantity,
        resolved_serving_label, frozen_name, frozen_snapshot
      ) values (
        v_root.id,
        v_user_id,
        v_position,
        'recipe',
        null,
        (v_item->'recipe'->>'recipe_id')::uuid,
        (v_item->'recipe'->>'recipe_version_id')::uuid,
        (v_item->'recipe'->>'resolved_serving_quantity')::numeric,
        btrim(v_item->'recipe'->>'resolved_serving_label'),
        btrim(v_item->'recipe'->>'frozen_recipe_name'),
        v_item
      );
    else
      raise exception 'Saved Meal items must be Food or Recipe snapshots.' using errcode = '22023';
    end if;
  end loop;

  return to_jsonb(v_root);
end
$function$;

-- Saved Meal edit locks the root and atomically replaces its future reusable bundle.
create or replace function public.update_nutrition_saved_meal(
  p_saved_meal_id uuid,
  p_name text,
  p_note text default null,
  p_is_favorite boolean default false,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_root public.nutrition_saved_meals%rowtype;
  v_item jsonb;
  v_position integer;
  v_kind text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_saved_meal_id is null then
    raise exception 'Saved Meal ID is required.' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Saved Meal name is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) not between 1 and 100 then
    raise exception 'Saved Meal requires between 1 and 100 items.' using errcode = '22023';
  end if;

  select * into v_root
  from public.nutrition_saved_meals
  where id = p_saved_meal_id
    and user_id = v_user_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Saved Meal not found.' using errcode = 'P0002';
  end if;

  update public.nutrition_saved_meals
  set name = btrim(p_name),
      note = nullif(btrim(coalesce(p_note, '')), ''),
      is_favorite = coalesce(p_is_favorite, false)
  where id = p_saved_meal_id and user_id = v_user_id
  returning * into v_root;

  delete from public.nutrition_saved_meal_items
  where saved_meal_id = p_saved_meal_id and user_id = v_user_id;

  for v_item, v_position in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'food' then
      insert into public.nutrition_saved_meal_items (
        saved_meal_id, user_id, position, item_type, food_id,
        recipe_id, recipe_version_id, resolved_quantity,
        resolved_serving_label, frozen_name, frozen_snapshot
      ) values (
        v_root.id, v_user_id, v_position, 'food',
        (v_item->>'food_id')::uuid, null, null,
        (v_item->>'resolved_quantity')::numeric,
        btrim(v_item->>'resolved_serving_label'),
        btrim(v_item->>'frozen_name'), v_item
      );
    elsif v_kind = 'recipe' then
      insert into public.nutrition_saved_meal_items (
        saved_meal_id, user_id, position, item_type, food_id,
        recipe_id, recipe_version_id, resolved_quantity,
        resolved_serving_label, frozen_name, frozen_snapshot
      ) values (
        v_root.id, v_user_id, v_position, 'recipe', null,
        (v_item->'recipe'->>'recipe_id')::uuid,
        (v_item->'recipe'->>'recipe_version_id')::uuid,
        (v_item->'recipe'->>'resolved_serving_quantity')::numeric,
        btrim(v_item->'recipe'->>'resolved_serving_label'),
        btrim(v_item->'recipe'->>'frozen_recipe_name'), v_item
      );
    else
      raise exception 'Saved Meal items must be Food or Recipe snapshots.' using errcode = '22023';
    end if;
  end loop;

  return to_jsonb(v_root);
end
$function$;

-- Recipe duplication accepts a client-resolved clone graph but commits the new
-- root, draft, and every child row as one PostgreSQL transaction.
create or replace function public.duplicate_nutrition_recipe(
  p_source_recipe_id uuid,
  p_source_version_id uuid,
  p_name text,
  p_servings numeric,
  p_total_cooked_weight_g numeric default null,
  p_total_time_minutes integer default null,
  p_notes text default null,
  p_draft_metadata jsonb default '{}'::jsonb,
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
  v_root public.nutrition_recipes%rowtype;
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_item jsonb;
  v_dependencies uuid[];
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_source_recipe_id is null or p_source_version_id is null then
    raise exception 'Published Recipe source is required.' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Duplicate Recipe name is required.' using errcode = '22023';
  end if;
  if p_servings is null or p_servings <= 0 then
    raise exception 'Recipe servings must be greater than zero.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_equipment, '[]'::jsonb)) <> 'array' then
    raise exception 'Duplicate Recipe graph must be arrays.' using errcode = '22023';
  end if;

  perform 1
  from public.nutrition_recipe_versions version
  join public.nutrition_recipes recipe
    on recipe.id = version.recipe_id and recipe.user_id = version.user_id
  where version.id = p_source_version_id
    and version.recipe_id = p_source_recipe_id
    and version.user_id = v_user_id
    and recipe.deleted_at is null;
  if not found then
    raise exception 'Published Recipe source not found.' using errcode = 'P0002';
  end if;

  insert into public.nutrition_recipes (user_id, name, is_favorite)
  values (v_user_id, btrim(p_name), false)
  returning * into v_root;

  insert into public.nutrition_recipe_drafts (
    recipe_id, user_id, base_recipe_version_id, name, servings,
    total_cooked_weight_g, total_time_minutes, notes, draft_metadata
  ) values (
    v_root.id, v_user_id, null, btrim(p_name), p_servings,
    p_total_cooked_weight_g, p_total_time_minutes, p_notes,
    coalesce(p_draft_metadata, '{}'::jsonb)
  ) returning * into v_draft;

  for v_item in select value from jsonb_array_elements(p_ingredients)
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
      case when v_item ? 'frozen_nutrition' and v_item->'frozen_nutrition' <> 'null'::jsonb then v_item->'frozen_nutrition' else null end
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_actions)
  loop
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_dependencies
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

  for v_item in select value from jsonb_array_elements(p_equipment)
  loop
    insert into public.nutrition_recipe_equipment (
      id, user_id, recipe_version_id, recipe_draft_id, position, name, quantity, note
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

  return jsonb_build_object('recipeId', v_root.id, 'draftId', v_draft.id);
end
$function$;

revoke all on function public.create_nutrition_saved_meal(text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_nutrition_saved_meal(text, text, boolean, jsonb) to authenticated, service_role;
revoke all on function public.update_nutrition_saved_meal(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.update_nutrition_saved_meal(uuid, text, text, boolean, jsonb) to authenticated, service_role;
revoke all on function public.duplicate_nutrition_recipe(uuid, uuid, text, numeric, numeric, integer, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.duplicate_nutrition_recipe(uuid, uuid, text, numeric, numeric, integer, text, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
