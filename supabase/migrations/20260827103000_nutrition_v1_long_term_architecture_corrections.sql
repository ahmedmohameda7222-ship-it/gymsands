begin;

-- Nutrition V1 long-term architectural corrections.
-- Forward/additive only. Previously applied Nutrition migrations remain immutable.

create or replace function private.normalize_nutrition_food_search_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(
          regexp_replace(
            normalize(coalesce(p_value, ''), NFKD),
            U&'[\0300-\036F\0610-\061A\064B-\065F\0670\06D6-\06ED\0640]',
            '',
            'g'
          )
        ),
        '[^[:alnum:]]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$function$;

create or replace function private.nutrition_food_per_100(
  p_value numeric,
  p_basis_amount numeric,
  p_basis_unit text
)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when p_value is null
      or p_basis_amount is null
      or p_basis_amount <= 0
      or p_basis_unit not in ('g', 'ml')
    then null
    else (p_value * 100) / p_basis_amount
  end
$function$;

create or replace function private.nutrition_food_numeric_filter_matches(
  p_value numeric,
  p_filter jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_operator text;
  v_target numeric;
begin
  if p_filter is null or p_filter = 'null'::jsonb then
    return true;
  end if;
  if jsonb_typeof(p_filter) <> 'object' then
    return false;
  end if;
  v_operator := p_filter->>'operator';
  begin
    v_target := nullif(p_filter->>'value', '')::numeric;
  exception when others then
    return false;
  end;
  if p_value is null or v_target is null then
    return false;
  end if;
  if v_operator = 'gte' then return p_value >= v_target; end if;
  if v_operator = 'lte' then return p_value <= v_target; end if;
  if v_operator = 'eq' then return p_value = v_target; end if;
  return false;
end
$function$;

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
      if jsonb_typeof(v_cursor) <> 'object' then raise exception 'invalid cursor'; end if;
    exception when others then
      raise exception 'Invalid Food Library cursor.' using errcode = '22023';
    end;
  end if;

  with usage_rows as materialized (
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
        jsonb_agg(jsonb_build_object('locale', alias.locale, 'value', alias.alias)
                  order by alias.locale, alias.normalized_alias, alias.id) as aliases,
        bool_or(alias.locale = v_locale and private.normalize_nutrition_food_search_text(alias.alias) = v_query) as exact_locale,
        bool_or(private.normalize_nutrition_food_search_text(alias.alias) = v_query) as exact_any,
        bool_or(v_query <> '' and private.normalize_nutrition_food_search_text(alias.alias) like v_query || '%') as prefix_any,
        bool_or(v_query <> '' and private.normalize_nutrition_food_search_text(alias.alias) like '%' || v_query || '%') as contains_any
      from public.food_aliases alias
      where alias.food_id = food.id
    ) alias_state on true
    where food.is_global = true
      and food.lifecycle_status = 'active'
      and food.merged_into_food_id is null
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

alter table public.nutrition_cooking_sessions
  add column if not exists restart_parent_session_id uuid;

create unique index if not exists nutrition_cooking_sessions_restart_once_idx
  on public.nutrition_cooking_sessions(user_id, restart_parent_session_id)
  where restart_parent_session_id is not null;

create or replace function public.start_over_nutrition_cooking_session(
  p_session_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_source public.nutrition_cooking_sessions%rowtype;
  v_existing_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_action jsonb;
  v_action_key text;
  v_action_count integer := 0;
  v_state_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_source
  from public.nutrition_cooking_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Cooking Session not found.' using errcode = 'P0002';
  end if;

  select id into v_existing_id
  from public.nutrition_cooking_sessions
  where user_id = v_user_id and restart_parent_session_id = p_session_id;
  if v_existing_id is not null then
    return jsonb_build_object('sessionId', v_existing_id, 'reused', true);
  end if;

  if v_source.status <> 'active' then
    raise exception 'Cooking Session is not active and has no canonical replacement.' using errcode = '40001';
  end if;

  update public.nutrition_cooking_sessions
  set status = 'ended', ended_at = p_now, last_active_at = p_now
  where id = p_session_id and user_id = v_user_id and status = 'active';
  if not found then
    raise exception 'Cooking Session changed during Start Over.' using errcode = '40001';
  end if;

  insert into public.nutrition_cooking_sessions (
    id, user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot, serving_scale,
    current_action_key, status, started_at, last_active_at, completed_at, ended_at,
    state_revision, restart_parent_session_id
  ) values (
    v_new_id, v_user_id, v_source.recipe_id, v_source.recipe_version_id,
    v_source.frozen_recipe_snapshot, v_source.serving_scale,
    case when jsonb_array_length(coalesce(v_source.frozen_recipe_snapshot->'actions', '[]'::jsonb)) > 0
      then v_source.frozen_recipe_snapshot->'actions'->0->>'id' else null end,
    'active', p_now, p_now, null, null, 0, p_session_id
  );

  for v_action in
    select value from jsonb_array_elements(coalesce(v_source.frozen_recipe_snapshot->'actions', '[]'::jsonb))
  loop
    v_action_count := v_action_count + 1;
    v_action_key := nullif(btrim(v_action->>'id'), '');
    if v_action_key is null then
      raise exception 'Frozen Cooking Recipe action is missing its canonical action key.' using errcode = '23514';
    end if;
    insert into public.nutrition_cooking_action_states (
      session_id, user_id, action_key, state, state_revision
    ) values (
      v_new_id,
      v_user_id,
      v_action_key,
      case
        when jsonb_typeof(v_action->'dependency_action_ids') = 'array'
          and jsonb_array_length(v_action->'dependency_action_ids') > 0 then 'not_available'
        else 'ready'
      end,
      0
    );
    v_state_count := v_state_count + 1;
  end loop;

  if v_state_count <> v_action_count then
    raise exception 'Cooking Session replacement initial state is incomplete.' using errcode = '23514';
  end if;

  return jsonb_build_object('sessionId', v_new_id, 'reused', false);
end
$function$;

revoke all on function public.start_over_nutrition_cooking_session(uuid, timestamptz) from public, anon;
grant execute on function public.start_over_nutrition_cooking_session(uuid, timestamptz) to authenticated, service_role;

create or replace function public.create_nutrition_recipe_draft(
  p_name text default null,
  p_servings numeric default null,
  p_total_cooked_weight_g numeric default null,
  p_total_time_minutes integer default null,
  p_notes text default null,
  p_draft_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_recipe public.nutrition_recipes%rowtype;
  v_draft public.nutrition_recipe_drafts%rowtype;
  v_root_name text := coalesce(nullif(btrim(p_name), ''), 'Untitled Recipe');
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_draft_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Recipe Working Draft metadata must be an object.' using errcode = '22023';
  end if;

  insert into public.nutrition_recipes (user_id, name)
  values (v_user_id, v_root_name)
  returning * into v_recipe;

  insert into public.nutrition_recipe_drafts (
    recipe_id, user_id, base_recipe_version_id, name, servings,
    total_cooked_weight_g, total_time_minutes, notes, draft_metadata
  ) values (
    v_recipe.id, v_user_id, null, nullif(btrim(p_name), ''), p_servings,
    p_total_cooked_weight_g, p_total_time_minutes, nullif(btrim(p_notes), ''),
    coalesce(p_draft_metadata, '{}'::jsonb)
  ) returning * into v_draft;

  return jsonb_build_object(
    'recipeId', v_recipe.id,
    'draftId', v_draft.id,
    'recipe', to_jsonb(v_recipe),
    'draft', to_jsonb(v_draft)
  );
end
$function$;

revoke all on function public.create_nutrition_recipe_draft(text, numeric, numeric, integer, text, jsonb) from public, anon;
grant execute on function public.create_nutrition_recipe_draft(text, numeric, numeric, integer, text, jsonb) to authenticated, service_role;

-- Supabase-supported repository-controlled scheduler. The purge command is
-- already idempotent and service-only; pg_cron runs this as the migration owner,
-- independent of browser/page activity.
create extension if not exists pg_cron;

revoke all on schema cron from anon, authenticated;

do $scheduler$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'nutrition-v1-retention-purge-hourly'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'nutrition-v1-retention-purge-hourly',
    '17 * * * *',
    $command$select public.purge_expired_nutrition_reusable_sources();$command$
  );
end
$scheduler$;

notify pgrst, 'reload schema';
commit;
