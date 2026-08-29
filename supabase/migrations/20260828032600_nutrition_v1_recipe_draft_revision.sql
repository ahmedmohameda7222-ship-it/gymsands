begin;

alter table public.nutrition_recipe_drafts
add column if not exists revision bigint not null default 0;

alter table public.nutrition_recipe_drafts
drop constraint if exists nutrition_recipe_drafts_revision_check;
alter table public.nutrition_recipe_drafts
add constraint nutrition_recipe_drafts_revision_check check (revision >= 0);

drop function if exists public.autosave_nutrition_recipe_draft(uuid, jsonb, jsonb, jsonb, jsonb);

create function public.autosave_nutrition_recipe_draft(
  p_recipe_id uuid,
  p_expected_revision bigint,
  p_draft jsonb,
  p_ingredients jsonb default '[]'::jsonb,
  p_instructions jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_item jsonb;
  v_position bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Recipe Working Draft expected revision is invalid.' using errcode = '22023';
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

  if v_draft.revision <> p_expected_revision then
    raise exception 'Recipe Working Draft revision conflict: local Draft is stale.' using errcode = '40001';
  end if;

  update public.nutrition_recipe_drafts as draft
  set name = nullif(btrim(p_draft->>'name'), ''),
      servings = nullif(p_draft->>'servings', '')::numeric,
      total_cooked_weight_g = nullif(p_draft->>'total_cooked_weight_g', '')::numeric,
      total_time_minutes = nullif(p_draft->>'total_time_minutes', '')::integer,
      notes = nullif(btrim(p_draft->>'notes'), ''),
      draft_metadata = coalesce(p_draft->'draft_metadata', '{}'::jsonb),
      revision = draft.revision + 1
  where draft.id = v_draft.id
    and draft.user_id = v_user_id
    and draft.revision = p_expected_revision
  returning draft.* into v_draft;

  if not found then
    raise exception 'Recipe Working Draft revision conflict: local Draft is stale.' using errcode = '40001';
  end if;

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
end
$function$;

revoke all on function public.autosave_nutrition_recipe_draft(uuid, bigint, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.autosave_nutrition_recipe_draft(uuid, bigint, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
