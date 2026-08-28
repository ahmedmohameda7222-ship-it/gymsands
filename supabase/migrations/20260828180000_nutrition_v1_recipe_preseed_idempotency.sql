begin;

-- Nutrition V1 Food -> New Recipe closure.
-- A new Recipe root, Working Draft, first ingredient, and replay authority are
-- committed by one database transaction. Ambiguous retries with the same
-- owner/operation ID converge on the original result; reusing an operation ID
-- for different input is rejected.

create table if not exists private.nutrition_recipe_creation_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  recipe_id uuid not null,
  draft_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint nutrition_recipe_creation_operations_recipe_owner_fkey
    foreign key (recipe_id, user_id)
    references public.nutrition_recipes(id, user_id)
    on delete cascade
);

comment on table private.nutrition_recipe_creation_operations is
  'Owner-scoped replay ledger for atomic Food -> New Recipe Working Draft creation. Stores only a request hash and minimized result identity.';

create or replace function public.create_preseeded_nutrition_recipe_draft(
  p_operation_id uuid,
  p_ingredient jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request_hash text;
  v_existing private.nutrition_recipe_creation_operations%rowtype;
  v_recipe public.nutrition_recipes%rowtype;
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_food_id uuid;
  v_name text;
  v_quantity numeric;
  v_unit text;
  v_frozen_nutrition jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'Recipe creation Operation ID is required.' using errcode = '22023';
  end if;
  if p_ingredient is null or jsonb_typeof(p_ingredient) <> 'object' then
    raise exception 'Recipe preseed ingredient must be an object.' using errcode = '22023';
  end if;

  begin
    v_food_id := nullif(p_ingredient->>'food_id', '')::uuid;
  exception when others then
    raise exception 'Recipe preseed Food ID is invalid.' using errcode = '22023';
  end;
  v_name := nullif(btrim(p_ingredient->>'ingredient_name'), '');
  begin
    v_quantity := nullif(p_ingredient->>'quantity', '')::numeric;
  exception when others then
    raise exception 'Recipe preseed quantity is invalid.' using errcode = '22023';
  end;
  v_unit := nullif(btrim(p_ingredient->>'unit'), '');
  v_frozen_nutrition := p_ingredient->'frozen_nutrition';

  if v_food_id is null or v_name is null or v_quantity is null or v_quantity <= 0 or v_unit is null then
    raise exception 'Recipe preseed ingredient is incomplete.' using errcode = '22023';
  end if;
  if v_frozen_nutrition is not null
     and v_frozen_nutrition <> 'null'::jsonb
     and jsonb_typeof(v_frozen_nutrition) <> 'object' then
    raise exception 'Recipe preseed frozen nutrition must be an object or null.' using errcode = '22023';
  end if;

  v_request_hash := encode(
    extensions.digest(convert_to(p_ingredient::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize the owner/operation namespace before checking the ledger. This
  -- prevents concurrent first attempts from creating two roots before either
  -- transaction can publish its replay record.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );

  select * into v_existing
  from private.nutrition_recipe_creation_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'Recipe creation Operation ID was already used with different input.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'recipeId', v_existing.recipe_id,
      'draftId', v_existing.draft_id,
      'reused', true
    );
  end if;

  insert into public.nutrition_recipes (user_id, name)
  values (v_user_id, 'Untitled Recipe')
  returning * into v_recipe;

  insert into public.nutrition_recipe_drafts (
    recipe_id, user_id, base_recipe_version_id, name, servings,
    total_cooked_weight_g, total_time_minutes, notes, draft_metadata
  ) values (
    v_recipe.id, v_user_id, null, null, null,
    null, null, null, '{}'::jsonb
  ) returning * into v_draft;

  insert into public.nutrition_recipe_ingredients (
    user_id, recipe_version_id, recipe_draft_id, position,
    food_id, ingredient_name, quantity, unit, frozen_nutrition
  ) values (
    v_user_id, null, v_draft.id, 0,
    v_food_id, v_name, v_quantity, v_unit,
    case when v_frozen_nutrition = 'null'::jsonb then null else v_frozen_nutrition end
  );

  insert into private.nutrition_recipe_creation_operations (
    user_id, operation_id, request_hash, recipe_id, draft_id
  ) values (
    v_user_id, p_operation_id, v_request_hash, v_recipe.id, v_draft.id
  );

  return jsonb_build_object(
    'recipeId', v_recipe.id,
    'draftId', v_draft.id,
    'reused', false
  );
end
$function$;

revoke all on function public.create_preseeded_nutrition_recipe_draft(uuid, jsonb) from public, anon;
grant execute on function public.create_preseeded_nutrition_recipe_draft(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
