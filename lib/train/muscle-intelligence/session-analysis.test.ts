import { describe, expect, it } from "vitest";
import { buildSessionMuscleAnalysis, SessionMuscleAnalysisError, type BuildSessionMuscleAnalysisInput } from "./session-analysis";

const base: BuildSessionMuscleAnalysisInput = {
  mode: "planned",
  snapshot: {
    id: "snapshot-1",
    workout_session_id: "session-1",
    snapshot_schema_version: "workout_session_muscle_snapshot_v1",
    taxonomy_version: "muscle_taxonomy_v1",
    mapping_schema_version: "exercise_muscle_mapping_v1",
    calculation_engine_version: "muscle_load_resistance_sets_v1",
    threshold_profile_version: "muscle_load_thresholds_v1",
    result_schema_version: "muscle_analysis_result_v1",
    workload_model_version: "resistance_sets_v1",
    completeness: "complete",
    reason_codes: [],
    source: "session_start",
    frozen_at: "2026-07-17T10:00:00.000Z"
  },
  items: [{
    id: "item-1",
    source_plan_exercise_id: "plan-exercise-1",
    item_order: 1,
    planned_target_type: "global_exercise",
    planned_global_exercise_id: "exercise-planned",
    planned_custom_exercise_id: null,
    planned_mapping_set_id: "mapping-planned",
    planned_custom_mapping_set_id: null,
    planned_mapping_version: 1,
    planned_mapping_schema_version: "exercise_muscle_mapping_v1",
    planned_mapping_checksum: "a".repeat(64),
    planned_custom_mapping_entries: null,
    planned_sets: 3,
    state: "completed",
    actual_target_type: "global_exercise",
    actual_global_exercise_id: "exercise-actual",
    actual_custom_exercise_id: null,
    actual_mapping_set_id: "mapping-actual",
    actual_custom_mapping_set_id: null,
    actual_mapping_version: 2,
    actual_mapping_schema_version: "exercise_muscle_mapping_v1",
    actual_mapping_checksum: "b".repeat(64),
    actual_custom_mapping_entries: null
  }],
  globalMappings: [{
    id: "mapping-planned",
    exercise_id: "exercise-planned",
    mapping_version: 1,
    schema_version: "exercise_muscle_mapping_v1",
    checksum: "a".repeat(64),
    entries: [{ muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
  }, {
    id: "mapping-actual",
    exercise_id: "exercise-actual",
    mapping_version: 2,
    schema_version: "exercise_muscle_mapping_v1",
    checksum: "b".repeat(64),
    entries: [{ muscleId: "triceps_brachii", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
  }],
  completedLogs: [{ plan_exercise_id: "plan-exercise-1", exercise_order: 1, completed_at: "2026-07-17T10:10:00.000Z" }]
};

describe("session muscle snapshot analysis", () => {
  it("keeps planned analysis on the frozen planned identity", () => {
    const result = buildSessionMuscleAnalysis(base);
    expect(result.analysis.mode).toBe("planned");
    expect(result.analysis.mappingVersionsUsed).toEqual([expect.objectContaining({ mappingSetId: "mapping-planned" })]);
    expect(result.analysis.muscles.find((muscle) => muscle.muscleId === "pectoralis_major")?.rawScore).toBe(3);
    expect(JSON.stringify(result)).toMatchInlineSnapshot(`"{"sessionId":"session-1","snapshotId":"snapshot-1","snapshotSchemaVersion":"workout_session_muscle_snapshot_v1","frozenAt":"2026-07-17T10:00:00.000Z","source":"session_start","snapshotCompleteness":"complete","reasonCodes":[],"analysis":{"schemaVersion":"muscle_analysis_result_v1","taxonomyVersion":"muscle_taxonomy_v1","engineVersion":"muscle_load_resistance_sets_v1","thresholdVersion":"muscle_load_thresholds_v1","mode":"planned","period":{"kind":"session"},"completeness":"complete","muscles":[{"muscleId":"pectoralis_major","rawScore":3,"levelInputScore":3,"level":"medium"},{"muscleId":"anterior_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"lateral_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"posterior_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"trapezius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"latissimus_dorsi","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"upper_back","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"biceps_brachii","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"triceps_brachii","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"forearms","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"rotator_cuff","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"serratus_anterior","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"rectus_abdominis","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"obliques","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"erector_spinae","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gluteus_maximus","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gluteus_medius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"quadriceps","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"hamstrings","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"adductors","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"hip_flexors","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gastrocnemius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"soleus","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"tibialis_anterior","rawScore":0,"levelInputScore":0,"level":"inactive"}],"contributionBreakdown":[{"itemId":"item-1","mappingSetId":"mapping-planned","mappingVersion":1,"muscleId":"pectoralis_major","role":"primary","contribution":1,"sideScope":"bilateral","qualifyingSets":3,"rawScore":3}],"mappingVersionsUsed":[{"mappingSetId":"mapping-planned","targetId":"exercise-planned","targetType":"global_exercise","mappingVersion":1,"schemaVersion":"exercise_muscle_mapping_v1","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"coverage":{"totalItemCount":1,"includedItemCount":1,"unmappedItemCount":0,"unsupportedItemCount":0},"warnings":[]}}"`);
  });

  it("uses the frozen actual replacement identity and completed set count", () => {
    const result = buildSessionMuscleAnalysis({ ...base, mode: "completed" });
    expect(result.analysis.mappingVersionsUsed).toEqual([expect.objectContaining({ mappingSetId: "mapping-actual" })]);
    expect(result.analysis.muscles.find((muscle) => muscle.muscleId === "triceps_brachii")?.rawScore).toBe(1);
    expect(result.analysis.muscles.find((muscle) => muscle.muscleId === "pectoralis_major")?.rawScore).toBe(0);
    expect(JSON.stringify(result)).toMatchInlineSnapshot(`"{"sessionId":"session-1","snapshotId":"snapshot-1","snapshotSchemaVersion":"workout_session_muscle_snapshot_v1","frozenAt":"2026-07-17T10:00:00.000Z","source":"session_start","snapshotCompleteness":"complete","reasonCodes":[],"analysis":{"schemaVersion":"muscle_analysis_result_v1","taxonomyVersion":"muscle_taxonomy_v1","engineVersion":"muscle_load_resistance_sets_v1","thresholdVersion":"muscle_load_thresholds_v1","mode":"completed","period":{"kind":"session"},"completeness":"complete","muscles":[{"muscleId":"pectoralis_major","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"anterior_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"lateral_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"posterior_deltoid","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"trapezius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"latissimus_dorsi","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"upper_back","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"biceps_brachii","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"triceps_brachii","rawScore":1,"levelInputScore":1,"level":"low"},{"muscleId":"forearms","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"rotator_cuff","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"serratus_anterior","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"rectus_abdominis","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"obliques","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"erector_spinae","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gluteus_maximus","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gluteus_medius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"quadriceps","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"hamstrings","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"adductors","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"hip_flexors","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"gastrocnemius","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"soleus","rawScore":0,"levelInputScore":0,"level":"inactive"},{"muscleId":"tibialis_anterior","rawScore":0,"levelInputScore":0,"level":"inactive"}],"contributionBreakdown":[{"itemId":"item-1","mappingSetId":"mapping-actual","mappingVersion":2,"muscleId":"triceps_brachii","role":"primary","contribution":1,"sideScope":"bilateral","qualifyingSets":1,"rawScore":1}],"mappingVersionsUsed":[{"mappingSetId":"mapping-actual","targetId":"exercise-actual","targetType":"global_exercise","mappingVersion":2,"schemaVersion":"exercise_muscle_mapping_v1","checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}],"coverage":{"totalItemCount":1,"includedItemCount":1,"unmappedItemCount":0,"unsupportedItemCount":0},"warnings":[]}}"`);
  });

  it("keeps replacement identity orthogonal to skipped and adjusted terminal state", () => {
    const skipped = buildSessionMuscleAnalysis({
      ...base,
      mode: "completed",
      items: [{ ...base.items[0], state: "skipped" }],
      completedLogs: []
    });
    expect(skipped.analysis.mappingVersionsUsed).toEqual([expect.objectContaining({ mappingSetId: "mapping-actual" })]);
    expect(skipped.analysis.muscles.find((muscle) => muscle.muscleId === "triceps_brachii")?.rawScore).toBe(0);

    const adjusted = buildSessionMuscleAnalysis({
      ...base,
      mode: "completed",
      items: [{ ...base.items[0], state: "adjusted" }]
    });
    expect(adjusted.analysis.mappingVersionsUsed).toEqual([expect.objectContaining({ mappingSetId: "mapping-actual" })]);
    expect(adjusted.analysis.muscles.find((muscle) => muscle.muscleId === "triceps_brachii")?.rawScore).toBe(1);
  });

  it("marks mapped activities without supported set semantics as limited", () => {
    const result = buildSessionMuscleAnalysis({
      ...base,
      items: [{ ...base.items[0], planned_sets: null }]
    });
    expect(result.analysis.completeness).toBe("limited");
    expect(result.analysis.coverage.unsupportedItemCount).toBe(1);
    expect(result.analysis.warnings).toContain("unsupported_workload");
  });

  it("fails closed on a partially populated custom mapping bundle", () => {
    expect(() => buildSessionMuscleAnalysis({
      ...base,
      items: [{
        ...base.items[0],
        planned_target_type: "custom_exercise",
        planned_global_exercise_id: null,
        planned_custom_exercise_id: "custom-1",
        planned_mapping_set_id: null,
        planned_custom_mapping_set_id: "custom-mapping-1",
        planned_mapping_version: null,
        planned_mapping_checksum: null,
        planned_custom_mapping_entries: []
      }]
    })).toThrowError(expect.objectContaining<Partial<SessionMuscleAnalysisError>>({ code: "snapshot_mapping_drift" }));
  });

  it("uses the compact frozen custom mapping without the editable source row", () => {
    const result = buildSessionMuscleAnalysis({
      ...base,
      items: [{
        ...base.items[0],
        planned_target_type: "custom_exercise",
        planned_global_exercise_id: null,
        planned_custom_exercise_id: "deleted-custom-exercise",
        planned_mapping_set_id: null,
        planned_custom_mapping_set_id: "deleted-custom-mapping",
        planned_mapping_version: 1,
        planned_mapping_checksum: "c".repeat(64),
        planned_custom_mapping_entries: [{ muscleId: "quadriceps", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }],
        actual_target_type: null,
        actual_global_exercise_id: null,
        actual_mapping_set_id: null
      }],
      globalMappings: []
    });
    expect(result.analysis.mappingVersionsUsed).toEqual([expect.objectContaining({ mappingSetId: "deleted-custom-mapping" })]);
    expect(result.analysis.muscles.find((muscle) => muscle.muscleId === "quadriceps")?.rawScore).toBe(3);
  });

  it("fails closed when a recorded global mapping version drifts", () => {
    expect(() => buildSessionMuscleAnalysis({
      ...base,
      globalMappings: base.globalMappings.map((mapping) => mapping.id === "mapping-planned" ? { ...mapping, checksum: "c".repeat(64) } : mapping)
    })).toThrowError(expect.objectContaining<Partial<SessionMuscleAnalysisError>>({ code: "snapshot_mapping_drift" }));
  });

  it("fails safely on an unsupported persisted engine envelope", () => {
    expect(() => buildSessionMuscleAnalysis({
      ...base,
      snapshot: { ...base.snapshot, calculation_engine_version: "future_engine" }
    })).toThrowError(expect.objectContaining<Partial<SessionMuscleAnalysisError>>({ code: "unsupported_snapshot_version" }));
  });
});
