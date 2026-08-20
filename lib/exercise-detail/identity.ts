import type { ExerciseDetailSource } from "./contracts";

export const PLAIVRA_CATALOG_PROVIDER = "plaivra_activity_catalog" as const;

export type CanonicalExerciseIdentity = {
  canonical: string;
  aliases: string[];
  kind: "provider" | "custom" | "global";
  activityId: string;
};

function uniqueAliases(canonical: string, aliases: Array<string | null | undefined>) {
  return [...new Set(aliases.filter((value): value is string => Boolean(value && value !== canonical)))];
}

export function catalogProviderIdentity(activityId: string, options: { includeHistoricalGlobalAlias?: boolean } = {}): CanonicalExerciseIdentity {
  const canonical = `provider:${PLAIVRA_CATALOG_PROVIDER}:${activityId}`;
  return {
    canonical,
    aliases: uniqueAliases(canonical, [options.includeHistoricalGlobalAlias === false ? null : `global:${activityId}`]),
    kind: "provider",
    activityId
  };
}

export function customExerciseIdentity(activityId: string): CanonicalExerciseIdentity {
  const canonical = `custom:${activityId}`;
  return { canonical, aliases: [], kind: "custom", activityId };
}

export function globalExerciseIdentity(activityId: string): CanonicalExerciseIdentity {
  const canonical = `global:${activityId}`;
  return { canonical, aliases: [], kind: "global", activityId };
}

export function resolveExerciseIdentity(input: {
  source: ExerciseDetailSource;
  activityId: string;
}): CanonicalExerciseIdentity {
  if (input.source === "catalog_v2") return catalogProviderIdentity(input.activityId);
  if (input.source === "custom") return customExerciseIdentity(input.activityId);
  return globalExerciseIdentity(input.activityId);
}

/**
 * Frozen plan snapshots may carry provider provenance even when their source ID is
 * historical. Prefer that frozen provenance; never infer provider identity from a
 * display name.
 */
export function resolveFrozenPlanExerciseIdentity(input: {
  activityId: string | null;
  catalogSource?: string | null;
  isGlobal?: boolean | null;
}): CanonicalExerciseIdentity | null {
  if (!input.activityId) return null;
  if (input.catalogSource === "external") return catalogProviderIdentity(input.activityId);
  if (input.catalogSource === "custom" || input.isGlobal === false) return customExerciseIdentity(input.activityId);
  return globalExerciseIdentity(input.activityId);
}

export function identityCandidates(identity: CanonicalExerciseIdentity): string[] {
  return [identity.canonical, ...identity.aliases];
}
