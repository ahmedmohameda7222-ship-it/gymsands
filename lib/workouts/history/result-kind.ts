import type { WorkoutHistoryActivityResultKind } from "@/types/workout-history";

const STRENGTH_WORKLOAD_MODELS = new Set(["resistance_sets_v1"]);

export function resolveWorkoutHistoryResultKind({
  authoritativeWorkloadModelVersion,
  hasSupportedStructuredMetrics,
  hasLegacyStrengthValues,
}: {
  authoritativeWorkloadModelVersion: string | null | undefined;
  hasSupportedStructuredMetrics: boolean;
  hasLegacyStrengthValues: boolean;
}): WorkoutHistoryActivityResultKind {
  const workload = authoritativeWorkloadModelVersion?.trim() || null;
  if (workload) {
    if (STRENGTH_WORKLOAD_MODELS.has(workload)) return "strength_sets";
    return hasSupportedStructuredMetrics ? "semantic_metrics" : "limited";
  }
  if (hasSupportedStructuredMetrics) return "semantic_metrics";
  return hasLegacyStrengthValues ? "strength_sets" : "limited";
}
