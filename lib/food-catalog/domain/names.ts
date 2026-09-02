export type FoodNameRole = "preferred_display" | "source_name" | "synonym" | "search_alias" | "transliteration";
export type FoodNameOrigin = "source" | "curated" | "migration";

export type FoodNameFact = {
  foodId: string;
  languageTag: string;
  role: FoodNameRole;
  text: string;
  normalizedText: string;
  scriptCode: string | null;
  origin: FoodNameOrigin;
  sourceRecordId: string | null;
  policyVersion: string;
};

const FOOD_NAME_ROLES = new Set<FoodNameRole>([
  "preferred_display",
  "source_name",
  "synonym",
  "search_alias",
  "transliteration",
]);
const FOOD_NAME_ORIGINS = new Set<FoodNameOrigin>(["source", "curated", "migration"]);

export function validateFoodNameFact(value: FoodNameFact): FoodNameFact {
  if (!value.foodId.trim()) throw new Error("Food name food ID must be nonblank.");
  if (!value.languageTag.trim()) throw new Error("Food name language tag must be nonblank.");
  if (!FOOD_NAME_ROLES.has(value.role)) throw new Error("Food name role is invalid.");
  if (!value.text.trim()) throw new Error("Food name text must be nonblank.");
  if (!value.normalizedText.trim()) throw new Error("Food name normalized text must be nonblank.");
  if (!FOOD_NAME_ORIGINS.has(value.origin)) throw new Error("Food name origin is invalid.");
  if (!value.policyVersion.trim()) throw new Error("Food name policy version must be nonblank.");
  if (
    (value.origin === "source" || value.role === "source_name")
    && (value.sourceRecordId === null || !value.sourceRecordId.trim())
  ) {
    throw new Error("Source-derived Food names require source provenance.");
  }
  return value;
}
