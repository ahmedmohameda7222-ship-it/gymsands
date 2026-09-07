import type { FoodCorrectionCategory, FoodCorrectionState } from "./corrections";
import type { FoodGovernanceCapability } from "./principals";

export const FOOD_CANONICAL_CORRECTION_COMMANDS = [
  "apply_nutrition_correction",
  "apply_serving_correction",
  "apply_name_correction",
  "apply_barcode_correction",
  "apply_taxonomy_correction",
  "apply_market_correction",
] as const;
export type FoodCanonicalCorrectionCommand = (typeof FOOD_CANONICAL_CORRECTION_COMMANDS)[number];

export type FoodCanonicalAuthorityKind =
  | "nutrition_revision"
  | "serving_option"
  | "name_fact"
  | "barcode_correction"
  | "taxonomy_assignment"
  | "market_assignment";

type CommandPolicy = Readonly<{
  capability: FoodGovernanceCapability;
  authorityKind: FoodCanonicalAuthorityKind;
  categories: readonly FoodCorrectionCategory[];
}>;

const POLICIES: Readonly<Record<FoodCanonicalCorrectionCommand, CommandPolicy>> = Object.freeze({
  apply_nutrition_correction: {
    capability: "food.nutrition.correct",
    authorityKind: "nutrition_revision",
    categories: ["wrong_nutrition", "missing_nutrition", "source_conflict", "other"],
  },
  apply_serving_correction: {
    capability: "food.serving.correct",
    authorityKind: "serving_option",
    categories: ["wrong_serving", "missing_serving", "source_conflict", "other"],
  },
  apply_name_correction: {
    capability: "food.name.correct",
    authorityKind: "name_fact",
    categories: ["wrong_name", "wrong_translation", "source_conflict", "other"],
  },
  apply_barcode_correction: {
    capability: "food.barcode.correct",
    authorityKind: "barcode_correction",
    categories: ["wrong_barcode", "wrong_variant", "source_conflict", "other"],
  },
  apply_taxonomy_correction: {
    capability: "food.taxonomy.correct",
    authorityKind: "taxonomy_assignment",
    categories: ["wrong_taxonomy", "source_conflict", "other"],
  },
  apply_market_correction: {
    capability: "food.market.correct",
    authorityKind: "market_assignment",
    categories: ["wrong_market_relevance", "source_conflict", "other"],
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function preserveJsonNulls(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(preserveJsonNulls);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, preserveJsonNulls(entry)]));
  }
  if (["string", "boolean", "number"].includes(typeof value)) return value;
  throw new Error("Canonical correction payload must be JSON-compatible and must not fabricate unknown values.");
}

export function planCanonicalCorrection(input: {
  commandName: FoodCanonicalCorrectionCommand;
  category: FoodCorrectionCategory;
  foodId: string;
  correctionCaseId: string;
  caseState: FoodCorrectionState;
  expectedAuthorityId: string | null;
  payload: unknown;
}) {
  if (!FOOD_CANONICAL_CORRECTION_COMMANDS.includes(input.commandName)) {
    throw new Error("Unsupported generic mutation. A named Food correction command is required.");
  }
  const policy = POLICIES[input.commandName];
  if (!policy.categories.includes(input.category)) {
    throw new Error(`Correction category ${input.category} is not valid for ${input.commandName}.`);
  }
  if (input.caseState !== "approved") throw new Error("Canonical Food correction requires an approved correction case.");
  if (!UUID.test(input.foodId) || !UUID.test(input.correctionCaseId)) throw new Error("Canonical correction IDs must be exact UUIDs.");
  if (input.expectedAuthorityId !== null && !UUID.test(input.expectedAuthorityId)) {
    throw new Error("Expected canonical authority ID must be an exact UUID or null when no current authority exists.");
  }
  return Object.freeze({
    commandName: input.commandName,
    capability: policy.capability,
    authorityKind: policy.authorityKind,
    category: input.category,
    foodId: input.foodId.toLowerCase(),
    correctionCaseId: input.correctionCaseId.toLowerCase(),
    expectedAuthorityId: input.expectedAuthorityId?.toLowerCase() ?? null,
    payload: preserveJsonNulls(input.payload),
  });
}
