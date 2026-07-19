import { describe, expect, it } from "vitest";
import {
  buildSessionMuscleAnalysis,
  buildVersionedSessionMuscleAnalysis,
  SessionMuscleAnalysisError,
  type BuildSessionMuscleAnalysisInput
} from "./session-analysis";

const v1Input: BuildSessionMuscleAnalysisInput = {
  mode: "planned",
  snapshot: {
    id: "snapshot-v1", workout_session_id: "session-1", snapshot_schema_version: "workout_session_muscle_snapshot_v1",
    taxonomy_version: "muscle_taxonomy_v1", mapping_schema_version: "exercise_muscle_mapping_v1",
    calculation_engine_version: "muscle_load_resistance_sets_v1", threshold_profile_version: "muscle_load_thresholds_v1",
    result_schema_version: "muscle_analysis_result_v1", workload_model_version: "resistance_sets_v1", completeness: "complete",
    reason_codes: [], source: "session_start", frozen_at: "2026-07-18T00:00:00.000Z"
  },
  items: [{
    id: "item-1", source_plan_exercise_id: null, item_order: 1, planned_target_type: "global_exercise",
    planned_global_exercise_id: "exercise-1", planned_custom_exercise_id: null, planned_mapping_set_id: "mapping-v1",
    planned_custom_mapping_set_id: null, planned_mapping_version: 1, planned_mapping_schema_version: "exercise_muscle_mapping_v1",
    planned_mapping_checksum: "a".repeat(64), planned_custom_mapping_entries: null, planned_sets: 3, state: "planned",
    actual_target_type: null, actual_global_exercise_id: null, actual_custom_exercise_id: null, actual_mapping_set_id: null,
    actual_custom_mapping_set_id: null, actual_mapping_version: null, actual_mapping_schema_version: null,
    actual_mapping_checksum: null, actual_custom_mapping_entries: null,
    performed_total_sets: null, performed_qualifying_sets: null, performed_frozen_at: null
  }],
  globalMappings: [{
    id: "mapping-v1", exercise_id: "exercise-1", mapping_version: 1, schema_version: "exercise_muscle_mapping_v1",
    checksum: "a".repeat(64),
    entries: [{ muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
  }],
  completedLogs: []
};

const v2Snapshot = {
  ...v1Input.snapshot,
  id: "snapshot-v2",
  snapshot_schema_version: "workout_session_muscle_snapshot_v2",
  taxonomy_version: "advanced_visible_v1",
  mapping_schema_version: "exercise_muscle_mapping_v2",
  calculation_engine_version: "muscle_load_resistance_sets_v2",
  threshold_profile_version: "advanced_exposure_v1",
  result_schema_version: "advanced_muscle_exposure_result_v1"
};

const v2Item = {
  ...v1Input.items[0],
  planned_mapping_set_id: "mapping-v2",
  planned_mapping_version: 2,
  planned_mapping_schema_version: "exercise_muscle_mapping_v2",
  planned_mapping_checksum: "b".repeat(64)
};

const v2Mapping = {
  id: "mapping-v2", exercise_id: "exercise-1", mapping_version: 2, schema_version: "exercise_muscle_mapping_v2",
  checksum: "b".repeat(64),
  entries: [{ muscleId: "pectoralis.upper", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
};

describe("versioned session muscle analysis", () => {
  it("keeps V1 output byte-identical through the dispatcher", () => {
    expect(JSON.stringify(buildVersionedSessionMuscleAnalysis(v1Input))).toBe(JSON.stringify(buildSessionMuscleAnalysis(v1Input)));
  });

  it("dispatches a consistent V2 envelope to precise advanced targets", () => {
    const result = buildVersionedSessionMuscleAnalysis({
      ...v1Input,
      snapshot: v2Snapshot,
      items: [v2Item],
      globalMappings: [v2Mapping]
    });
    expect(result.snapshotSchemaVersion).toBe("workout_session_muscle_snapshot_v2");
    expect(result.analysis && "kind" in result.analysis ? result.analysis.kind : null).toBe("advanced");
    if (result.analysis && "kind" in result.analysis && result.analysis.kind === "advanced") {
      expect(result.analysis.targets.find((target) => target.targetId === "pectoralis.upper")).toMatchObject({ rawExposure: 3, heatLevel: "moderate" });
    }
  });

  it("uses frozen qualifying sets for completed V2 analysis instead of mutable logs", () => {
    const result = buildVersionedSessionMuscleAnalysis({
      ...v1Input,
      mode: "completed",
      snapshot: v2Snapshot,
      items: [{ ...v2Item, state: "completed", performed_total_sets: 3, performed_qualifying_sets: 2, performed_frozen_at: "2026-07-19T10:00:00.000Z" }],
      globalMappings: [v2Mapping],
      completedLogs: [{ plan_exercise_id: null, exercise_order: 1, completed_at: "2026-07-19T10:00:00.000Z" }]
    });
    if (result.analysis && "kind" in result.analysis && result.analysis.kind === "advanced") {
      expect(result.analysis.targets.find((target) => target.targetId === "pectoralis.upper")).toMatchObject({ rawExposure: 2 });
    }
  });

  it("rejects completed V2 analysis when performed workload was not frozen", () => {
    expect(() => buildVersionedSessionMuscleAnalysis({
      ...v1Input,
      mode: "completed",
      snapshot: v2Snapshot,
      items: [{ ...v2Item, state: "completed" }],
      globalMappings: [v2Mapping]
    })).toThrowError(expect.objectContaining<Partial<SessionMuscleAnalysisError>>({ code: "snapshot_workload_not_frozen", status: 409 }));
  });

  it("keeps a V1 item inside the V2 path broad-only", () => {
    const result = buildVersionedSessionMuscleAnalysis({ ...v1Input, snapshot: v2Snapshot });
    expect(result.analysis && "kind" in result.analysis ? result.analysis.kind : null).toBe("broad_compatibility");
    if (result.analysis && "kind" in result.analysis && result.analysis.kind === "broad_compatibility") {
      expect(result.analysis.targets.find((target) => target.targetId === "broad:pectoralis_major")?.visualCoverage)
        .toEqual(["pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer"]);
      expect(JSON.stringify(result.analysis)).not.toContain("rawScore");
    }
  });

  it("fails safely for unknown or mixed envelope versions", () => {
    expect(() => buildVersionedSessionMuscleAnalysis({
      ...v1Input,
      snapshot: { ...v2Snapshot, calculation_engine_version: "muscle_load_resistance_sets_v1" }
    })).toThrowError(expect.objectContaining<Partial<SessionMuscleAnalysisError>>({ code: "unsupported_snapshot_version", status: 409 }));
  });
});
