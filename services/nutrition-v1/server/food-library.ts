import type { SupabaseClient } from "@supabase/supabase-js";

export type FoodLibrarySource = "catalog" | "my_food";
export type FoodLibraryLocale = "en" | "de" | "ar";
export type FoodLibraryPreset = "high-protein" | "low-carb";
export type FoodLibraryNumericOperator = "gte" | "lte" | "eq" | "between";
export type FoodLibraryBasisUnit = "g" | "ml" | "serving" | "piece" | "custom";

export type FoodLibraryNutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basis_amount: number | null;
  basis_unit: FoodLibraryBasisUnit | null;
};

export type FoodLibraryCorrection = Partial<FoodLibraryNutrition>;

export type FoodLibraryAlias = {
  locale: FoodLibraryLocale;
  value: string;
};

export type FoodLibraryCandidate = {
  id: string;
  source: FoodLibrarySource;
  name: string;
  brand: string | null;
  category: string | null;
  cuisine: string | null;
  servingLabel: string;
  verified: boolean;
  favorite: boolean;
  recentAt: string | null;
  frequency: number;
  locale: FoodLibraryLocale;
  aliases: FoodLibraryAlias[];
  nutrition: FoodLibraryNutrition;
  tags?: string[];
  usingPersonalValues?: boolean;
};

export type FoodLibraryNumericFilter = {
  operator: FoodLibraryNumericOperator;
  value: number;
  max?: number;
};

export type FoodLibraryNutritionFilters = {
  presets?: FoodLibraryPreset[];
  protein?: FoodLibraryNumericFilter;
  carbs?: FoodLibraryNumericFilter;
  fat?: FoodLibraryNumericFilter;
  calories?: FoodLibraryNumericFilter;
};

export type FoodLibraryQuery = FoodLibraryNutritionFilters & {
  query?: string;
  locale?: FoodLibraryLocale;
  scriptCode?: string | null;
  marketScopeCode?: string | null;
  cursor?: string | null;
  limit?: number;
  category?: string | null;
  cuisine?: string | null;
  scope?: "all" | "favorites" | "recent" | "my_food";
};

export type FoodLibraryPage = {
  items: FoodLibraryCandidate[];
  nextCursor: string | null;
};

const MAX_PAGE_SIZE = 20;

function checked<T>(result: { data: T | null; error: { message?: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message ?? "database error"}`);
  return result.data as T;
}

export function normalizeFoodSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gi, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveEffectiveFoodNutrition(
  canonical: FoodLibraryNutrition,
  correction?: FoodLibraryCorrection | null,
): FoodLibraryNutrition {
  if (!correction) return { ...canonical };
  return {
    calories: correction.calories ?? canonical.calories,
    protein_g: correction.protein_g ?? canonical.protein_g,
    carbs_g: correction.carbs_g ?? canonical.carbs_g,
    fat_g: correction.fat_g ?? canonical.fat_g,
    saturated_fat_g: correction.saturated_fat_g ?? canonical.saturated_fat_g,
    fiber_g: correction.fiber_g ?? canonical.fiber_g,
    sugars_g: correction.sugars_g ?? canonical.sugars_g,
    sodium_mg: correction.sodium_mg ?? canonical.sodium_mg,
    basis_amount: correction.basis_amount ?? canonical.basis_amount,
    basis_unit: correction.basis_unit ?? canonical.basis_unit,
  };
}

function normalizedNutrient(
  nutrition: FoodLibraryNutrition,
  key: "protein_g" | "carbs_g" | "fat_g" | "calories",
) {
  const value = nutrition[key];
  if (
    value === null
    || nutrition.basis_amount === null
    || !["g", "ml"].includes(nutrition.basis_unit ?? "")
    || nutrition.basis_amount <= 0
  ) return null;
  return value * (100 / nutrition.basis_amount);
}

function numericMatch(value: number | null, filter: FoodLibraryNumericFilter | undefined) {
  if (!filter) return true;
  if (value === null || !Number.isFinite(filter.value)) return false;
  if (filter.operator === "gte") return value >= filter.value;
  if (filter.operator === "lte") return value <= filter.value;
  if (filter.operator === "eq") return Math.abs(value - filter.value) < 0.0001;
  if (!Number.isFinite(filter.max)) return false;
  const max = filter.max as number;
  return value >= Math.min(filter.value, max) && value <= Math.max(filter.value, max);
}

export function qualifiesFoodNutrition(
  nutrition: FoodLibraryNutrition,
  filters: FoodLibraryNutritionFilters,
) {
  const presets = filters.presets ?? [];
  const protein = normalizedNutrient(nutrition, "protein_g");
  const carbs = normalizedNutrient(nutrition, "carbs_g");
  const fat = normalizedNutrient(nutrition, "fat_g");
  const calories = normalizedNutrient(nutrition, "calories");
  if (presets.includes("high-protein") && (protein === null || protein < 20)) return false;
  if (presets.includes("low-carb") && (carbs === null || carbs > 10)) return false;
  if (!numericMatch(protein, filters.protein)) return false;
  if (!numericMatch(carbs, filters.carbs)) return false;
  if (!numericMatch(fat, filters.fat)) return false;
  if (!numericMatch(calories, filters.calories)) return false;
  return true;
}

function relevance(candidate: FoodLibraryCandidate, query: string, locale: FoodLibraryLocale) {
  if (!query) return { relevant: true, tier: 20 };
  const name = normalizeFoodSearchText(candidate.name);
  const aliases = candidate.aliases.map((alias) => ({ ...alias, normalized: normalizeFoodSearchText(alias.value) }));
  if (candidate.source === "my_food" && name === query) return { relevant: true, tier: 0 };
  if (candidate.source === "catalog" && name === query) return { relevant: true, tier: 1 };
  const exactAlias = aliases.find((alias) => alias.normalized === query);
  if (exactAlias) return { relevant: true, tier: exactAlias.locale === locale ? 2 : 3 };
  if (name.startsWith(query)) return { relevant: true, tier: 4 };
  if (aliases.some((alias) => alias.normalized.startsWith(query))) return { relevant: true, tier: 5 };
  if (name.includes(query) || aliases.some((alias) => alias.normalized.includes(query))) return { relevant: true, tier: 6 };
  return { relevant: false, tier: 99 };
}

function recencyMs(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rankFoodLibraryCandidates(
  candidates: readonly FoodLibraryCandidate[],
  options: { query?: string; locale?: FoodLibraryLocale } = {},
) {
  const query = normalizeFoodSearchText(options.query ?? "");
  const locale = options.locale ?? "en";
  return candidates
    .map((candidate, index) => ({ candidate, index, match: relevance(candidate, query, locale) }))
    .filter((entry) => entry.match.relevant)
    .sort((a, b) => {
      if (a.match.tier !== b.match.tier) return a.match.tier - b.match.tier;
      if (a.candidate.favorite !== b.candidate.favorite) return a.candidate.favorite ? -1 : 1;
      const recency = recencyMs(b.candidate.recentAt) - recencyMs(a.candidate.recentAt);
      if (recency) return recency;
      if (a.candidate.frequency !== b.candidate.frequency) return b.candidate.frequency - a.candidate.frequency;
      if (!query && a.candidate.source !== b.candidate.source) return a.candidate.source === "my_food" ? -1 : 1;
      const byName = a.candidate.name.localeCompare(b.candidate.name, locale);
      return byName || a.index - b.index;
    })
    .map((entry) => entry.candidate);
}

function encodeUtilityCursor(item: FoodLibraryCandidate) {
  return Buffer.from(JSON.stringify({ source: item.source, id: item.id }), "utf8").toString("base64url");
}

function decodeUtilityCursor(cursor?: string | null) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { source?: unknown; id?: unknown };
    if ((parsed.source === "catalog" || parsed.source === "my_food") && typeof parsed.id === "string") {
      return { source: parsed.source, id: parsed.id } as const;
    }
  } catch {
    // Invalid utility cursors intentionally restart from the beginning.
  }
  return null;
}

export function paginateFoodLibraryResults(
  rows: readonly FoodLibraryCandidate[],
  options: { limit?: number; cursor?: string | null } = {},
): FoodLibraryPage {
  const requested = Number(options.limit ?? MAX_PAGE_SIZE);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(requested) ? Math.floor(requested) : MAX_PAGE_SIZE));
  const cursor = decodeUtilityCursor(options.cursor);
  const start = cursor
    ? Math.max(0, rows.findIndex((row) => row.source === cursor.source && row.id === cursor.id) + 1)
    : 0;
  const items = rows.slice(start, start + limit);
  const hasMore = start + items.length < rows.length;
  return { items, nextCursor: hasMore && items.length ? encodeUtilityCursor(items.at(-1) as FoodLibraryCandidate) : null };
}

function isFoodLibraryPage(value: unknown): value is FoodLibraryPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return Array.isArray(page.items) && (page.nextCursor === null || typeof page.nextCursor === "string");
}

function filterPayload(options: FoodLibraryQuery) {
  const payload: Record<string, unknown> = {};
  if (options.presets?.length) payload.presets = options.presets;
  if (options.protein) payload.protein = options.protein;
  if (options.carbs) payload.carbs = options.carbs;
  if (options.fat) payload.fat = options.fat;
  if (options.calories) payload.calories = options.calories;
  return payload;
}

export async function listFoodLibrary(
  supabase: SupabaseClient,
  _userId: string,
  options: FoodLibraryQuery = {},
): Promise<FoodLibraryPage> {
  const requested = Number(options.limit ?? MAX_PAGE_SIZE);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(requested) ? Math.floor(requested) : MAX_PAGE_SIZE));
  const result = await supabase.rpc("search_food_catalog_v2", {
    p_query: options.query?.trim() ?? "",
    p_language_tag: options.locale ?? "en",
    p_script_code: options.scriptCode?.trim() || null,
    p_market_scope_code: options.marketScopeCode?.trim() || null,
    p_cursor: options.cursor ?? null,
    p_limit: limit,
    p_category: options.category?.trim() || null,
    p_cuisine: options.cuisine?.trim() || null,
    p_scope: options.scope ?? "all",
    p_filters: filterPayload(options),
  });
  const data = checked(result as unknown as { data: unknown; error: { message?: string } | null }, "Food Catalog V2 authoritative search");
  if (!isFoodLibraryPage(data)) throw new Error("Food Catalog V2 authoritative search returned an invalid page.");
  return data;
}

export async function setFoodFavorite(
  supabase: SupabaseClient,
  userId: string,
  foodId: string,
  favorite: boolean,
) {
  if (!foodId) throw new Error("Food ID is required.");
  if (favorite) {
    checked(await supabase.from("food_favorites").upsert({ user_id: userId, food_id: foodId }, { onConflict: "user_id,food_id" }), "Favorite Food write");
    return;
  }
  checked(await supabase.from("food_favorites").delete().eq("user_id", userId).eq("food_id", foodId), "Favorite Food delete");
}
