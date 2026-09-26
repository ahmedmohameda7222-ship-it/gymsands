begin;

-- Plan 7 Tasks 13-14: backward-compatible owner authority expansion.
-- Repository-only. No Production apply is authorized by this migration file.
-- Search cutover remains gated by a fresh Production food_personal_corrections count.
-- This migration is expand-only: it changes function authority without retiring stored owner data.

create or replace function private.food_catalog_require_active_owner_account_v1(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null then
    raise exception 'Food Catalog owner is required.' using errcode='42501';
  end if;

  perform private.food_catalog_lock_account_purge(p_user_id);
  perform 1
  from auth.users auth_user
  join public.account_access_states access_state
    on access_state.user_id = auth_user.id
  where auth_user.id = p_user_id
    and access_state.state = 'active'
    and access_state.disabled_at is null
  for share of access_state;

  if not found then
    raise exception 'Food Catalog owner action requires an active, non-disabled account.' using errcode='42501';
  end if;
end
$function$;

revoke all on function private.food_catalog_require_active_owner_account_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function private.food_catalog_get_current_personal_override_for_owner_v1(
  p_user_id uuid,
  p_food_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_current_revision_id uuid;
  v_pointer_revision bigint;
  v_revision_id uuid;
  v_revision_user_id uuid;
  v_revision_food_id uuid;
  v_revision_number bigint;
  v_is_deleted boolean;
  v_nutrition_override jsonb;
  v_serving_label text;
  v_note text;
begin
  if p_user_id is null then
    raise exception 'Personal Override owner is required.' using errcode='42501';
  end if;
  if p_food_id is null then
    raise exception 'Personal Override Food ID is required.' using errcode='22023';
  end if;

  perform private.food_catalog_require_active_owner_account_v1(p_user_id);

  select
    pointer.current_revision_id,
    pointer.pointer_revision,
    revision.id,
    revision.user_id,
    revision.food_id,
    revision.revision_number,
    revision.is_deleted,
    revision.nutrition_override,
    revision.serving_label,
    revision.note
  into
    v_current_revision_id,
    v_pointer_revision,
    v_revision_id,
    v_revision_user_id,
    v_revision_food_id,
    v_revision_number,
    v_is_deleted,
    v_nutrition_override,
    v_serving_label,
    v_note
  from public.food_personal_overrides pointer
  left join public.food_personal_override_revisions revision
    on revision.id = pointer.current_revision_id
  where pointer.user_id = p_user_id
    and pointer.food_id = p_food_id;

  if not found then
    return jsonb_build_object(
      'foodId', p_food_id,
      'hasOverride', false,
      'revisionId', null,
      'pointerRevision', 0,
      'isDeleted', false,
      'nutritionOverride', null,
      'servingLabel', null,
      'note', null
    );
  end if;

  if v_revision_id is null
     or v_revision_id is distinct from v_current_revision_id
     or v_revision_user_id is distinct from p_user_id
     or v_revision_food_id is distinct from p_food_id
     or v_revision_number is distinct from v_pointer_revision then
    raise exception 'Personal Override pointer integrity violation.' using errcode='23514';
  end if;

  return jsonb_build_object(
    'foodId', p_food_id,
    'hasOverride', true,
    'revisionId', v_revision_id,
    'pointerRevision', v_pointer_revision,
    'isDeleted', v_is_deleted,
    'nutritionOverride', v_nutrition_override,
    'servingLabel', v_serving_label,
    'note', v_note
  );
end
$function$;

revoke all on function private.food_catalog_get_current_personal_override_for_owner_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function private.food_catalog_owner_for_mcp_connection_v1(p_connection_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  if p_connection_id is null then
    raise exception 'MCP connection ID is required.' using errcode='22023';
  end if;

  select connection.user_id
    into v_user_id
  from public.chatgpt_connections connection
  where connection.id = p_connection_id
    and connection.is_active = true
    and connection.revoked_at is null;

  if not found or v_user_id is null then
    raise exception 'MCP connection is inactive, revoked, or unknown.' using errcode='42501';
  end if;

  perform private.food_catalog_require_active_owner_account_v1(v_user_id);
  return v_user_id;
end
$function$;

revoke all on function private.food_catalog_owner_for_mcp_connection_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.food_catalog_get_current_personal_override_v1(p_food_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authenticated Personal Override owner is required.' using errcode='42501';
  end if;
  return private.food_catalog_get_current_personal_override_for_owner_v1(v_user_id, p_food_id);
end
$function$;

revoke all on function public.food_catalog_get_current_personal_override_v1(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_get_current_personal_override_v1(uuid)
to authenticated;

create or replace function public.food_catalog_get_current_personal_override_for_mcp_v1(
  p_connection_id uuid,
  p_food_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  v_user_id := private.food_catalog_owner_for_mcp_connection_v1(p_connection_id);
  return private.food_catalog_get_current_personal_override_for_owner_v1(v_user_id, p_food_id);
end
$function$;

revoke all on function public.food_catalog_get_current_personal_override_for_mcp_v1(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_get_current_personal_override_for_mcp_v1(uuid, uuid)
to service_role;


create or replace function private.food_catalog_search_v2_for_owner_v1(
  p_user_id uuid,
  p_query text default '',
  p_language_tag text default 'en',
  p_script_code text default null,
  p_market_scope_code text default null,
  p_cursor text default null,
  p_limit integer default 20,
  p_category text default null,
  p_cuisine text default null,
  p_scope text default 'all',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_generation_id uuid;
  v_projection_version text;
  v_nutrition_policy_version text;
  v_query text := private.normalize_nutrition_food_search_text(coalesce(p_query, ''));
  v_language_tag text := lower(coalesce(nullif(btrim(p_language_tag), ''), 'en'));
  v_script_code text := coalesce(nullif(btrim(p_script_code), ''), '');
  v_market_scope_code text := upper(coalesce(nullif(btrim(p_market_scope_code), ''), ''));
  v_category text := private.normalize_nutrition_food_search_text(coalesce(p_category, ''));
  v_cuisine text := private.normalize_nutrition_food_search_text(coalesce(p_cuisine, ''));
  v_scope text := coalesce(nullif(btrim(p_scope), ''), 'all');
  v_limit integer := least(20, greatest(1, coalesce(p_limit, 20)));
  v_cursor jsonb;
  v_cursor_context_sha256 text;
  v_expected_context_sha256 text;
  v_result jsonb;
  v_presets jsonb := coalesce(p_filters->'presets', '[]'::jsonb);
begin
  if p_user_id is null then
    raise exception 'Food Catalog owner is required.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.food_personal_overrides pointer
    left join public.food_personal_override_revisions revision
      on revision.id = pointer.current_revision_id
    where pointer.user_id = p_user_id
      and (
        revision.id is null
        or revision.id is distinct from pointer.current_revision_id
        or revision.user_id is distinct from pointer.user_id
        or revision.food_id is distinct from pointer.food_id
        or revision.revision_number is distinct from pointer.pointer_revision
      )
  ) then
    raise exception 'Personal Override pointer integrity violation.' using errcode='23514';
  end if;
  if v_scope not in ('all','favorites','recent','my_food') then
    raise exception 'Invalid Food Library scope.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(v_presets) <> 'array' then
    raise exception 'Invalid Food Catalog search filters.' using errcode = '22023';
  end if;
  if v_market_scope_code <> '' and not exists (
    select 1 from public.market_scopes scope
    where scope.scope_code = v_market_scope_code
      and scope.lifecycle_status = 'active'
  ) then
    raise exception 'Explicit Food Catalog market scope is invalid.' using errcode = '22023';
  end if;

  select pointer.current_generation_id, generation.projection_version
    into v_generation_id, v_projection_version
  from public.food_catalog_current_generation pointer
  left join public.food_catalog_generations generation
    on generation.id = pointer.current_generation_id
  where pointer.singleton_key;

  if v_generation_id is not null then
    select min(doc.nutrition_policy_version)
      into v_nutrition_policy_version
    from public.food_catalog_search_documents doc
    where doc.generation_id = v_generation_id
      and doc.projection_version = v_projection_version;
  end if;

  if (v_presets ? 'high-protein' or v_presets ? 'low-carb')
     and v_nutrition_policy_version is null then
    raise exception 'Food Catalog nutrition label policy is not configured.' using errcode = '22023';
  end if;

  v_expected_context_sha256 := encode(extensions.digest(
    concat_ws('|',
      coalesce(v_generation_id::text, 'none'),
      coalesce(v_projection_version, 'none'),
      coalesce(v_nutrition_policy_version, 'none'),
      v_query,
      v_language_tag,
      v_script_code,
      v_market_scope_code,
      v_category,
      v_cuisine,
      v_scope,
      coalesce(p_filters, '{}'::jsonb)::text
    ), 'sha256'), 'hex');

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_cursor := p_cursor::jsonb;
      if jsonb_typeof(v_cursor) <> 'object' then raise exception 'invalid cursor'; end if;
      v_cursor_context_sha256 := v_cursor->>'c';
    exception when others then
      raise exception 'Invalid Food Catalog search cursor.' using errcode = '22023';
    end;
    if v_cursor_context_sha256 is distinct from v_expected_context_sha256 then
      raise exception 'Cursor does not match Food Catalog search context.' using errcode = '22023';
    end if;
  end if;

  with recursive market_context(scope_code, depth) as (
    select v_market_scope_code, 0
    where v_market_scope_code <> ''
    union all
    select membership.parent_scope_code, context.depth + 1
    from market_context context
    join public.market_scope_memberships membership
      on membership.child_scope_code = context.scope_code
    where context.depth < 8
  ),
  usage_rows as materialized (
    select 'catalog'::text as source, log.food_item_id as item_id,
           count(*)::bigint as frequency, max(log.created_at) as recent_at
    from public.food_logs log
    where log.user_id = p_user_id and log.food_item_id is not null
    group by log.food_item_id
    union all
    select 'my_food'::text, log.user_food_item_id,
           count(*)::bigint, max(log.created_at)
    from public.food_logs log
    where log.user_id = p_user_id and log.user_food_item_id is not null
    group by log.user_food_item_id
  ),
  global_scored as (
    select
      doc.food_id,
      'catalog'::text as source,
      doc.display_name as name,
      doc.category_code as category,
      doc.cuisine_code as cuisine,
      doc.serving_label,
      doc.verified,
      (favorite.food_id is not null) as favorite,
      usage.recent_at,
      coalesce(usage.frequency, 0)::bigint as frequency,
      doc.language_tag,
      doc.script_code,
      doc.aliases,
      doc.nutrition_labels,
      case
        when override_pointer.user_id is not null then (
          override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and coalesce((
            jsonb_typeof(override_revision.nutrition_override->'calories') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'protein_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'carbs_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'fat_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'saturated_fat_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'fiber_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'sugars_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'sodium_mg') = 'number'
          ), false)
        )
        else correction.food_id is not null
      end as using_personal_values,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'calories') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'calories')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.calories_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.calories, doc.calories_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.calories_100
      end as calories_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'protein_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'protein_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.protein_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.protein_g, doc.protein_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.protein_100
      end as protein_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'carbs_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'carbs_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.carbs_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.carbs_g, doc.carbs_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.carbs_100
      end as carbs_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'fat_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'fat_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.fat_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.fat_g, doc.fat_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.fat_100
      end as fat_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'saturated_fat_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'saturated_fat_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.saturated_fat_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.saturated_fat_g, doc.saturated_fat_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.saturated_fat_100
      end as saturated_fat_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'fiber_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'fiber_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.fiber_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.fiber_g, doc.fiber_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.fiber_100
      end as fiber_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'sugars_g') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'sugars_g')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.sugars_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.sugars_g, doc.sugars_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.sugars_100
      end as sugars_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and jsonb_typeof(override_revision.nutrition_override->'sodium_mg') = 'number'
        then private.food_catalog_search_per_100_v2(
          (override_revision.nutrition_override->>'sodium_mg')::numeric,
          canonical_nutrition.basis_amount,
          canonical_nutrition.basis_unit
        )
        when override_pointer.user_id is not null then doc.sodium_mg_100
        when correction.food_id is not null then private.food_catalog_search_per_100_v2(
          coalesce(correction.sodium_mg, doc.sodium_mg_100),
          coalesce(correction.basis_amount, 100),
          coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        )
        else doc.sodium_mg_100
      end as sodium_mg_100,
      case
        when override_pointer.user_id is not null
          and override_revision.is_deleted = false
          and canonical_nutrition.id is not null
          and (
            jsonb_typeof(override_revision.nutrition_override->'calories') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'protein_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'carbs_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'fat_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'saturated_fat_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'fiber_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'sugars_g') = 'number'
            or jsonb_typeof(override_revision.nutrition_override->'sodium_mg') = 'number'
          )
        then canonical_nutrition.basis_unit
        when override_pointer.user_id is not null then doc.nutrition_basis_unit
        when correction.food_id is not null then coalesce(correction.basis_unit, doc.nutrition_basis_unit)
        else doc.nutrition_basis_unit
      end as nutrition_basis_unit,
      case
        when v_query = '' then 20
        when doc.normalized_display_name = v_query then 0
        when v_query = any(doc.normalized_aliases) then 1
        when doc.normalized_display_name like v_query || '%' then 2
        when exists (select 1 from unnest(doc.normalized_aliases) alias where alias like v_query || '%') then 3
        when doc.search_vector @@ plainto_tsquery('simple'::regconfig, v_query) then 4
        when doc.search_text like '%' || v_query || '%' then 5
        else 100
      end as match_tier,
      doc.trust_rank,
      case
        when v_market_scope_code = '' then 0
        when exists (
          select 1 from market_context context
          where context.scope_code = any(doc.market_scope_codes)
        ) then coalesce((select min(context.depth) from market_context context where context.scope_code = any(doc.market_scope_codes)), 0)
        when 'GLOBAL' = any(doc.market_scope_codes) then 50
        else 100
      end as market_rank,
      case
        when doc.language_tag = v_language_tag and doc.script_code = v_script_code then 0
        when doc.language_tag = v_language_tag and v_script_code = '' then 0
        when doc.language_tag = v_language_tag then 1
        else 2
      end as context_rank,
      case when favorite.food_id is not null then 0 else 1 end as favorite_rank,
      -extract(epoch from coalesce(usage.recent_at, '1970-01-01 00:00:00+00'::timestamptz)) as recency_rank,
      -coalesce(usage.frequency, 0)::bigint as frequency_rank,
      doc.normalized_display_name as name_sort
    from public.food_catalog_search_documents doc
    left join public.food_favorites favorite
      on favorite.user_id = p_user_id and favorite.food_id = doc.food_id
    left join usage_rows usage
      on usage.source = 'catalog' and usage.item_id = doc.food_id
    left join public.food_catalog_generation_foods generation_food
      on generation_food.generation_id = v_generation_id
     and generation_food.food_id = doc.food_id
    left join public.food_nutrition_revisions canonical_nutrition
      on canonical_nutrition.id = generation_food.nutrition_revision_id
     and canonical_nutrition.food_id = doc.food_id
    left join public.food_personal_overrides override_pointer
      on override_pointer.user_id = p_user_id
     and override_pointer.food_id = doc.food_id
    left join public.food_personal_override_revisions override_revision
      on override_revision.id = override_pointer.current_revision_id
     and override_revision.user_id = override_pointer.user_id
     and override_revision.food_id = override_pointer.food_id
     and override_revision.revision_number = override_pointer.pointer_revision
    left join public.food_personal_corrections correction
      on correction.user_id = p_user_id
     and correction.food_id = doc.food_id
     and correction.is_active = true
     and override_pointer.user_id is null
    where v_generation_id is not null
      and doc.generation_id = v_generation_id
      and doc.projection_version = v_projection_version
      and v_scope <> 'my_food'
      and (v_scope <> 'favorites' or favorite.food_id is not null)
      and (v_scope <> 'recent' or usage.recent_at is not null)
      and (v_category = '' or private.normalize_nutrition_food_search_text(doc.category_code) = v_category)
      and (v_cuisine = '' or private.normalize_nutrition_food_search_text(doc.cuisine_code) = v_cuisine)
  ),
  global_one_document_per_food as (
    select * from (
      select scored.*,
        row_number() over (
          partition by scored.food_id
          order by scored.match_tier, scored.trust_rank, scored.market_rank, scored.context_rank,
                   scored.name_sort, scored.language_tag, scored.script_code
        ) as document_rank
      from global_scored scored
      where scored.match_tier < 100
    ) ranked_document
    where ranked_document.document_rank = 1
  ),
  personal_scored as (
    select
      food.id as food_id,
      'my_food'::text as source,
      food.food_name as name,
      food.category,
      food.cuisine,
      food.serving_size as serving_label,
      false as verified,
      false as favorite,
      usage.recent_at,
      coalesce(usage.frequency, 0)::bigint as frequency,
      v_language_tag as language_tag,
      v_script_code as script_code,
      '[]'::jsonb as aliases,
      '{}'::text[] as nutrition_labels,
      false as using_personal_values,
      private.food_catalog_search_per_100_v2(food.calories, food.nutrition_basis_amount, food.nutrition_basis_unit) as calories_100,
      private.food_catalog_search_per_100_v2(food.protein_g, food.nutrition_basis_amount, food.nutrition_basis_unit) as protein_100,
      private.food_catalog_search_per_100_v2(food.carbs_g, food.nutrition_basis_amount, food.nutrition_basis_unit) as carbs_100,
      private.food_catalog_search_per_100_v2(food.fat_g, food.nutrition_basis_amount, food.nutrition_basis_unit) as fat_100,
      null::numeric as saturated_fat_100,
      private.food_catalog_search_per_100_v2(food.fiber_g, food.nutrition_basis_amount, food.nutrition_basis_unit) as fiber_100,
      private.food_catalog_search_per_100_v2(food.sugar_g, food.nutrition_basis_amount, food.nutrition_basis_unit) as sugars_100,
      private.food_catalog_search_per_100_v2(food.sodium_mg, food.nutrition_basis_amount, food.nutrition_basis_unit) as sodium_mg_100,
      food.nutrition_basis_unit as nutrition_basis_unit,
      case
        when v_query = '' then 20
        when private.normalize_nutrition_food_search_text(food.food_name) = v_query then 0
        when private.normalize_nutrition_food_search_text(food.food_name) like v_query || '%' then 2
        when private.normalize_nutrition_food_search_text(food.food_name) like '%' || v_query || '%' then 5
        else 100
      end as match_tier,
      1::smallint as trust_rank,
      0 as market_rank,
      0 as context_rank,
      1 as favorite_rank,
      -extract(epoch from coalesce(usage.recent_at, '1970-01-01 00:00:00+00'::timestamptz)) as recency_rank,
      -coalesce(usage.frequency, 0)::bigint as frequency_rank,
      private.normalize_nutrition_food_search_text(food.food_name) as name_sort,
      1 as document_rank
    from public.user_food_items food
    left join usage_rows usage
      on usage.source = 'my_food' and usage.item_id = food.id
    where food.user_id = p_user_id
      and food.deleted_at is null
      and v_scope in ('all','recent','my_food')
      and (v_scope <> 'recent' or usage.recent_at is not null)
      and (v_category = '' or private.normalize_nutrition_food_search_text(food.category) = v_category)
      and (v_cuisine = '' or private.normalize_nutrition_food_search_text(food.cuisine) = v_cuisine)
  ),
  combined as (
    select * from global_one_document_per_food
    union all
    select * from personal_scored where match_tier < 100
  ),
  qualified as (
    select candidate.*
    from combined candidate
    where private.food_catalog_search_numeric_filter_matches_v2(candidate.protein_100, p_filters->'protein')
      and private.food_catalog_search_numeric_filter_matches_v2(candidate.carbs_100, p_filters->'carbs')
      and private.food_catalog_search_numeric_filter_matches_v2(candidate.fat_100, p_filters->'fat')
      and private.food_catalog_search_numeric_filter_matches_v2(candidate.calories_100, p_filters->'calories')
      and (not (v_presets ? 'high-protein') or 'high-protein' = any(candidate.nutrition_labels))
      and (not (v_presets ? 'low-carb') or 'low-carb' = any(candidate.nutrition_labels))
  ),
  after_cursor as (
    select candidate.*
    from qualified candidate
    where v_cursor is null
       or (
         candidate.match_tier,
         candidate.trust_rank,
         candidate.market_rank,
         candidate.context_rank,
         candidate.favorite_rank,
         candidate.recency_rank,
         candidate.frequency_rank,
         candidate.name_sort,
         candidate.source,
         candidate.food_id::text
       ) > (
         (v_cursor->>'t')::integer,
         (v_cursor->>'u')::integer,
         (v_cursor->>'m')::integer,
         (v_cursor->>'x')::integer,
         (v_cursor->>'f')::integer,
         (v_cursor->>'r')::numeric,
         (v_cursor->>'q')::bigint,
         v_cursor->>'n',
         v_cursor->>'k',
         v_cursor->>'i'
       )
  ),
  page as materialized (
    select candidate.*,
      row_number() over (
        order by candidate.match_tier, candidate.trust_rank, candidate.market_rank, candidate.context_rank,
                 candidate.favorite_rank, candidate.recency_rank, candidate.frequency_rank,
                 candidate.name_sort, candidate.source, candidate.food_id::text
      ) as page_rank
    from after_cursor candidate
    order by candidate.match_tier, candidate.trust_rank, candidate.market_rank, candidate.context_rank,
             candidate.favorite_rank, candidate.recency_rank, candidate.frequency_rank,
             candidate.name_sort, candidate.source, candidate.food_id::text
    limit v_limit + 1
  ),
  visible as (
    select * from page where page_rank <= v_limit
  ),
  payload as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', item.food_id,
        'source', item.source,
        'name', item.name,
        'brand', null,
        'category', item.category,
        'cuisine', item.cuisine,
        'servingLabel', item.serving_label,
        'verified', item.verified,
        'favorite', item.favorite,
        'recentAt', item.recent_at,
        'frequency', item.frequency,
        'locale', item.language_tag,
        'scriptCode', nullif(item.script_code, ''),
        'aliases', item.aliases,
        'nutritionLabels', to_jsonb(item.nutrition_labels),
        'nutrition', jsonb_build_object(
          'calories', item.calories_100,
          'protein_g', item.protein_100,
          'carbs_g', item.carbs_100,
          'fat_g', item.fat_100,
          'saturated_fat_g', item.saturated_fat_100,
          'fiber_g', item.fiber_100,
          'sugars_g', item.sugars_100,
          'sodium_mg', item.sodium_mg_100,
          'basis_amount', case when item.nutrition_basis_unit in ('g','ml') then 100 else null end,
          'basis_unit', item.nutrition_basis_unit
        ),
        'tags', '[]'::jsonb,
        'usingPersonalValues', item.using_personal_values
      ) order by item.page_rank
    ), '[]'::jsonb) as items
    from visible item
  ),
  cursor_row as (
    select item.*
    from visible item
    where item.page_rank = v_limit
      and exists (select 1 from page extra where extra.page_rank = v_limit + 1)
  )
  select jsonb_build_object(
    'items', payload.items,
    'nextCursor', (
      select jsonb_build_object(
        'c', v_expected_context_sha256,
        't', cursor_row.match_tier,
        'u', cursor_row.trust_rank,
        'm', cursor_row.market_rank,
        'x', cursor_row.context_rank,
        'f', cursor_row.favorite_rank,
        'r', cursor_row.recency_rank,
        'q', cursor_row.frequency_rank,
        'n', cursor_row.name_sort,
        'k', cursor_row.source,
        'i', cursor_row.food_id::text
      )::text
      from cursor_row
    )
  ) into v_result
  from payload;

  return coalesce(v_result, jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null));
end
$function$;

revoke all on function private.food_catalog_search_v2_for_owner_v1(
  uuid, text, text, text, text, text, integer, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.search_food_catalog_v2(
  p_query text default '',
  p_language_tag text default 'en',
  p_script_code text default null,
  p_market_scope_code text default null,
  p_cursor text default null,
  p_limit integer default 20,
  p_category text default null,
  p_cuisine text default null,
  p_scope text default 'all',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  return private.food_catalog_search_v2_for_owner_v1(
    v_user_id,
    p_query,
    p_language_tag,
    p_script_code,
    p_market_scope_code,
    p_cursor,
    p_limit,
    p_category,
    p_cuisine,
    p_scope,
    p_filters
  );
end
$function$;

revoke all on function public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb)
to authenticated, service_role;

create or replace function public.search_food_catalog_v2_for_mcp_v1(
  p_connection_id uuid,
  p_query text default '',
  p_language_tag text default 'en',
  p_script_code text default null,
  p_market_scope_code text default null,
  p_cursor text default null,
  p_limit integer default 20,
  p_category text default null,
  p_cuisine text default null,
  p_scope text default 'all',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  v_user_id := private.food_catalog_owner_for_mcp_connection_v1(p_connection_id);
  return private.food_catalog_search_v2_for_owner_v1(
    v_user_id,
    p_query,
    p_language_tag,
    p_script_code,
    p_market_scope_code,
    p_cursor,
    p_limit,
    p_category,
    p_cuisine,
    p_scope,
    p_filters
  );
end
$function$;

revoke all on function public.search_food_catalog_v2_for_mcp_v1(uuid, text, text, text, text, text, integer, text, text, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.search_food_catalog_v2_for_mcp_v1(uuid, text, text, text, text, text, integer, text, text, text, jsonb)
to service_role;


commit;
