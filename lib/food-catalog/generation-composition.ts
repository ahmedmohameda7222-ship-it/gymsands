import {
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  validateGenerationVerificationSelection,
  type GenerationFoodSelection,
  type GenerationRedirectSelection,
  type GenerationVerificationSelection,
} from "./domain/generations.ts";
import { sha256Canonical } from "./canonical-hash.ts";

export type GenerationServingSelection = {
  foodId: string;
  servingOptionId: string;
};

export type GenerationNameSelection = {
  foodId: string;
  nameFactId: string;
};

export type GenerationAssignmentSelection = {
  foodId: string;
  assignmentId: string;
};

export type GenerationCompositionInput = {
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  foods: readonly GenerationFoodSelection[];
  servings: readonly GenerationServingSelection[];
  names: readonly GenerationNameSelection[];
  taxonomy: readonly GenerationAssignmentSelection[];
  markets: readonly GenerationAssignmentSelection[];
  verification: readonly GenerationVerificationSelection[];
  redirects: readonly GenerationRedirectSelection[];
};

export type NormalizedGenerationComposition = {
  compositionSchemaVersion: string;
  generationPolicyVersion: string;
  activationPolicyVersion: string;
  trustPolicyVersion: string;
  projectionVersion: string;
  foods: GenerationFoodSelection[];
  servings: GenerationServingSelection[];
  names: GenerationNameSelection[];
  taxonomy: GenerationAssignmentSelection[];
  markets: GenerationAssignmentSelection[];
  verification: GenerationVerificationSelection[];
  redirects: GenerationRedirectSelection[];
};

function requireNonblank(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be nonblank.`);
  return value;
}

function tupleCompare(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const compared = (left[index] ?? "").localeCompare(right[index] ?? "");
    if (compared !== 0) return compared;
  }
  return 0;
}

function requireArray<T>(value: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function normalizeSimpleSelection<T extends Record<string, string>>(
  values: readonly T[],
  label: string,
  idField: keyof T,
  tuple: (value: T) => readonly string[],
): T[] {
  const normalized = requireArray(values, label).map((value) => {
    requireNonblank(value.foodId, `${label} Food ID`);
    requireNonblank(value[idField], `${label} selected ID`);
    return { ...value };
  }).sort((left, right) => tupleCompare(tuple(left), tuple(right)));

  const seen = new Set<string>();
  for (const value of normalized) {
    const key = tuple(value).join("\u0000");
    if (seen.has(key)) throw new Error(`Generation composition contains duplicate ${label.toLowerCase()} selection.`);
    seen.add(key);
  }
  return normalized;
}

export function normalizeGenerationComposition(
  input: GenerationCompositionInput,
): NormalizedGenerationComposition {
  const compositionSchemaVersion = requireNonblank(input.compositionSchemaVersion, "Generation composition schema version");
  const generationPolicyVersion = requireNonblank(input.generationPolicyVersion, "Generation policy version");
  const activationPolicyVersion = requireNonblank(input.activationPolicyVersion, "Generation activation policy version");
  const trustPolicyVersion = requireNonblank(input.trustPolicyVersion, "Generation trust policy version");
  const projectionVersion = requireNonblank(input.projectionVersion, "Generation projection version");

  const foods = requireArray(input.foods, "Generation Foods")
    .map((food) => ({ ...validateGenerationFoodSelection({ ...food }) }))
    .sort((left, right) => tupleCompare([left.foodId], [right.foodId]));
  const seenFoods = new Set<string>();
  for (const food of foods) {
    if (seenFoods.has(food.foodId)) throw new Error(`Generation composition contains duplicate Food ID ${food.foodId}.`);
    seenFoods.add(food.foodId);
  }

  const servings = normalizeSimpleSelection(input.servings, "Generation serving", "servingOptionId", (value) => [value.foodId, value.servingOptionId]);
  const names = normalizeSimpleSelection(input.names, "Generation name", "nameFactId", (value) => [value.foodId, value.nameFactId]);
  const taxonomy = normalizeSimpleSelection(input.taxonomy, "Generation taxonomy", "assignmentId", (value) => [value.foodId, value.assignmentId]);
  const markets = normalizeSimpleSelection(input.markets, "Generation market", "assignmentId", (value) => [value.foodId, value.assignmentId]);

  const verification = requireArray(input.verification, "Generation verification")
    .map((selection) => ({ ...validateGenerationVerificationSelection({ ...selection }) }))
    .sort((left, right) => tupleCompare([left.foodId, left.scope, left.assertionId], [right.foodId, right.scope, right.assertionId]));
  const seenVerification = new Set<string>();
  for (const selection of verification) {
    const key = `${selection.foodId}\u0000${selection.scope}`;
    if (seenVerification.has(key)) throw new Error(`Generation composition contains duplicate verification selection for Food ${selection.foodId} scope ${selection.scope}.`);
    seenVerification.add(key);
  }

  const redirects = requireArray(input.redirects, "Generation redirects")
    .map((redirect) => ({ ...validateGenerationRedirectSelection({ ...redirect }) }))
    .sort((left, right) => tupleCompare([left.sourceFoodId, left.targetFoodId], [right.sourceFoodId, right.targetFoodId]));
  const seenRedirectSources = new Set<string>();
  for (const redirect of redirects) {
    if (seenRedirectSources.has(redirect.sourceFoodId)) throw new Error(`Generation composition contains duplicate redirect source Food ${redirect.sourceFoodId}.`);
    seenRedirectSources.add(redirect.sourceFoodId);
  }

  return {
    compositionSchemaVersion,
    generationPolicyVersion,
    activationPolicyVersion,
    trustPolicyVersion,
    projectionVersion,
    foods,
    servings,
    names,
    taxonomy,
    markets,
    verification,
    redirects,
  };
}

export function computeGenerationCompositionChecksum(input: GenerationCompositionInput): string {
  return sha256Canonical(normalizeGenerationComposition(input));
}
