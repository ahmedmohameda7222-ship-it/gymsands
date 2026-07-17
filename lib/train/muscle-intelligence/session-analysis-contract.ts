import type { SessionMuscleAnalysis } from "./session-analysis";

export type EffectiveSessionAnalysisCompleteness = "complete" | "partial" | "limited" | "unavailable";

export type Phase3SessionAnalysisContract = SessionMuscleAnalysis & {
  effectiveCompleteness: EffectiveSessionAnalysisCompleteness;
  effectiveWarnings: string[];
};

export function applyPhase3SessionAnalysisContract(
  result: SessionMuscleAnalysis
): Phase3SessionAnalysisContract {
  const warningSet = new Set<string>([
    ...result.reasonCodes,
    ...result.analysis.warnings
  ]);
  const zeroAuthoritativeItems = result.analysis.coverage.totalItemCount === 0;
  let effectiveCompleteness: EffectiveSessionAnalysisCompleteness;

  if (result.snapshotCompleteness === "unavailable" || zeroAuthoritativeItems) {
    effectiveCompleteness = "unavailable";
    if (zeroAuthoritativeItems) warningSet.add("no_authoritative_snapshot_items");
  } else if (result.snapshotCompleteness === "partial") {
    effectiveCompleteness = result.analysis.completeness === "unavailable"
      ? "unavailable"
      : result.analysis.completeness === "limited"
        ? "limited"
        : "partial";
  } else {
    effectiveCompleteness = result.analysis.completeness;
  }

  return {
    ...result,
    effectiveCompleteness,
    effectiveWarnings: Array.from(warningSet).sort()
  };
}
