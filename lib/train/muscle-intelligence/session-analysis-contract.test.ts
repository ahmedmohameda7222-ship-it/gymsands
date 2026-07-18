import { describe, expect, it } from "vitest";
import { applyPhase3SessionAnalysisContract } from "./session-analysis-contract";
import type { SessionMuscleAnalysis } from "./session-analysis";

function result(
  snapshotCompleteness: SessionMuscleAnalysis["snapshotCompleteness"],
  completeness: SessionMuscleAnalysis["analysis"]["completeness"],
  coverage: SessionMuscleAnalysis["analysis"]["coverage"],
  warnings: SessionMuscleAnalysis["analysis"]["warnings"] = []
): SessionMuscleAnalysis {
  return {
    sessionId: "session",
    snapshotId: "snapshot",
    snapshotSchemaVersion: "workout_session_muscle_snapshot_v1",
    frozenAt: "2026-07-17T00:00:00Z",
    source: "session_start",
    snapshotCompleteness,
    reasonCodes: snapshotCompleteness === "complete" ? [] : ["snapshot_incomplete"],
    analysis: {
      schemaVersion: "muscle_analysis_result_v1",
      taxonomyVersion: "muscle_taxonomy_v1",
      engineVersion: "muscle_load_resistance_sets_v1",
      thresholdVersion: "muscle_load_thresholds_v1",
      mode: "planned",
      period: { kind: "session" },
      completeness,
      muscles: [],
      contributionBreakdown: [],
      mappingVersionsUsed: [],
      coverage,
      warnings
    }
  };
}

describe("Phase 3 effective session-analysis completeness", () => {
  it("does not describe a zero-item unavailable snapshot as complete", () => {
    const contracted = applyPhase3SessionAnalysisContract(result(
      "unavailable",
      "complete",
      { totalItemCount: 0, includedItemCount: 0, unmappedItemCount: 0, unsupportedItemCount: 0 },
      ["no_items"]
    ));
    expect(contracted.effectiveCompleteness).toBe("unavailable");
    expect(contracted.effectiveWarnings).toContain("no_authoritative_snapshot_items");
  });

  it("bounds partially mapped snapshots to partial", () => {
    expect(applyPhase3SessionAnalysisContract(result(
      "partial",
      "partial",
      { totalItemCount: 2, includedItemCount: 1, unmappedItemCount: 1, unsupportedItemCount: 0 },
      ["unmapped_items"]
    )).effectiveCompleteness).toBe("partial");
  });

  it("preserves unsupported workload as limited", () => {
    expect(applyPhase3SessionAnalysisContract(result(
      "complete",
      "limited",
      { totalItemCount: 1, includedItemCount: 0, unmappedItemCount: 0, unsupportedItemCount: 1 },
      ["unsupported_workload"]
    )).effectiveCompleteness).toBe("limited");
  });

  it("keeps a fully mapped snapshot complete", () => {
    expect(applyPhase3SessionAnalysisContract(result(
      "complete",
      "complete",
      { totalItemCount: 1, includedItemCount: 1, unmappedItemCount: 0, unsupportedItemCount: 0 }
    )).effectiveCompleteness).toBe("complete");
  });
});
