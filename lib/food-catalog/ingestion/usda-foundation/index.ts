import { createHash } from "node:crypto";
import type { FoodCatalogSourceAdapter } from "../adapter";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogNutrition,
  FoodCatalogServingEvidence,
  FoodCatalogSourceDescriptor
} from "../contracts";
import { stableJson } from "../manifest";

export type UsdaFoundationConfig = {
  schemaVersion: string;
  adapterVersion: string;
  nutrition: {
    calories: number[];
    protein_g: number[];
    fat_g: number[];
    carbs_g: number[];
    fiber_g: number[];
    saturated_fat_g: number[];
    sugars_g: number[];
    sodium_mg: number[];
  };
  legacyEnergyFallback: boolean;
  namingPolicy: string;
  belowLimitPolicy: string;
  taxonomyMappings: Record<string, string>;
  marketPolicy: string;
  identityPolicy: string;
  basis: string;
};

export type UsdaFoundationLock = {
  provider: string;
  dataset: string;
  release: string;
  sourceReleaseDate: string;
  sourceVersion: string;
  sourceFilename: string;
  sourceJsonFilename: string;
  sourceUrl: string;
  sourceChecksumSha256: string;
  sourceBytes: number;
  importerVersion: string;
  configChecksumSha256: string;
  licenseName: string;
  licenseReference: string;
  expectedDataType: string;
  productionAuthority: false;
  config: UsdaFoundationConfig;
};

type UsdaNutrient = {
  id?: number;
  nutrient?: { id?: number; name?: string; unitName?: string };
  amount?: number | null;
  loq?: number | null;
  foodNutrientDerivation?: { code?: string; description?: string };
  footnote?: string | null;
  [key: string]: unknown;
};

type UsdaPortion = {
  id?: number;
  amount?: number | null;
  gramWeight?: number | null;
  measureUnit?: { id?: number; name?: string; abbreviation?: string };
  modifier?: string;
  [key: string]: unknown;
};

export type UsdaFoundationFood = {
  fdcId: number;
  ndbNumber?: unknown;
  dataType: string;
  description: string;
  publicationDate?: string;
  foodCategory?: { description?: string; id?: number; code?: string } | null;
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[] | null;
  [key: string]: unknown;
};

export type ParsedFoundationJson = {
  foods: UsdaFoundationFood[];
  nullSlotCount: number;
};

export type UsdaFoundationArtifact = {
  sourceZipSha256: string;
  sourceZipBytes: number;
  foods: readonly UsdaFoundationFood[];
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * NDB numbers identify a Foundation Food across updated/versioned FDC records.
 * USDA NDB numbers are numeric identifiers conventionally represented with five
 * digits. Normalize leading zeroes, but refuse nonnumeric or unsafe forms.
 * Never derive identity from descriptions or nutrient resemblance.
 */
export function normalizeUsdaFoundationNdbNumber(raw: unknown): {
  status: "present" | "missing" | "malformed";
  normalized: string | null;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { status: "missing", normalized: null };
  }
  const token = typeof raw === "number"
    ? Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null
    : typeof raw === "string" ? raw.trim() : null;
  if (token === null || !/^\d{1,8}$/.test(token)) {
    return { status: "malformed", normalized: null };
  }
  const numeric = Number(token);
  if (!Number.isSafeInteger(numeric) || numeric === 0) {
    return { status: "malformed", normalized: null };
  }
  return { status: "present", normalized: String(numeric).padStart(5, "0") };
}

export function usdaFoundationSemanticSignature(normalizedNdb: string): string {
  return "usda-foundation-semantic-identity-v1:" + digest(stableJson({
    algorithm: "usda-foundation-semantic-identity-v1",
    provider: "USDA_FDC",
    dataset: "FoundationFoods",
    ndbNumber: normalizedNdb
  }));
}

function sortObjects<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
}

function canonicalRawFood(food: UsdaFoundationFood): UsdaFoundationFood {
  const result = structuredClone(food);
  for (const key of ["foodNutrients", "foodPortions", "foodAttributes", "inputFoods"] as const) {
    const list = result[key];
    if (Array.isArray(list)) result[key] = sortObjects(list);
  }
  return result;
}

function validateFoodShape(food: unknown, slot: number): asserts food is UsdaFoundationFood {
  if (!food || typeof food !== "object" || Array.isArray(food)) {
    throw new Error(`Invalid Foundation food record at slot ${slot}.`);
  }
  const f = food as Partial<UsdaFoundationFood>;
  if (!Number.isSafeInteger(f.fdcId) || (f.fdcId ?? 0) <= 0) {
    throw new Error(`Invalid Foundation fdcId at slot ${slot}.`);
  }
  if (f.dataType !== "Foundation") {
    throw new Error(`Unexpected USDA dataType at slot ${slot}: expected Foundation.`);
  }
  if (typeof f.description !== "string") throw new Error(`Missing USDA description for fdcId ${f.fdcId}.`);
  if (!Array.isArray(f.foodNutrients)) throw new Error(`Invalid USDA foodNutrients for fdcId ${f.fdcId}.`);
  if (f.foodPortions !== undefined && f.foodPortions !== null && !Array.isArray(f.foodPortions)) {
    throw new Error(`Invalid USDA foodPortions for fdcId ${f.fdcId}.`);
  }
}

export function parseUsdaFoundationJson(json: string): ParsedFoundationJson {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected FoundationFoods JSON root object.");
  }
  const root = parsed as Record<string, unknown>;
  if (Object.keys(root).length !== 1 || !Array.isArray(root.FoundationFoods)) {
    throw new Error("Expected exact FoundationFoods-only JSON archive.");
  }
  let nullSlotCount = 0;
  const foods: UsdaFoundationFood[] = [];
  const ids = new Set<number>();
  for (const [slot, raw] of root.FoundationFoods.entries()) {
    // The exact April 2026 JSON contains null array placeholders, not foods.
    // They are explicitly accounted for in QA, never silently treated as candidates.
    if (raw === null) {
      nullSlotCount += 1;
      continue;
    }
    validateFoodShape(raw, slot);
    if (ids.has(raw.fdcId)) throw new Error(`Duplicate Foundation fdcId: ${raw.fdcId}.`);
    ids.add(raw.fdcId);
    foods.push(raw);
  }
  return {
    foods: foods.sort((a, b) => a.fdcId - b.fdcId),
    nullSlotCount
  };
}

function assertLockedSource(lock: UsdaFoundationLock, artifact: UsdaFoundationArtifact): void {
  if (
    lock.provider !== "USDA_FDC" || lock.dataset !== "FoundationFoods"
    || lock.release !== "2026-04-30" || lock.sourceVersion !== "2026-04-30"
    || lock.sourceReleaseDate !== "2026-04-30" || lock.expectedDataType !== "Foundation"
    || lock.productionAuthority !== false
    || lock.sourceFilename !== "FoodData_Central_foundation_food_json_2026-04-30.zip"
    || lock.sourceJsonFilename !== "FoodData_Central_foundation_food_json_2026-04-30.json"
  ) throw new Error("Wrong or unauthorized USDA Foundation release lock.");
  if (
    artifact.sourceZipSha256 !== lock.sourceChecksumSha256
    || artifact.sourceZipBytes !== lock.sourceBytes
  ) throw new Error("USDA Foundation source checksum or byte-size mismatch.");
}

function mapNutrition(food: UsdaFoundationFood, lock: UsdaFoundationLock): {
  nutrition: FoodCatalogNutrition;
  rawNutrients: UsdaNutrient[];
  selectedNutrientIds: Record<string, number | null>;
  belowLimitNutrientIds: number[];
  numericLoqNutrientIds: number[];
  textualLoqNutrientIds: number[];
} {
  const source = sortObjects(food.foodNutrients ?? []);
  const byId = new Map<number, UsdaNutrient>();
  for (const entry of source) {
    const id = entry.nutrient?.id;
    if (!Number.isSafeInteger(id) || id === undefined) {
      throw new Error(`Invalid nutrient identity on USDA Foundation fdcId ${food.fdcId}.`);
    }
    if (byId.has(id)) {
      throw new Error(`Ambiguous duplicate nutrient ${id} on USDA Foundation fdcId ${food.fdcId}.`);
    }
    byId.set(id, entry);
  }
  const selectedNutrientIds: Record<string, number | null> = {};
  const belowLimitNutrientIds: number[] = [];
  const numericLoqNutrientIds: number[] = [];
  const textualLoqNutrientIds: number[] = [];
  const units: Record<string, string> = {
    calories: "kcal", protein_g: "g", fat_g: "g", carbs_g: "g",
    fiber_g: "g", saturated_fat_g: "g", sugars_g: "g", sodium_mg: "mg"
  };
  const pick = (field: keyof UsdaFoundationConfig["nutrition"]): number | null => {
    selectedNutrientIds[field] = null;
    for (const id of lock.config.nutrition[field]) {
      const entry = byId.get(id);
      if (!entry || entry.amount === null || entry.amount === undefined) continue;
      if (typeof entry.amount !== "number" || !Number.isFinite(entry.amount)) {
        throw new Error(`Non-numeric USDA nutrient ${id} on fdcId ${food.fdcId}.`);
      }
      if (entry.nutrient?.unitName !== units[field]) {
        throw new Error(`Unexpected USDA nutrient unit for ${field}, id ${id}, fdcId ${food.fdcId}.`);
      }
      selectedNutrientIds[field] = id;
      const explanatory = [
        entry.footnote,
        entry.foodNutrientDerivation?.description,
        entry.foodNutrientDerivation?.code
      ].filter(Boolean).join(" ");
      const belowLimit = /below\s+(?:the\s+)?(?:detection|quantification|reporting|limit)|less\s+than\s+(?:the\s+)?(?:limit|loq|lod)|\b(?:loq|lod|not detected|undetected)\b|<\s*(?:loq|lod)/i.test(explanatory);
      if (entry.loq !== undefined && entry.loq !== null
        && (typeof entry.loq !== "number" || !Number.isFinite(entry.loq) || entry.loq < 0)) {
        throw new Error(`Invalid numeric USDA loq for nutrient ${id}, fdcId ${food.fdcId}.`);
      }
      const numericBelowLimit = entry.amount === 0
        && typeof entry.loq === "number" && entry.loq > 0;
      const textualBelowLimit = entry.amount === 0 && belowLimit;
      if (numericBelowLimit || textualBelowLimit) {
        belowLimitNutrientIds.push(id);
        if (numericBelowLimit) numericLoqNutrientIds.push(id);
        if (textualBelowLimit) textualLoqNutrientIds.push(id);
        return null;
      }
      return entry.amount;
    }
    return null;
  };
  const nutrition: FoodCatalogNutrition = {
    calories: pick("calories"),
    protein_g: pick("protein_g"),
    fat_g: pick("fat_g"),
    carbs_g: pick("carbs_g"),
    fiber_g: pick("fiber_g"),
    saturated_fat_g: pick("saturated_fat_g"),
    sugars_g: pick("sugars_g"),
    sodium_mg: pick("sodium_mg"),
    basis_amount: 100,
    basis_unit: "g"
  };
  return { nutrition, rawNutrients: source, selectedNutrientIds, belowLimitNutrientIds, numericLoqNutrientIds, textualLoqNutrientIds };
}

function portionsFor(food: UsdaFoundationFood): {
  servings: FoodCatalogServingEvidence[];
  rawPortions: UsdaPortion[];
  unusablePortionIds: number[];
} {
  const rawPortions = sortObjects(food.foodPortions ?? []);
  const ids = new Map<number, number>();
  for (const portion of rawPortions) {
    if (Number.isSafeInteger(portion.id)) ids.set(portion.id!, (ids.get(portion.id!) ?? 0) + 1);
  }
  const servings: FoodCatalogServingEvidence[] = [];
  const unusablePortionIds: number[] = [];
  for (const portion of rawPortions) {
    const amount = portion.amount;
    const weight = portion.gramWeight;
    const unit = portion.measureUnit?.name;
    if (
      !Number.isSafeInteger(portion.id) || (ids.get(portion.id!) ?? 0) !== 1
      || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0
      || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0
      || typeof unit !== "string" || !unit.trim()
    ) {
      unusablePortionIds.push(portion.id ?? -1);
      continue;
    }
    servings.push({
      servingKey: `usda-foundation-portion:${portion.id}`,
      amount, unit, gramWeight: weight, milliliterVolume: null,
      label: [String(amount), unit, portion.modifier].filter(Boolean).join(" "),
      sourceEvidence: portion
    });
  }
  return { servings: sortObjects(servings), rawPortions, unusablePortionIds: unusablePortionIds.sort((a, b) => a - b) };
}

function evidenceFromDescription(description: string): { state: string | null; preparation: string | null; form: string | null } {
  const terms = description.toLowerCase().split(/[,;]+/).map((part) => part.trim());
  const states = terms.filter((part) => /^(raw|cooked|frozen|dried)$/.test(part));
  return {
    state: states.length === 1 ? states[0]! : null,
    preparation: null,
    form: null
  };
}

function toCandidate(food: UsdaFoundationFood, lock: UsdaFoundationLock): FoodCatalogCandidateInput {
  const normalizedRaw = canonicalRawFood(food);
  const { nutrition, rawNutrients, selectedNutrientIds, belowLimitNutrientIds,
    numericLoqNutrientIds, textualLoqNutrientIds } = mapNutrition(food, lock);
  const ndb = normalizeUsdaFoundationNdbNumber(food.ndbNumber);
  const { servings, rawPortions, unusablePortionIds } = portionsFor(food);
  const category = food.foodCategory?.description ?? null;
  return {
    sourceRecordId: String(food.fdcId),
    sourceReference: lock.sourceUrl,
    sourceRecordChecksumSha256: digest(stableJson(normalizedRaw)),
    canonicalName: food.description,
    brandName: null,
    servingLabel: null,
    category: null,
    cuisine: null,
    nutrition,
    aliases: [],
    names: [{ locale: "en-US", script: "Latn", role: "source", value: food.description }],
    identityEvidence: {
      semanticSignature: ndb.normalized === null ? null : usdaFoundationSemanticSignature(ndb.normalized),
      ...evidenceFromDescription(food.description),
      structuredEvidenceKey: ndb.normalized === null ? null : `USDA_FDC:FoundationFoods:NDB:${ndb.normalized}`
    },
    servings,
    taxonomyEvidence: category === null ? [] : [{
      taxonomy: category,
      sourceCode: food.foodCategory?.code ?? null,
      mappedTaxonomyId: lock.config.taxonomyMappings[category] ?? null
    }],
    gtins: [],
    marketScopes: [],
    globallyRelevant: false,
    sourceNutrition: {
      basis: "100 g",
      sourceProviderMarket: "USDA/USA provenance; not a market-scope assignment",
      selectedNutrientIds,
      belowLimitNutrientIds,
      numericLoqNutrientIds,
      textualLoqNutrientIds,
      ndbNumber: food.ndbNumber ?? null,
      normalizedNdbNumber: ndb.normalized,
      ndbIdentityStatus: ndb.status,
      rawNutrients
    },
    sourceServing: { rawPortions, unusablePortionIds }
  };
}

export function createUsdaFoundationAdapter(
  lock: UsdaFoundationLock
): FoodCatalogSourceAdapter<UsdaFoundationArtifact> {
  const describeSource = (artifact: UsdaFoundationArtifact): FoodCatalogSourceDescriptor => {
    assertLockedSource(lock, artifact);
    return {
      provider: lock.provider,
      dataset: lock.dataset,
      sourceVersion: lock.sourceVersion,
      sourceReleaseDate: lock.sourceReleaseDate,
      licenseName: lock.licenseName,
      licenseReference: lock.licenseReference,
      sourceReference: lock.sourceUrl,
      sourceChecksumSha256: lock.sourceChecksumSha256,
      importerVersion: lock.importerVersion,
      configChecksumSha256: lock.configChecksumSha256
    };
  };
  return {
    adapterId: "usda-fdc-foundation-apr2026",
    adapterVersion: lock.config.adapterVersion,
    describeSource,
    toCandidates: (artifact) => {
      describeSource(artifact);
      return artifact.foods.map((food) => {
        validateFoodShape(food, -1);
        return toCandidate(food, lock);
      }).sort((a, b) => Number(a.sourceRecordId) - Number(b.sourceRecordId));
    }
  };
}
