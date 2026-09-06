begin;

-- Food Catalog Intelligence Plan 5: rebuildable derived search projection.
-- SearchDocument is read-optimized derived state only. Catalog Generation remains
-- the sole current-effective Food authority. This migration does not populate Food,
-- create/promote a generation, move the current pointer, or invent nutrition-label policy.

create extension if not exists pg_trgm;

create table public.food_catalog_search_nutrition_policies (
  policy_version text primary key check (length(btrim(policy_version)) > 0),
  high_protein_min_g_per_100 numeric not null check (high_protein_min_g_per_100 >= 0),
  low_carb_max_g_per_100 numeric not null check (low_carb_max_g_per_100 >= 0),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now()
);

alter table public.food_catalog_search_nutrition_policies enable row level security;
revoke all on table public.food_catalog_search_nutrition_policies from public, anon, authenticated, service_role;
grant select on table public.food_catalog_search_nutrition_policies to service_role;

create table public.food_catalog_search_documents (
  generation_id uuid not null,
  food_id uuid not null,
  language_tag text not null check (length(btrim(language_tag)) > 0),
  script_code text not null default '',
  projection_version text not null check (length(btrim(projection_version)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  normalized_display_name text not null check (length(btrim(normalized_display_name)) > 0),
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases) = 'array'),
  normalized_aliases text[] not null default '{}'::text[],
  category_code text,
  cuisine_code text,
  serving_label text not null,
  market_scope_codes text[] not null default '{}'::text[],
  verified boolean not null default false,
  trust_rank smallint not null check (trust_rank >= 0),
  calories_100 numeric,
  protein_100 numeric,
  carbs_100 numeric,
  fat_100 numeric,
  saturated_fat_100 numeric,
  fiber_100 numeric,
  sugars_100 numeric,
  sodium_mg_100 numeric,
  nutrition_basis_unit text,
  nutrition_policy_version text references public.food_catalog_search_nutrition_policies(policy_version) on delete restrict,
  nutrition_labels text[] not null default '{}'::text[] check (
    nutrition_labels <@ array['high-protein','low-carb']::text[]
  ),
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, search_text)) stored,
  rebuilt_at timestamptz not null default now(),
  primary key (generation_id, food_id, language_tag, script_code, projection_version),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete cascade,
  check (nutrition_policy_version is not null or cardinality(nutrition_labels) = 0)
);

alter table public.food_catalog_search_documents enable row level security;
revoke all on table public.food_catalog_search_documents from public, anon, authenticated, service_role;
grant select on table public.food_catalog_search_documents to service_role;

create index food_catalog_search_documents_generation_context_idx
  on public.food_catalog_search_documents(generation_id, projection_version, language_tag, script_code, food_id);
create index food_catalog_search_documents_display_trgm_idx
  on public.food_catalog_search_documents using gin (normalized_display_name gin_trgm_ops);
create index food_catalog_search_documents_text_trgm_idx
  on public.food_catalog_search_documents using gin (search_text gin_trgm_ops);
create index food_catalog_search_documents_fts_idx
  on public.food_catalog_search_documents using gin (search_vector);
create index food_catalog_search_documents_protein_idx
  on public.food_catalog_search_documents(generation_id, projection_version, protein_100, food_id);
create index food_catalog_search_documents_carbs_idx
  on public.food_catalog_search_documents(generation_id, projection_version, carbs_100, food_id);
create index food_catalog_search_documents_fat_idx
  on public.food_catalog_search_documents(generation_id, projection_version, fat_100, food_id);

create or replace function private.food_catalog_search_per_100_v2(
  p_value numeric,
  p_basis_amount numeric,
  p_basis_unit text
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select case
    when p_value is null
      or p_basis_amount is null
      or p_basis_amount <= 0
      or p_basis_unit not in ('g','ml')
      then null
    else p_value * (100::numeric / p_basis_amount)
  end;
$function$;

create or replace function private.food_catalog_search_numeric_filter_matches_v2(
  p_value numeric,
  p_filter jsonb
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $function$
declare
  v_operator text;
  v_value numeric;
  v_max numeric;
begin
  if p_filter is null or p_filter = 'null'::jsonb then
    return true;
  end if;
  if jsonb_typeof(p_filter) <> 'object' or p_value is null then
    return false;
  end if;

  v_operator := p_filter->>'operator';
  begin
    v_value := (p_filter->>'value')::numeric;
    if p_filter ? 'max' then
      v_max := (p_filter->>'max')::numeric;
    end if;
  exception when others then
    return false;
  end;

  if v_operator = 'gt' then return p_value > v_value; end if;
  if v_operator = 'lt' then return p_value < v_value; end if;
  if v_operator = 'eq' then return abs(p_value - v_value) < 0.0001; end if;
  -- Transitional inclusive operators remain accepted for existing Food Library UI
  -- compatibility while Plan 5 adds the explicit strict operators above.
  if v_operator = 'gte' then return p_value >= v_value; end if;
  if v_operator = 'lte' then return p_value <= v_value; end if;
  if v_operator = 'between' and v_max is not null then
    return p_value between least(v_value, v_max) and greatest(v_value, v_max);
  end if;
  return false;
end
$function$;

create or replace function public.rebuild_food_catalog_search_projection_v2(
  p_generation_id uuid,
  p_projection_version text,
  p_nutrition_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_generation_projection_version text;
  v_policy public.food_catalog_search_nutrition_policies%rowtype;
  v_document_count integer;
  v_checksum text;
begin
  if p_generation_id is null or nullif(btrim(p_projection_version), '') is null then
    raise exception 'Generation ID and projection version are required.' using errcode = '22023';
  end if;

  select generation.projection_version
    into v_generation_projection_version
  from public.food_catalog_generations generation
  where generation.id = p_generation_id;

  if not found then
    raise exception 'Food Catalog generation does not exist.' using errcode = '22023';
  end if;
  if v_generation_projection_version <> p_projection_version then
    raise exception 'Projection version must match the exact Catalog Generation authority.' using errcode = '22023';
  end if;

  if p_nutrition_policy_version is not null then
    select * into v_policy
    from public.food_catalog_search_nutrition_policies policy
    where policy.policy_version = p_nutrition_policy_version;
    if not found then
      raise exception 'Food Catalog nutrition label policy is not configured.' using errcode = '22023';
    end if;
  end if;

  delete from public.food_catalog_search_documents doc
  where doc.generation_id = p_generation_id
    and doc.projection_version = p_projection_version;

  insert into public.food_catalog_search_documents (
    generation_id, food_id, language_tag, script_code, projection_version,
    display_name, normalized_display_name, aliases, normalized_aliases,
    category_code, cuisine_code, serving_label, market_scope_codes,
    verified, trust_rank,
    calories_100, protein_100, carbs_100, fat_100, saturated_fat_100,
    fiber_100, sugars_100, sodium_mg_100, nutrition_basis_unit,
    nutrition_policy_version, nutrition_labels, search_text
  )
  with name_contexts as (
    select distinct
      generation_food.food_id,
      name_fact.language_tag,
      coalesce(name_fact.script_code, '') as script_code
    from public.food_catalog_generation_foods generation_food
    join public.food_catalog_generation_names generation_name
      on generation_name.generation_id = generation_food.generation_id
     and generation_name.food_id = generation_food.food_id
    join public.food_names name_fact
      on name_fact.id = generation_name.name_fact_id
     and name_fact.food_id = generation_food.food_id
    where generation_food.generation_id = p_generation_id
      and generation_food.lifecycle = 'active'
  ),
  name_rollup as (
    select
      context.food_id,
      context.language_tag,
      context.script_code,
      (array_agg(
        name_fact.name_text
        order by case name_fact.name_role
          when 'preferred_display' then 0
          when 'source_name' then 1
          when 'synonym' then 2
          when 'search_alias' then 3
          when 'transliteration' then 4
          else 9 end,
          name_fact.normalized_text,
          name_fact.id::text
      ))[1] as display_name,
      (array_agg(
        name_fact.normalized_text
        order by case name_fact.name_role
          when 'preferred_display' then 0
          when 'source_name' then 1
          when 'synonym' then 2
          when 'search_alias' then 3
          when 'transliteration' then 4
          else 9 end,
          name_fact.normalized_text,
          name_fact.id::text
      ))[1] as normalized_display_name,
      jsonb_agg(
        jsonb_build_object(
          'locale', name_fact.language_tag,
          'script', name_fact.script_code,
          'role', name_fact.name_role,
          'value', name_fact.name_text
        )
        order by name_fact.name_role, name_fact.normalized_text, name_fact.id::text
      ) as aliases,
      array_agg(distinct name_fact.normalized_text order by name_fact.normalized_text) as normalized_aliases
    from name_contexts context
    join public.food_catalog_generation_names generation_name
      on generation_name.generation_id = p_generation_id
     and generation_name.food_id = context.food_id
    join public.food_names name_fact
      on name_fact.id = generation_name.name_fact_id
     and name_fact.food_id = context.food_id
     and name_fact.language_tag = context.language_tag
     and coalesce(name_fact.script_code, '') = context.script_code
    group by context.food_id, context.language_tag, context.script_code
  ),
  selected as (
    select
      generation_food.food_id,
      names.language_tag,
      names.script_code,
      names.display_name,
      names.normalized_display_name,
      names.aliases,
      names.normalized_aliases,
      taxonomy.category_code,
      markets.market_scope_codes,
      coalesce(verification.identity_verified, false)
        and coalesce(verification.nutrition_verified, false) as verified,
      private.food_catalog_search_per_100_v2(nutrition.calories, nutrition.basis_amount, nutrition.basis_unit) as calories_100,
      private.food_catalog_search_per_100_v2(nutrition.protein_g, nutrition.basis_amount, nutrition.basis_unit) as protein_100,
      private.food_catalog_search_per_100_v2(nutrition.carbs_g, nutrition.basis_amount, nutrition.basis_unit) as carbs_100,
      private.food_catalog_search_per_100_v2(nutrition.fat_g, nutrition.basis_amount, nutrition.basis_unit) as fat_100,
      private.food_catalog_search_per_100_v2(nutrition.saturated_fat_g, nutrition.basis_amount, nutrition.basis_unit) as saturated_fat_100,
      private.food_catalog_search_per_100_v2(nutrition.fiber_g, nutrition.basis_amount, nutrition.basis_unit) as fiber_100,
      private.food_catalog_search_per_100_v2(nutrition.sugars_g, nutrition.basis_amount, nutrition.basis_unit) as sugars_100,
      private.food_catalog_search_per_100_v2(nutrition.sodium_mg, nutrition.basis_amount, nutrition.basis_unit) as sodium_mg_100,
      nutrition.basis_unit as nutrition_basis_unit
    from public.food_catalog_generation_foods generation_food
    join name_rollup names on names.food_id = generation_food.food_id
    left join public.food_nutrition_revisions nutrition
      on nutrition.id = generation_food.nutrition_revision_id
     and nutrition.food_id = generation_food.food_id
    left join lateral (
      select min(node.node_code) as category_code
      from public.food_catalog_generation_taxonomy generation_taxonomy
      join public.food_taxonomy_assignments assignment
        on assignment.id = generation_taxonomy.taxonomy_assignment_id
       and assignment.food_id = generation_food.food_id
      join public.food_taxonomy_nodes node
        on node.node_code = assignment.node_code
       and node.namespace_code = 'primary_food_group'
      where generation_taxonomy.generation_id = generation_food.generation_id
        and generation_taxonomy.food_id = generation_food.food_id
    ) taxonomy on true
    left join lateral (
      select coalesce(array_agg(assignment.scope_code order by assignment.scope_code), '{}'::text[]) as market_scope_codes
      from public.food_catalog_generation_markets generation_market
      join public.food_market_assignments assignment
        on assignment.id = generation_market.market_assignment_id
       and assignment.food_id = generation_food.food_id
      where generation_market.generation_id = generation_food.generation_id
        and generation_market.food_id = generation_food.food_id
    ) markets on true
    left join lateral (
      select
        bool_or(generation_verification.assertion_scope = 'identity' and assertion.assertion_state = 'verified') as identity_verified,
        bool_or(generation_verification.assertion_scope = 'nutrition' and assertion.assertion_state = 'verified') as nutrition_verified
      from public.food_catalog_generation_verification generation_verification
      join public.food_verification_assertions assertion
        on assertion.id = generation_verification.assertion_id
       and assertion.food_id = generation_food.food_id
       and assertion.assertion_scope = generation_verification.assertion_scope
      where generation_verification.generation_id = generation_food.generation_id
        and generation_verification.food_id = generation_food.food_id
    ) verification on true
    where generation_food.generation_id = p_generation_id
      and generation_food.lifecycle = 'active'
  )
  select
    p_generation_id,
    selected.food_id,
    selected.language_tag,
    selected.script_code,
    p_projection_version,
    selected.display_name,
    selected.normalized_display_name,
    selected.aliases,
    selected.normalized_aliases,
    selected.category_code,
    null::text as cuisine_code,
    case
      when selected.nutrition_basis_unit = 'ml' then '100 ml'
      else '100 g'
    end as serving_label,
    coalesce(selected.market_scope_codes, '{}'::text[]),
    selected.verified,
    case when selected.verified then 0 else 1 end::smallint,
    selected.calories_100,
    selected.protein_100,
    selected.carbs_100,
    selected.fat_100,
    selected.saturated_fat_100,
    selected.fiber_100,
    selected.sugars_100,
    selected.sodium_mg_100,
    selected.nutrition_basis_unit,
    p_nutrition_policy_version,
    case when p_nutrition_policy_version is null then '{}'::text[] else
      array_remove(array[
        case when selected.protein_100 is not null
          and selected.protein_100 >= v_policy.high_protein_min_g_per_100
          then 'high-protein' end,
        case when selected.carbs_100 is not null
          and selected.carbs_100 <= v_policy.low_carb_max_g_per_100
          then 'low-carb' end
      ]::text[], null)
    end,
    concat_ws(' ',
      selected.normalized_display_name,
      array_to_string(selected.normalized_aliases, ' '),
      selected.category_code
    )
  from selected;

  select count(*)::integer,
         encode(extensions.digest(coalesce(string_agg(
           concat_ws('|', doc.food_id::text, doc.language_tag, doc.script_code,
             doc.projection_version, doc.normalized_display_name,
             array_to_string(doc.market_scope_codes, ','),
             coalesce(doc.protein_100::text, 'NULL'),
             coalesce(doc.carbs_100::text, 'NULL'),
             coalesce(doc.fat_100::text, 'NULL'),
             array_to_string(doc.nutrition_labels, ','))
           order by doc.food_id::text, doc.language_tag, doc.script_code
         ), ''), 'sha256'), 'hex')
    into v_document_count, v_checksum
  from public.food_catalog_search_documents doc
  where doc.generation_id = p_generation_id
    and doc.projection_version = p_projection_version;

  return jsonb_build_object(
    'generationId', p_generation_id,
    'projectionVersion', p_projection_version,
    'nutritionPolicyVersion', p_nutrition_policy_version,
    'documentCount', v_document_count,
    'projectionChecksumSha256', v_checksum
  );
end
$function$;

revoke all on function public.rebuild_food_catalog_search_projection_v2(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rebuild_food_catalog_search_projection_v2(uuid, text, text) to service_role;

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
set search_path = pg_catalog, public, private, extensions, auth
as $function$
declare
  v_user_id uuid := auth.uid();
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
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
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
    where log.user_id = v_user_id and log.food_item_id is not null
    group by log.food_item_id
    union all
    select 'my_food'::text, log.user_food_item_id,
           count(*)::bigint, max(log.created_at)
    from public.food_logs log
    where log.user_id = v_user_id and log.user_food_item_id is not null
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
      correction.food_id is not null as using_personal_values,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.calories, doc.calories_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as calories_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.protein_g, doc.protein_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as protein_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.carbs_g, doc.carbs_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as carbs_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.fat_g, doc.fat_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as fat_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.saturated_fat_g, doc.saturated_fat_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as saturated_fat_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.fiber_g, doc.fiber_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as fiber_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.sugars_g, doc.sugars_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as sugars_100,
      private.food_catalog_search_per_100_v2(
        coalesce(correction.sodium_mg, doc.sodium_mg_100),
        coalesce(correction.basis_amount, 100),
        coalesce(correction.basis_unit, doc.nutrition_basis_unit)
      ) as sodium_mg_100,
      coalesce(correction.basis_unit, doc.nutrition_basis_unit) as nutrition_basis_unit,
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
      on favorite.user_id = v_user_id and favorite.food_id = doc.food_id
    left join usage_rows usage
      on usage.source = 'catalog' and usage.item_id = doc.food_id
    left join public.food_personal_corrections correction
      on correction.user_id = v_user_id and correction.food_id = doc.food_id and correction.is_active = true
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
    where food.user_id = v_user_id
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

revoke all on function public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb) from public, anon;
grant execute on function public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb) to authenticated, service_role;

commit;
