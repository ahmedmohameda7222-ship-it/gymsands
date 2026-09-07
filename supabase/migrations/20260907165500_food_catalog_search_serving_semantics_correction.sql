begin;

-- Food Catalog Intelligence Plan 5 P1 correction: serving display authority is
-- semantically independent from nutrition normalization basis.
--
-- The original Plan 5 rebuild generated `100 g` / `100 ml` serving labels from
-- nutrition basis. The current generation model has no deterministic preferred
-- serving-display selector, so the global SearchDocument must preserve serving
-- as unknown (NULL) rather than choose a serving option or relabel nutrition basis.
-- My Foods remain independent and continue to use their user-owned serving_size.

alter table public.food_catalog_search_documents
  alter column serving_label drop not null;

comment on column public.food_catalog_search_documents.serving_label is
  'Nullable authoritative serving-display label. Must not be inferred from nutrition basis; remains NULL until deterministic serving-display authority exists.';

comment on column public.food_catalog_search_documents.nutrition_basis_unit is
  'Derived nutrition-normalization basis unit only (g or ml when supported). This is not serving-display authority.';

-- Preserve the already-applied Plan 5 rebuild implementation as an internal
-- compatibility primitive. The public wrapper below removes its fabricated
-- serving label before exposing rebuilt SearchDocuments.
alter function public.rebuild_food_catalog_search_projection_v2(uuid, text, text)
  set schema private;

alter function private.rebuild_food_catalog_search_projection_v2(uuid, text, text)
  rename to food_catalog_search_projection_v2_legacy_rebuild;

revoke all on function private.food_catalog_search_projection_v2_legacy_rebuild(uuid, text, text)
  from public, anon, authenticated, service_role;

-- Any pre-existing SearchDocument serving labels were produced by the legacy
-- nutrition-basis derivation and therefore are not authoritative serving facts.
-- SearchDocument is rebuildable derived state, not canonical Product data.
update public.food_catalog_search_documents
set serving_label = null
where serving_label is not null;

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
  v_document_count integer;
  v_checksum text;
begin
  -- Retain all generation-selection, lifecycle, policy, normalization and
  -- deterministic rebuild checks from the frozen Plan 5 implementation.
  perform private.food_catalog_search_projection_v2_legacy_rebuild(
    p_generation_id,
    p_projection_version,
    p_nutrition_policy_version
  );

  -- There is currently no deterministic preferred-serving authority in the
  -- generation schema. Do not choose a generation serving row and do not turn
  -- 100 g / 100 ml nutrition basis into a serving.
  update public.food_catalog_search_documents
  set serving_label = null
  where generation_id = p_generation_id
    and projection_version = p_projection_version;

  -- Recompute projection evidence after the semantic correction. Both serving
  -- authority and nutrition basis are explicit checksum inputs, so future
  -- serving authority cannot change silently while rebuild equality remains
  -- deterministic today.
  select count(*)::integer,
         encode(extensions.digest(coalesce(string_agg(
           concat_ws('|', doc.food_id::text, doc.language_tag, doc.script_code,
             doc.projection_version, doc.normalized_display_name,
             array_to_string(doc.market_scope_codes, ','),
             coalesce(doc.serving_label, 'NULL'),
             coalesce(doc.nutrition_basis_unit, 'NULL'),
             coalesce(doc.protein_100::text, 'NULL'),
             coalesce(doc.carbs_100::text, 'NULL'),
             coalesce(doc.fat_100::text, 'NULL'),
             array_to_string(doc.nutrition_labels, ',')),
           '' order by doc.food_id::text, doc.language_tag, doc.script_code
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

revoke all on function public.rebuild_food_catalog_search_projection_v2(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rebuild_food_catalog_search_projection_v2(uuid, text, text)
  to service_role;

commit;
