export const FOOD_CORRECTION_CATEGORIES = [
  "wrong_nutrition",
  "missing_nutrition",
  "wrong_serving",
  "missing_serving",
  "wrong_name",
  "wrong_translation",
  "wrong_barcode",
  "wrong_taxonomy",
  "wrong_market_relevance",
  "duplicate_food",
  "wrong_variant",
  "outdated_product",
  "source_conflict",
  "other",
] as const;
export type FoodCorrectionCategory = (typeof FOOD_CORRECTION_CATEGORIES)[number];

export const FOOD_CORRECTION_STATES = [
  "reported",
  "under_review",
  "approved",
  "applied",
  "rejected",
] as const;
export type FoodCorrectionState = (typeof FOOD_CORRECTION_STATES)[number];

export type FoodCorrectionReportInput = {
  foodId: string;
  category: FoodCorrectionCategory;
  claimKey: string;
  description: string;
  evidence: Readonly<Record<string, unknown>>;
};

export type ValidatedFoodCorrectionReport = FoodCorrectionReportInput & {
  issueKey: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY = /(access.?token|authorization|password|secret|cookie|session|api.?key|service.?role)/i;
const MAX_DESCRIPTION = 2000;
const MAX_EVIDENCE_TEXT = 4096;
const MAX_EVIDENCE_KEYS = 24;

const TRANSITIONS = {
  reported: ["under_review", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["applied"],
  applied: [],
  rejected: [],
} as const satisfies Readonly<Record<FoodCorrectionState, readonly FoodCorrectionState[]>>;

function nonblank(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function validateBoundedEvidence(value: unknown, path = "evidence", depth = 0): void {
  if (depth > 4) throw new Error("Correction evidence must remain bounded.");
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.length > MAX_EVIDENCE_TEXT) throw new Error("Correction evidence text must remain bounded.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_EVIDENCE_KEYS) throw new Error("Correction evidence arrays must remain bounded.");
    value.forEach((entry, index) => validateBoundedEvidence(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== "object" || !value) throw new Error(`Unsupported correction evidence at ${path}.`);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_EVIDENCE_KEYS) throw new Error("Correction evidence objects must remain bounded.");
  for (const [key, entry] of entries) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`Sensitive correction evidence key is forbidden: ${key}`);
    validateBoundedEvidence(entry, `${path}.${key}`, depth + 1);
  }
}

export function buildCorrectionIssueKey(input: {
  foodId: string;
  category: FoodCorrectionCategory;
  claimKey: string;
}) {
  if (!UUID.test(input.foodId)) throw new Error("Correction Food ID must be an exact UUID.");
  if (!FOOD_CORRECTION_CATEGORIES.includes(input.category)) throw new Error("Correction category is invalid.");
  const claimKey = nonblank(input.claimKey, "Correction claim key").replace(/\s+/g, " ").toLowerCase();
  if (claimKey.length > 240) throw new Error("Correction claim key must remain bounded.");
  return `${input.foodId.toLowerCase()}|${input.category}|${claimKey}`;
}

export function validateCorrectionReport(input: FoodCorrectionReportInput): ValidatedFoodCorrectionReport {
  const description = nonblank(input.description, "Correction description");
  if (description.length > MAX_DESCRIPTION) throw new Error(`Correction description must be at most ${MAX_DESCRIPTION} characters.`);
  validateBoundedEvidence(input.evidence);
  return {
    ...input,
    foodId: input.foodId.toLowerCase(),
    claimKey: nonblank(input.claimKey, "Correction claim key"),
    description,
    evidence: Object.freeze({ ...input.evidence }),
    issueKey: buildCorrectionIssueKey(input),
  };
}

export function validateCorrectionTransition(from: FoodCorrectionState, to: FoodCorrectionState) {
  if (!FOOD_CORRECTION_STATES.includes(from) || !FOOD_CORRECTION_STATES.includes(to)) {
    throw new Error("Correction state is invalid.");
  }
  if (!TRANSITIONS[from].includes(to as never)) throw new Error(`Invalid correction transition: ${from} -> ${to}`);
  return { from, to } as const;
}
