import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

function readError(label: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`Food Catalog category facet ${label} failed: ${error.message ?? "database request failed"}`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Food Catalog category facet ${label} is malformed.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Food Catalog category facet ${label} is malformed.`);
  }
  return value.trim();
}

/**
 * Enumerates filter facets from the exact current Food Catalog search projection.
 * SearchDocuments are rebuildable search/presentation state; this is not canonical
 * taxonomy authority.
 */
export async function listCurrentFoodCatalogCategoryFacets(
  catalogSupabase: SupabaseClient,
): Promise<string[]> {
  const pointerResult = await catalogSupabase
    .from("food_catalog_current_generation")
    .select("current_generation_id")
    .eq("singleton_key", true)
    .maybeSingle();
  readError("current generation read", pointerResult.error);
  if (pointerResult.data === null) {
    throw new Error("Food Catalog category facet current generation singleton is missing.");
  }

  const pointer = record(pointerResult.data, "current generation pointer");
  const rawGenerationId = pointer.current_generation_id;
  if (rawGenerationId === null) return [];
  const generationId = requiredText(rawGenerationId, "current generation ID");

  const generationResult = await catalogSupabase
    .from("food_catalog_generations")
    .select("id,projection_version")
    .eq("id", generationId)
    .maybeSingle();
  readError("generation read", generationResult.error);
  if (generationResult.data === null) {
    throw new Error("Food Catalog category facet current generation authority is missing.");
  }

  const generation = record(generationResult.data, "generation");
  const returnedGenerationId = requiredText(generation.id, "generation ID");
  if (returnedGenerationId !== generationId) {
    throw new Error("Food Catalog category facet generation does not match the current pointer.");
  }
  const projectionVersion = requiredText(generation.projection_version, "projection version");

  const categories = new Set<string>();
  for (let start = 0; ; start += PAGE_SIZE) {
    const result = await catalogSupabase
      .from("food_catalog_search_documents")
      .select("category_code,food_id,language_tag,script_code")
      .eq("generation_id", generationId)
      .eq("projection_version", projectionVersion)
      .order("category_code", { ascending: true, nullsFirst: false })
      .order("food_id", { ascending: true })
      .order("language_tag", { ascending: true })
      .order("script_code", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    readError("SearchDocument page read", result.error);
    if (!Array.isArray(result.data)) {
      throw new Error("Food Catalog category facet SearchDocument page is malformed.");
    }

    for (const value of result.data) {
      const row = record(value, "SearchDocument");
      if (typeof row.category_code !== "string") continue;
      const category = row.category_code.trim();
      if (category) categories.add(category);
    }

    if (result.data.length < PAGE_SIZE) break;
  }

  return Array.from(categories).sort();
}
