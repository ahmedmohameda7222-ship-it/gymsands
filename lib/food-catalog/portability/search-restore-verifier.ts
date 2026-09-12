import type { PortableExportProfile } from "./export-contract";

export const REQUIRED_GOLDEN_SEARCH_CASE_IDS = Object.freeze([
  "exact",
  "alias",
  "prefix",
  "contains",
  "locale_script",
  "market_direct",
  "market_parent",
  "market_global",
  "category",
  "current_cuisine",
  "nullable_numerics",
  "presets",
  "favorites",
  "recent",
  "my_food",
  "cursor_continuation",
  "cursor_context_mismatch",
  "redirect",
  "stale_generation_isolation",
  "zero_row",
] as const);

export type GoldenSearchCaseId = (typeof REQUIRED_GOLDEN_SEARCH_CASE_IDS)[number];

export type RestoredSearchQueryCase = Readonly<{
  id: string;
  query: string;
  languageTag: string;
  scriptCode: string | null;
  marketScopeCode: string | null;
  cursor?: string | null;
  limit: number;
  category: string | null;
  cuisine: string | null;
  scope: string;
  filters: Readonly<Record<string, unknown>>;
}>;

export type RestoredSearchVerificationStep =
  | Readonly<{
      kind: "REBUILD";
      generationId: string;
      functionName: "public.rebuild_food_catalog_search_projection_v2";
      projectionVersion: string;
      nutritionPolicyVersion: string | null;
    }>
  | Readonly<{
      kind: "SEARCH";
      caseId: string;
      generationId: string;
      functionName: "public.search_food_catalog_v2";
      query: RestoredSearchQueryCase;
    }>;

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
}

export function buildRestoredSearchVerificationPlan(input: Readonly<{
  profile: PortableExportProfile;
  currentGenerationId: string | null;
  restoredGenerationId: string;
  projectionVersion: string;
  nutritionPolicyVersion: string | null;
  queryCases: readonly RestoredSearchQueryCase[];
}>): readonly RestoredSearchVerificationStep[] {
  if (input.profile !== "CORE_PORTABLE" && input.profile !== "FULL_DR") {
    throw new Error("Unsupported restored search verification profile.");
  }
  assertUuid(input.restoredGenerationId, "Restored generation ID");
  if (!input.currentGenerationId) throw new Error("Current-generation pointer is unavailable.");
  assertUuid(input.currentGenerationId, "Current generation ID");
  if (input.currentGenerationId !== input.restoredGenerationId) {
    throw new Error("Current-generation pointer is stale or does not match the exact restored generation.");
  }
  if (typeof input.projectionVersion !== "string" || input.projectionVersion.trim().length === 0) {
    throw new Error("Projection version is required.");
  }

  const steps: RestoredSearchVerificationStep[] = [Object.freeze({
    kind: "REBUILD",
    generationId: input.restoredGenerationId,
    functionName: "public.rebuild_food_catalog_search_projection_v2",
    projectionVersion: input.projectionVersion,
    nutritionPolicyVersion: input.nutritionPolicyVersion,
  })];

  for (const query of input.queryCases) {
    if (!query.id || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 20) {
      throw new Error(`Invalid restored search golden query case: ${query.id || "<missing>"}.`);
    }
    steps.push(Object.freeze({
      kind: "SEARCH",
      caseId: query.id,
      generationId: input.restoredGenerationId,
      functionName: "public.search_food_catalog_v2",
      query,
    }));
  }
  return Object.freeze(steps);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function verifyGoldenSearchMatrix(cases: readonly Readonly<{
  id: string;
  expected: unknown;
  actual: unknown;
}>[]): Readonly<{ passed: true; caseCount: number; caseIds: readonly string[] }> {
  const byId = new Map<string, { expected: unknown; actual: unknown }>();
  for (const entry of cases) {
    if (byId.has(entry.id)) throw new Error(`Duplicate golden search case: ${entry.id}.`);
    byId.set(entry.id, { expected: entry.expected, actual: entry.actual });
  }

  for (const requiredId of REQUIRED_GOLDEN_SEARCH_CASE_IDS) {
    const entry = byId.get(requiredId);
    if (!entry) throw new Error(`Golden search matrix is missing required case ${requiredId}.`);
    if (stableJson(entry.expected) !== stableJson(entry.actual)) {
      throw new Error(`Golden search mismatch for required case ${requiredId}.`);
    }
  }

  return Object.freeze({
    passed: true,
    caseCount: REQUIRED_GOLDEN_SEARCH_CASE_IDS.length,
    caseIds: Object.freeze([...REQUIRED_GOLDEN_SEARCH_CASE_IDS]),
  });
}

export type SearchRestorePreconditions = Readonly<{
  artifactCorruption: boolean;
  precisionLoss: boolean;
  tornExport: boolean;
  wrongOwner: boolean;
  nonceReuse: boolean;
  preseedMismatch: boolean;
  globalServingDisplayAuthorityPresent: boolean;
  observedGlobalServingLabels: readonly (string | null)[];
}>;

export function verifySearchRestorePreconditions(input: SearchRestorePreconditions): true {
  const failures: readonly [keyof Pick<SearchRestorePreconditions,
    "artifactCorruption" | "precisionLoss" | "tornExport" | "wrongOwner" | "nonceReuse" | "preseedMismatch">, string][] = [
    ["artifactCorruption", "artifact corruption"],
    ["precisionLoss", "precision loss"],
    ["tornExport", "torn export"],
    ["wrongOwner", "wrong owner"],
    ["nonceReuse", "nonce reuse"],
    ["preseedMismatch", "preseed mismatch"],
  ];
  for (const [key, label] of failures) {
    if (input[key]) throw new Error(`Restored search trust blocked by ${label}.`);
  }

  if (!input.globalServingDisplayAuthorityPresent) {
    for (const label of input.observedGlobalServingLabels) {
      if (label !== null) {
        throw new Error("Global serving display must remain NULL until explicit serving display authority exists.");
      }
    }
  }
  return true;
}
