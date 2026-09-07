import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260906183000_food_catalog_search_projection_v2.sql");
const verifierPath = resolve(process.cwd(), "supabase/verification/food-catalog-search-projection-v2.sql");
const servicePath = resolve(process.cwd(), "services/nutrition-v1/server/food-library.ts");

const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const verifier = existsSync(verifierPath) ? readFileSync(verifierPath, "utf8") : "";
const service = readFileSync(servicePath, "utf8");

describe("Food Catalog Plan 5 search projection V2", () => {
  it("defines a generation-keyed rebuildable SearchDocument projection, never canonical Food truth", () => {
    expect(migration).toContain("create table public.food_catalog_search_documents");
    expect(migration).toMatch(/generation_id\s+uuid\s+not null/);
    expect(migration).toContain("projection_version text not null");
    expect(migration).toContain("language_tag text not null");
    expect(migration).toContain("script_code text not null");
    expect(migration).toContain("normalized_display_name text not null");
    expect(migration).toContain("market_scope_codes text[] not null");
    expect(migration).toContain("nutrition_policy_version text");
    expect(migration).toContain("primary key (generation_id, food_id, language_tag, script_code, projection_version)");
    expect(migration).toContain("create or replace function public.rebuild_food_catalog_search_projection_v2");
    expect(migration).toContain("from public.food_catalog_generation_foods generation_food");
    expect(migration).toContain("join public.food_catalog_generation_names generation_name");
    expect(migration).toContain("left join public.food_nutrition_revisions nutrition");
    expect(migration).toContain("public.food_catalog_generation_markets");
    expect(migration).toContain("public.food_catalog_generation_verification");
    expect(migration).not.toMatch(/order by[^;]*(created_at|revision_number)[^;]*limit\s+1/i);
    expect(migration).not.toMatch(/max\s*\(\s*revision_number\s*\)/i);
  });

  it("keeps derived projection mutation behind service-role rebuild authority", () => {
    expect(migration).toContain("alter table public.food_catalog_search_documents enable row level security");
    expect(migration).toMatch(/revoke all on table public\.food_catalog_search_documents from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/security definer[\s\S]*rebuild_food_catalog_search_projection_v2/i);
    expect(migration).toMatch(/revoke all on function public\.rebuild_food_catalog_search_projection_v2[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.rebuild_food_catalog_search_projection_v2[\s\S]*to service_role/i);
  });

  it("searches only the current-generation projection with explicit language, script and user market context", () => {
    expect(migration).toContain("create or replace function public.search_food_catalog_v2");
    expect(migration).toContain("p_language_tag text");
    expect(migration).toContain("p_script_code text");
    expect(migration).toContain("p_market_scope_code text");
    expect(migration).toContain("food_catalog_current_generation");
    expect(migration).toContain("doc.generation_id = v_generation_id");
    expect(migration).toContain("food_catalog_search_documents doc");
    expect(migration).not.toMatch(/from public\.food_items food[\s\S]*where food\.is_global/i);
    expect(migration).not.toMatch(/locale[^\n]*(market_scope|market_context)/i);
  });

  it("uses stable context-bound keyset pagination rather than OFFSET", () => {
    expect(migration).toContain("v_cursor_context_sha256");
    expect(migration).toContain("v_expected_context_sha256");
    expect(migration).toContain("Cursor does not match Food Catalog search context");
    expect(migration).toContain("candidate.food_id::text");
    expect(migration).not.toMatch(/\boffset\b/i);
    expect(migration).toMatch(/least\(20, greatest\(1,/i);
  });

  it("implements objective ranking before user overlays and explicit market boosting without market hiding", () => {
    expect(migration).toContain("match_tier");
    expect(migration).toContain("trust_rank");
    expect(migration).toContain("market_rank");
    expect(migration).toContain("context_rank");
    expect(migration).toContain("favorite_rank");
    expect(migration).toContain("frequency_rank");
    expect(migration).toMatch(/order by candidate\.match_tier, candidate\.trust_rank, candidate\.market_rank, candidate\.context_rank,[\s\S]*candidate\.favorite_rank/i);
    expect(migration).not.toMatch(/where[^;]*market_rank\s*</i);
  });

  it("supports deterministic protein, carbs and fat < > = filters with AND semantics", () => {
    expect(migration).toContain("private.food_catalog_search_numeric_filter_matches_v2");
    expect(migration).toContain("'gt'");
    expect(migration).toContain("'lt'");
    expect(migration).toContain("'eq'");
    expect(migration).toMatch(/numeric_filter_matches_v2\(candidate\.protein_100, p_filters->'protein'\)[\s\S]*and private\.food_catalog_search_numeric_filter_matches_v2\(candidate\.carbs_100, p_filters->'carbs'\)[\s\S]*and private\.food_catalog_search_numeric_filter_matches_v2\(candidate\.fat_100, p_filters->'fat'\)/i);
  });

  it("models High Protein and Low Carb as versioned policy, with no invented threshold in Plan 5 code", () => {
    expect(migration).toContain("create table public.food_catalog_search_nutrition_policies");
    expect(migration).toContain("high_protein_min_g_per_100");
    expect(migration).toContain("low_carb_max_g_per_100");
    expect(migration).toContain("nutrition_labels");
    expect(migration).not.toMatch(/values\s*\([^;]*(20|10)[^;]*\)/i);
    expect(service).not.toContain("protein < 20");
    expect(service).not.toContain("carbs > 10");
  });

  it("keeps hydration bounded and verifies deterministic rebuild/search behavior including a benchmark", () => {
    expect(verifier).toContain("Plan 5 Search Projection V2 verification");
    expect(verifier).toContain("rebuild_food_catalog_search_projection_v2");
    expect(verifier).toContain("search_food_catalog_v2");
    expect(verifier).toContain("deterministic benchmark");
    expect(verifier).toContain("cursor context mismatch");
    expect(verifier).toContain("numeric gt lt eq");
    expect(verifier).toContain("bounded page size");
    expect(verifier).toContain("projection rebuild equality");
  });
});
