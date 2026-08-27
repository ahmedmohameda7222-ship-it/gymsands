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
const CANDIDATE_LIMIT = 80;

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function localeOrEnglish(value: unknown): FoodLibraryLocale {
  return value === "de" || value === "ar" ? value : "en";
}

function basisUnit(value: unknown): FoodLibraryBasisUnit | null {
  return value === "g" || value === "ml" || value === "serving" || value === "piece" || value === "custom" ? value : null;
}

function rowRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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

function normalizedNutrient(nutrition: FoodLibraryNutrition, key: "protein_g" | "carbs_g" | "fat_g" | "calories") {
  const value = nutrition[key];
  if (value === null || nutrition.basis_amount === null || !["g", "ml"].includes(nutrition.basis_unit ?? "") || nutrition.basis_amount <= 0) return null;
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

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    const offset = Number(decoded.offset);
    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

export function paginateFoodLibraryResults(
  rows: readonly FoodLibraryCandidate[],
  options: { limit?: number; cursor?: string | null } = {},
): FoodLibraryPage {
  const requested = Number(options.limit ?? MAX_PAGE_SIZE);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(requested) ? Math.floor(requested) : MAX_PAGE_SIZE));
  const offset = decodeCursor(options.cursor);
  const items = rows.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return { items, nextCursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null };
}

function nutritionFromCatalog(row: Record<string, unknown>): FoodLibraryNutrition {
  const unit = basisUnit(row.nutrition_basis_unit);
  return {
    calories: numeric(row.calories), protein_g: numeric(row.protein_g), carbs_g: numeric(row.carbs_g), fat_g: numeric(row.fat_g),
    saturated_fat_g: numeric(row.saturated_fat_g), fiber_g: numeric(row.fiber_g), sugars_g: numeric(row.sugars_g), sodium_mg: numeric(row.sodium_mg),
    basis_amount: numeric(row.nutrition_basis_amount), basis_unit: unit === "g" || unit === "ml" ? unit : null,
  };
}

function nutritionFromMyFood(row: Record<string, unknown>): FoodLibraryNutrition {
  return {
    calories: numeric(row.calories), protein_g: numeric(row.protein_g), carbs_g: numeric(row.carbs_g), fat_g: numeric(row.fat_g),
    saturated_fat_g: null, fiber_g: null, sugars_g: null, sodium_mg: null,
    basis_amount: numeric(row.nutrition_basis_amount), basis_unit: basisUnit(row.nutrition_basis_unit),
  };
}

function parseCorrection(row: Record<string, unknown>): FoodLibraryCorrection {
  const unit = basisUnit(row.basis_unit);
  return {
    calories: numeric(row.calories), protein_g: numeric(row.protein_g), carbs_g: numeric(row.carbs_g), fat_g: numeric(row.fat_g),
    saturated_fat_g: numeric(row.saturated_fat_g), fiber_g: numeric(row.fiber_g), sugars_g: numeric(row.sugars_g), sodium_mg: numeric(row.sodium_mg),
    basis_amount: numeric(row.basis_amount), basis_unit: unit === "g" || unit === "ml" ? unit : null,
  };
}

function usageKey(source: FoodLibrarySource, id: string) {
  return `${source}:${id}`;
}

function safeSearchPattern(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

export async function listFoodLibrary(
  supabase: SupabaseClient,
  userId: string,
  options: FoodLibraryQuery = {},
): Promise<FoodLibraryPage> {
  const query = (options.query ?? "").trim();
  const locale = options.locale ?? "en";
  const pattern = safeSearchPattern(query);

  let catalogQuery = supabase.from("food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category,cuisine,tags,is_verified,saturated_fat_g,fiber_g,sugars_g,sodium_mg,nutrition_basis_amount,nutrition_basis_unit,lifecycle_status").eq("is_global", true).eq("lifecycle_status", "active").order("food_name", { ascending: true }).limit(CANDIDATE_LIMIT);
  if (pattern) catalogQuery = catalogQuery.ilike("food_name", `%${pattern}%`);

  let myFoodQuery = supabase.from("user_food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category,tags,created_at,nutrition_basis_amount,nutrition_basis_unit,deleted_at").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  if (pattern) myFoodQuery = myFoodQuery.ilike("food_name", `%${pattern}%`);

  let aliasQuery = supabase.from("food_aliases").select("food_id,locale,alias").limit(CANDIDATE_LIMIT);
  if (pattern) aliasQuery = aliasQuery.ilike("alias", `%${pattern}%`);

  const [catalogResult, myFoodResult, aliasResult, favoriteResult, correctionResult, logResult] = await Promise.all([
    catalogQuery,
    myFoodQuery,
    aliasQuery,
    supabase.from("food_favorites").select("food_id").eq("user_id", userId).limit(250),
    supabase.from("food_personal_corrections").select("food_id,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,basis_amount,basis_unit").eq("user_id", userId).eq("is_active", true).limit(250),
    supabase.from("food_logs").select("food_item_id,user_food_item_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(250),
  ]);

  const catalogRows = [...checked(catalogResult, "Food Library catalog read")] as Array<Record<string, unknown>>;
  const myFoodRows = checked(myFoodResult, "Food Library personal read") as Array<Record<string, unknown>>;
  const aliasRows = checked(aliasResult, "Food Library alias read") as Array<Record<string, unknown>>;
  const favoriteRows = checked(favoriteResult, "Food Library favorites read") as Array<Record<string, unknown>>;
  const correctionRows = checked(correctionResult, "Food Library corrections read") as Array<Record<string, unknown>>;
  const logRows = checked(logResult, "Food Library usage read") as Array<Record<string, unknown>>;

  const aliasFoodIds = Array.from(new Set(aliasRows.map((row) => stringOrNull(row.food_id)).filter((id): id is string => Boolean(id))));
  const presentCatalogIds = new Set(catalogRows.map((row) => String(row.id)));
  const missingAliasIds = aliasFoodIds.filter((id) => !presentCatalogIds.has(id));
  if (missingAliasIds.length) {
    const extra = await supabase.from("food_items").select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g,category,cuisine,tags,is_verified,saturated_fat_g,fiber_g,sugars_g,sodium_mg,nutrition_basis_amount,nutrition_basis_unit,lifecycle_status").in("id", missingAliasIds.slice(0, CANDIDATE_LIMIT)).eq("is_global", true).eq("lifecycle_status", "active");
    catalogRows.push(...(checked(extra, "Food Library alias identities read") as Array<Record<string, unknown>>));
  }

  const aliases = new Map<string, FoodLibraryAlias[]>();
  for (const raw of aliasRows) {
    const row = rowRecord(raw);
    const foodId = stringOrNull(row.food_id);
    const value = stringOrNull(row.alias);
    if (!foodId || !value) continue;
    const entry = { locale: localeOrEnglish(row.locale), value };
    aliases.set(foodId, [...(aliases.get(foodId) ?? []), entry]);
  }

  const favoriteIds = new Set(favoriteRows.map((raw) => stringOrNull(rowRecord(raw).food_id)).filter((id): id is string => Boolean(id)));
  const corrections = new Map<string, FoodLibraryCorrection>();
  for (const raw of correctionRows) {
    const row = rowRecord(raw);
    const foodId = stringOrNull(row.food_id);
    if (foodId) corrections.set(foodId, parseCorrection(row));
  }

  const usage = new Map<string, { frequency: number; recentAt: string | null }>();
  for (const raw of logRows) {
    const row = rowRecord(raw);
    const catalogId = stringOrNull(row.food_item_id);
    const myFoodId = stringOrNull(row.user_food_item_id);
    const key = catalogId ? usageKey("catalog", catalogId) : myFoodId ? usageKey("my_food", myFoodId) : null;
    if (!key) continue;
    const previous = usage.get(key) ?? { frequency: 0, recentAt: null };
    usage.set(key, { frequency: previous.frequency + 1, recentAt: previous.recentAt ?? stringOrNull(row.created_at) });
  }

  const candidates: FoodLibraryCandidate[] = [];
  for (const raw of catalogRows) {
    const row = rowRecord(raw);
    const id = String(row.id);
    const baseNutrition = nutritionFromCatalog(row);
    const correction = corrections.get(id);
    const use = usage.get(usageKey("catalog", id));
    candidates.push({ id, source: "catalog", name: stringOrNull(row.food_name) ?? "Food", brand: null, category: stringOrNull(row.category), cuisine: stringOrNull(row.cuisine), servingLabel: stringOrNull(row.serving_size) ?? "Serving", verified: row.is_verified === true, favorite: favoriteIds.has(id), recentAt: use?.recentAt ?? null, frequency: use?.frequency ?? 0, locale, aliases: aliases.get(id) ?? [], nutrition: resolveEffectiveFoodNutrition(baseNutrition, correction), tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [], usingPersonalValues: Boolean(correction) });
  }

  for (const raw of myFoodRows) {
    const row = rowRecord(raw);
    const id = String(row.id);
    const use = usage.get(usageKey("my_food", id));
    candidates.push({ id, source: "my_food", name: stringOrNull(row.food_name) ?? "Food", brand: null, category: stringOrNull(row.category), cuisine: null, servingLabel: stringOrNull(row.serving_size) ?? "Serving", verified: false, favorite: false, recentAt: use?.recentAt ?? null, frequency: use?.frequency ?? 0, locale, aliases: [], nutrition: nutritionFromMyFood(row), tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [], usingPersonalValues: false });
  }

  const scope = options.scope ?? "all";
  const category = normalizeFoodSearchText(options.category ?? "");
  const cuisine = normalizeFoodSearchText(options.cuisine ?? "");
  const filtered = candidates.filter((candidate) => {
    if (scope === "favorites" && !candidate.favorite) return false;
    if (scope === "recent" && !candidate.recentAt) return false;
    if (scope === "my_food" && candidate.source !== "my_food") return false;
    if (category && normalizeFoodSearchText(candidate.category ?? "") !== category) return false;
    if (cuisine && normalizeFoodSearchText(candidate.cuisine ?? "") !== cuisine) return false;
    return qualifiesFoodNutrition(candidate.nutrition, options);
  });

  return paginateFoodLibraryResults(rankFoodLibraryCandidates(filtered, { query, locale }), { limit: options.limit, cursor: options.cursor });
}

export async function setFoodFavorite(supabase: SupabaseClient, userId: string, foodId: string, favorite: boolean) {
  if (!foodId) throw new Error("Food ID is required.");
  if (favorite) {
    const result = await supabase.from("food_favorites").upsert({ user_id: userId, food_id: foodId }, { onConflict: "user_id,food_id" });
    checked(result, "Food favorite write");
  } else {
    const result = await supabase.from("food_favorites").delete().eq("user_id", userId).eq("food_id", foodId);
    checked(result, "Food favorite delete");
  }
  return { foodId, favorite };
}
