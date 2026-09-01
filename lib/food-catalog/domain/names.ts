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

export function validateFoodNameFact(value: FoodNameFact): FoodNameFact {
  if (!value.foodId.trim()) throw new Error("Food name food ID must be nonblank.");
  if (!value.languageTag.trim()) throw new Error("Food name language tag must be nonblank.");
  if (!value.text.trim()) throw new Error("Food name text must be nonblank.");
  if (!value.normalizedText.trim()) throw new Error("Food name normalized text must be nonblank.");
  if (!value.policyVersion.trim()) throw new Error("Food name policy version must be nonblank.");
  return value;
}
