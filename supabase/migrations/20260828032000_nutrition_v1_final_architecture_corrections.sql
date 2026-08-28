begin;

-- Nutrition V1 final long-term architecture corrections.
-- Forward/additive only: previously applied Nutrition migrations remain immutable.

create extension if not exists pg_trgm;

-- Search predicates and indexes intentionally share the exact canonical normalization
-- expression. This prevents the catalog from falling back to full-catalog text work
-- before filtering/ranking when the user supplies a non-empty query.
create index if not exists nutrition_food_items_normalized_name_trgm_idx
  on public.food_items using gin (
    (private.normalize_nutrition_food_search_text(food_name)) gin_trgm_ops
  )
  where is_global = true
    and lifecycle_status = 'active'
    and merged_into_food_id is null;

create index if not exists nutrition_food_aliases_normalized_text_trgm_idx
  on public.food_aliases using gin (
    (private.normalize_nutrition_food_search_text(alias)) gin_trgm_ops
  );

create index if not exists nutrition_user_food_items_normalized_name_trgm_idx
  on public.user_food_items using gin (
    (private.normalize_nutrition_food_search_text(food_name)) gin_trgm_ops
  )
  where deleted_at is null;

create or replace function public.search_nutrition_food_library(
  p_query text default '',
  p_locale text default 'en',
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
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_query text := private.normalize_nutrition_food_search_text(p_query);
  v_category text := private.normalize_nutrition_food_search_text(p_category);
  v_cuisine text := private.normalize_nutrition_food_search_text(p_cuisine);
  v_locale text := case when p_locale in ('en', 'de', 'ar') then p_locale else 'en' end;
  v_scope text := coalesce(p_scope, 'all');
  v_limit integer := least(20, greatest(1, coalesce(p_limit, 20)));
  v_cursor jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if v_scope not in ('all', 'favorites', 'recent', 'my_food') then
    raise exception 'Invalid Food Library scope.' using errcode = '22023';
  end if;
  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_cursor := p_cursor::jsonb;
      if jsonb_typeof(v_cursor) <> 'object' then
        raise exception 'invalid cursor';
      end if;
    exception when others then
      raise exception 'Invalid Food Library cursor.' using errcode = '22023';
    end;
  end if;

  with catalog_name_matches as materialized (
    select food.id
    from public.food_items food
    where v_query <> ''
      and food.is_global = true
      and food.lifecycle_status = 'active'
      and food.merged_into_food_id is null
      and private.normalize_nutrition_food_search_text(food.food_name) like '%' || v_query || '%'
  ),
  catalog_alias_matches as materialized (
    select alias.food_id as id
    from public.food_aliases alias
    join public.food_items food on food.id = alias.food_id
    where v_query <> ''
      and food.is_global = true
      and food.lifecycle_status = 'active'
      and food.merged_into_food_id is null
      and private.normalize_nutrition_food_search_text(alias.alias) like '%' || v_query || '%'
  ),
  catalog_text_matches as materialized (
    select id from catalog_name_matches
    union
    select id from catalog_alias_matches
  ),
  personal_name_matches as materialized (
    select food.id
    from public.user_food_items food
    where v_query <> ''
      and food.user_id = v_user_id
      and food.deleted_at is null
      and private.normalize_nutrition_food_search_text(food.food_name) like '%' || v_query || '%'
  ),
  usage_rows as materialized (
    select 'catalog'::text as source, log.food_item_id as item_id,
           count(*)::bigint as frequency, max(log.created_at) as recent_at
    from public.food_logs log
    where log.user_id = v_user_id and log.food_item_id is not null
    group by log.food_item_id
    union all
    select 'my_food'::text, log.user_food_item_id,
           count(*)::bigint, max(log.created_at)
    from public.food_logs log
    where log.user_id = v_user_id and log.user_food_item_id is not null
    group by log.user_food_item_id
  ),
  catalog as (
    select
      food.id,
      'catalog'::text as source,
      food.food_name as name,
      food.category,
      food.cuisine,
      food.serving_size as serving_label,
      food.is_verified as verified,
      (favorite.food_id is not null) as favorite,
      usage.recent_at,
      coalesce(usage.frequency, 0)::bigint as frequency,
      coalesce(alias_state.aliases, '[]'::jsonb) as aliases,
      coalesce(to_jsonb(food.tags), '[]'::jsonb) as tags,
      coalesce(correction.calories, food.calories) as calories,
      coalesce(correction.protein_g, food.protein_g) as protein_g,
      coalesce(correction.carbs_g, food.carbs_g) as carbs_g,
      coalesce(correction.fat_g, food.fat_g) as fat_g,
      coalesce(correction.saturated_fat_g, food.saturated_fat_g) as saturated_fat_g,
      coalesce(correction.fiber_g, food.fiber_g) as fiber_g,
      coalesce(correction.sugars_g, food.sugars_g) as sugars_g,
      coalesce(correction.sodium_mg, food.sodium_mg) as sodium_mg,
      coalesce(correction.basis_amount, food.nutrition_basis_amount) as basis_amount,
      coalesce(correction.basis_unit, food.nutrition_basis_unit) as basis_unit,
      (correction.food_id is not null) as using_personal_values,
      coalesce(alias_state.exact_locale, false) as alias_exact_locale,
      coalesce(alias_state.exact_any, false) as alias_exact_any,
      coalesce(alias_state.prefix_any, false) as alias_prefix_any,
      coalesce(alias_state.contains_any, false) as alias_contains_any
    from public.food_items food
    left join public.food_favorites favorite
      on favorite.user_id = v_user_id and favorite.food_id = food.id
    left join public.food_personal_corrections correction
      on correction.user_id = v_user_id and correction.food_id = food.id and correction.is_active = true
    left join usage_rows usage
      on usage.source = 'catalog' and usage.item_id = food.id
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object('locale', alias.locale, 'value', alias.alias)
          order by alias.locale, alias.normalized_alias, alias.id
        ) as aliases,
        bool_or(
          alias.locale = v_locale
          and private.normalize_nutrition_food_search_text(alias.alias) = v_query
        ) as exact_locale,
        bool_or(private.normalize_nutrition_food_search_text(alias.alias) = v_query) as exact_any,
        bool_or(
          v_query <> ''
          and private.normalize_nutrition_food_search_text(alias.alias) like v_query || '%'
        ) as prefix_any,
        bool_or(
          v_query <> ''
          and private.normalize_nutrition_food_search_text(alias.alias) like '%' || v_query || '%'
        ) as contains_any
      from public.food_aliases alias
      where alias.food_id = food.id
    ) alias_state on true
    where food.is_global = true
      and food.lifecycle_status = 'active'
      and food.merged_into_food_id is null
      and (
        v_query = ''
        or exists (
          select 1 from catalog_text_matches matched where matched.id = food.id
        )
      )
  ),
  personal as (
    select
      food.id,
      'my_food'::text as source,
      food.food_name as name,
      food.category,
      null::text as cuisine,
      food.serving_size as serving_label,
      false as verified,
      false as favorite,
      usage.recent_at,
      coalesce(usage.frequency, 0)::bigint as frequency,
      '[]'::jsonb as aliases,
      coalesce(to_jsonb(food.tags), '[]'::jsonb) as tags,
      food.calories,
      food.protein_g,
      food.carbs_g,
      food.fat_g,
      null::numeric as saturated_fat_g,
      null::numeric as fiber_g,
      null::numeric as sugars_g,
      null::numeric as sodium_mg,
      food.nutrition_basis_amount as basis_amount,
      food.nutrition_basis_unit as basis_unit,
      false as using_personal_values,
      false as alias_exact_locale,
      false as alias_exact_any,
      false as alias_prefix_any,
      false as alias_contains_any
    from public.user_food_items food
    left join usage_rows usage
      on usage.source = 'my_food' and usage.item_id = food.id
    where food.user_id = v_user_id
      and food.deleted_at is null
      and (
        v_query = ''
        or exists (
          select 1 from personal_name_matches matched where matched.id = food.id
        )
      )
  ),
  eligible as (
    select * from catalog
    union all
    select * from personal
  ),
  filtered as (
    select
      candidate.*,
      private.normalize_nutrition_food_search_text(candidate.name) as normalized_name,
      private.nutrition_food_per_100(candidate.calories, candidate.basis_amount, candidate.basis_unit) as calories_100,
      private.nutrition_food_per_100(candidate.protein_g, candidate.basis_amount, candidate.basis_unit) as protein_100,
      private.nutrition_food_per_100(candidate.carbs_g, candidate.basis_amount, candidate.basis_unit) as carbs_100,
      private.nutrition_food_per_100(candidate.fat_g, candidate.basis_amount, candidate.basis_unit) as fat_100
    from eligible candidate
    where
      (v_scope = 'all'
       or (v_scope = 'favorites' and candidate.favorite)
       or (v_scope = 'recent' and candidate.recent_at is not null)
       or (v_scope = 'my_food' and candidate.source = 'my_food'))
      and (v_category = '' or private.normalize_nutrition_food_search_text(candidate.category) = v_category)
      and (v_cuisine = '' or private.normalize_nutrition_food_search_text(candidate.cuisine) = v_cuisine)
  ),
  qualified as (
    select
      candidate.*,
      case
        when v_query = '' then 20
        when candidate.source = 'my_food' and candidate.normalized_name = v_query then 0
        when candidate.source = 'catalog' and candidate.normalized_name = v_query then 1
        when candidate.alias_exact_locale then 2
        when candidate.alias_exact_any then 3
        when candidate.normalized_name like v_query || '%' then 4
        when candidate.alias_prefix_any then 5
        when candidate.normalized_name like '%' || v_query || '%' or candidate.alias_contains_any then 6
        else 100
      end as match_tier
    from filtered candidate
    where
      private.nutrition_food_numeric_filter_matches(candidate.protein_100, p_filters->'protein')
      and private.nutrition_food_numeric_filter_matches(candidate.carbs_100, p_filters->'carbs')
      and private.nutrition_food_numeric_filter_matches(candidate.fat_100, p_filters->'fat')
      and private.nutrition_food_numeric_filter_matches(candidate.calories_100, p_filters->'calories')
      and (not (coalesce(p_filters->'presets', '[]'::jsonb) ? 'high-protein') or candidate.protein_100 >= 20)
      and (not (coalesce(p_filters->'presets', '[]'::jsonb) ? 'low-carb') or candidate.carbs_100 <= 10)
  ),
  ranked as (
    select
      candidate.*,
      case when candidate.favorite then 0 else 1 end as favorite_rank,
      -extract(epoch from coalesce(candidate.recent_at, '1970-01-01 00:00:00+00'::timestamptz)) as recency_rank,
      -candidate.frequency as frequency_rank,
      case when v_query = '' and candidate.source = 'my_food' then 0 else 1 end as source_rank,
      candidate.normalized_name as name_sort
    from qualified candidate
    where candidate.match_tier < 100
  ),
  after_cursor as (
    select candidate.*
    from ranked candidate
    where v_cursor is null
       or (
         candidate.match_tier,
         candidate.favorite_rank,
         candidate.recency_rank,
         candidate.frequency_rank,
         candidate.source_rank,
         candidate.name_sort,
         candidate.source,
         candidate.id::text
       ) > (
         (v_cursor->>'t')::integer,
         (v_cursor->>'f')::integer,
         (v_cursor->>'r')::numeric,
         (v_cursor->>'q')::bigint,
         (v_cursor->>'s')::integer,
         v_cursor->>'n',
         v_cursor->>'k',
         v_cursor->>'i'
       )
  ),
  page as materialized (
    select candidate.*, row_number() over (
      order by candidate.match_tier, candidate.favorite_rank, candidate.recency_rank,
               candidate.frequency_rank, candidate.source_rank, candidate.name_sort,
               candidate.source, candidate.id::text
    ) as rn
    from after_cursor candidate
    order by candidate.match_tier, candidate.favorite_rank, candidate.recency_rank,
             candidate.frequency_rank, candidate.source_rank, candidate.name_sort,
             candidate.source, candidate.id::text
    limit v_limit + 1
  ),
  visible as (
    select * from page where rn <= v_limit
  ),
  payload as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', item.id,
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
        'locale', v_locale,
        'aliases', item.aliases,
        'nutrition', jsonb_build_object(
          'calories', item.calories,
          'protein_g', item.protein_g,
          'carbs_g', item.carbs_g,
          'fat_g', item.fat_g,
          'saturated_fat_g', item.saturated_fat_g,
          'fiber_g', item.fiber_g,
          'sugars_g', item.sugars_g,
          'sodium_mg', item.sodium_mg,
          'basis_amount', item.basis_amount,
          'basis_unit', item.basis_unit
        ),
        'tags', item.tags,
        'usingPersonalValues', item.using_personal_values
      ) order by item.rn
    ), '[]'::jsonb) as items
    from visible item
  ),
  cursor_row as (
    select item.*
    from visible item
    where item.rn = v_limit
      and exists (select 1 from page extra where extra.rn = v_limit + 1)
  )
  select jsonb_build_object(
    'items', payload.items,
    'nextCursor', (
      select jsonb_build_object(
        't', cursor_row.match_tier,
        'f', cursor_row.favorite_rank,
        'r', cursor_row.recency_rank,
        'q', cursor_row.frequency_rank,
        's', cursor_row.source_rank,
        'n', cursor_row.name_sort,
        'k', cursor_row.source,
        'i', cursor_row.id::text
      )::text
      from cursor_row
    )
  ) into v_result
  from payload;

  return coalesce(v_result, jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null));
end
$function$;

revoke all on function public.search_nutrition_food_library(text, text, text, integer, text, text, text, jsonb) from public, anon;
grant execute on function public.search_nutrition_food_library(text, text, text, integer, text, text, text, jsonb) to authenticated, service_role;

-- Starting Cooking is one database transaction. The per-owner/per-Recipe advisory
-- lock also makes retries/concurrent starts converge on the existing active session.
create or replace function public.start_nutrition_cooking_session(
  p_recipe_id uuid,
  p_recipe_version_id uuid default null,
  p_serving_scale numeric default 1,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_serving_scale numeric := coalesce(p_serving_scale, 1);
  v_existing public.nutrition_cooking_sessions%rowtype;
  v_version public.nutrition_recipe_versions%rowtype;
  v_session public.nutrition_cooking_sessions%rowtype;
  v_snapshot jsonb;
  v_action_count integer := 0;
  v_state_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_recipe_id is null then
    raise exception 'Recipe ID is required.' using errcode = '22023';
  end if;
  if v_serving_scale <= 0 then
    raise exception 'Cooking serving scale must be greater than zero.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_recipe_id::text, 0)
  );

  select * into v_existing
  from public.nutrition_cooking_sessions
  where user_id = v_user_id
    and recipe_id = p_recipe_id
    and status = 'active'
  order by last_active_at desc, id
  limit 1
  for update;

  if found then
    v_action_count := jsonb_array_length(
      coalesce(v_existing.frozen_recipe_snapshot->'actions', '[]'::jsonb)
    );
    select count(*)::integer into v_state_count
    from public.nutrition_cooking_action_states
    where user_id = v_user_id and session_id = v_existing.id;
    if v_state_count <> v_action_count then
      raise exception 'Existing active Cooking Session has incomplete canonical action state.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'sessionId', v_existing.id,
      'session', to_jsonb(v_existing),
      'snapshot', v_existing.frozen_recipe_snapshot,
      'reused', true
    );
  end if;

  if p_recipe_version_id is not null then
    select * into v_version
    from public.nutrition_recipe_versions
    where id = p_recipe_version_id
      and recipe_id = p_recipe_id
      and user_id = v_user_id;
  else
    select * into v_version
    from public.nutrition_recipe_versions
    where recipe_id = p_recipe_id
      and user_id = v_user_id
    order by version_number desc, id
    limit 1;
  end if;

  if not found then
    raise exception 'Published Recipe version not found.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'recipe', to_jsonb(v_version),
    'ingredients', coalesce((
      select jsonb_agg(to_jsonb(ingredient) order by ingredient.position, ingredient.id)
      from public.nutrition_recipe_ingredients ingredient
      where ingredient.user_id = v_user_id
        and ingredient.recipe_version_id = v_version.id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(action) order by action.position, action.id)
      from public.nutrition_recipe_actions action
      where action.user_id = v_user_id
        and action.recipe_version_id = v_version.id
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(to_jsonb(equipment) order by equipment.position, equipment.id)
      from public.nutrition_recipe_equipment equipment
      where equipment.user_id = v_user_id
        and equipment.recipe_version_id = v_version.id
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into public.nutrition_cooking_sessions (
    user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot, serving_scale,
    current_action_key, status, started_at, last_active_at,
    completed_at, ended_at, state_revision
  ) values (
    v_user_id,
    p_recipe_id,
    v_version.id,
    v_snapshot,
    v_serving_scale,
    case
      when jsonb_array_length(v_snapshot->'actions') > 0
        then v_snapshot->'actions'->0->>'id'
      else null
    end,
    'active',
    v_now,
    v_now,
    null,
    null,
    0
  ) returning * into v_session;

  select count(*)::integer into v_action_count
  from public.nutrition_recipe_actions action
  where action.user_id = v_user_id
    and action.recipe_version_id = v_version.id;

  insert into public.nutrition_cooking_action_states (
    session_id, user_id, action_key, state, state_revision
  )
  select
    v_session.id,
    v_user_id,
    action.id::text,
    case when cardinality(action.dependency_action_ids) > 0 then 'not_available' else 'ready' end,
    0
  from public.nutrition_recipe_actions action
  where action.user_id = v_user_id
    and action.recipe_version_id = v_version.id
  order by action.position, action.id;

  get diagnostics v_state_count = row_count;
  if v_state_count <> v_action_count then
    raise exception 'Cooking Session initial canonical action state is incomplete.' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'session', to_jsonb(v_session),
    'snapshot', v_snapshot,
    'reused', false
  );
end
$function$;

revoke all on function public.start_nutrition_cooking_session(uuid, uuid, numeric, timestamptz) from public, anon;
grant execute on function public.start_nutrition_cooking_session(uuid, uuid, numeric, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
