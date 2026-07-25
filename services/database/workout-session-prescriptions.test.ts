import { describe, expect, it } from "vitest";
import {
  frozenLogCompatibility,
  frozenRepetitionsEntryDefault,
  frozenRepetitionsProjection,
  normalizeWorkoutSessionPrescriptionRows
} from "./workout-session-prescriptions";

const snapshot = { id: "snapshot-a", workout_session_id: "session-a", user_id: "user-a" };
const item = {
  id: "item-a", snapshot_id: "snapshot-a", user_id: "user-a", item_order: 1,
  source_plan_exercise_id: "exercise-a", source_plan_activity_id: "activity-a",
  activity_name_snapshot: "Frozen Press", planned_prescription: { sets: 1, reps: "8-12" }, planned_sets: 1
};
const definitions = [{
  metric_key: "repetitions", metric_version: 1, value_kind: "integer",
  minimum_value: 0, maximum_value: 100000, supports_side: true
}];
const setRow = (overrides: Record<string, unknown> = {}) => ({
  id: "set-a", snapshot_item_id: "item-a", snapshot_id: "snapshot-a",
  workout_session_id: "session-a", user_id: "user-a", set_order: 1,
  performed_order_hint: null, set_type: "other", target_mode: "range",
  side_mode: "none", rest_seconds: 75, tempo_target: "3-1-1-0",
  schema_version: 1, created_at: "2026-07-25T00:00:00.000Z", ...overrides
});
const targetRow = (overrides: Record<string, unknown> = {}) => ({
  id: "target-a", prescription_set_id: "set-a", snapshot_item_id: "item-a",
  workout_session_id: "session-a", user_id: "user-a", metric_key: "repetitions",
  metric_version: 1, side: "none", target_value: null, minimum_value: 8,
  maximum_value: 12, target_mode: "range", created_at: "2026-07-25T00:00:00.000Z", ...overrides
});

describe("immutable workout-session prescription projection", () => {
  it("returns deterministic frozen range, rest, tempo, type and compatibility values", () => {
    const [projection] = normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow()], targets: [targetRow()], definitions
    });
    expect(projection).toMatchObject({
      activityName: "Frozen Press", normalizationStatus: "complete", plannedSets: 1,
      prescriptionSets: [{ setOrder: 1, setType: "other", restSeconds: 75, tempoTarget: "3-1-1-0" }]
    });
    const frozenSet = projection.prescriptionSets[0];
    expect(frozenRepetitionsProjection(frozenSet)).toBe("8-12");
    expect(frozenRepetitionsEntryDefault(frozenSet)).toBe("8");
    expect(frozenLogCompatibility(projection, frozenSet)).toEqual({
      plannedSets: 1, plannedReps: "8-12", plannedRestSeconds: 75, plannedTempo: "3-1-1-0"
    });
  });

  it("keeps custom-only and unavailable prescriptions free of invented repetition values", () => {
    const [custom] = normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [{ ...item, planned_prescription: { sets: 1, reps: "around ten" }, planned_sets: 1 }],
      sets: [setRow({ target_mode: "custom", rest_seconds: null, tempo_target: null })], targets: [], definitions
    });
    expect(custom.normalizationStatus).toBe("partial");
    expect(frozenRepetitionsProjection(custom.prescriptionSets[0])).toBeNull();
    expect(frozenRepetitionsEntryDefault(custom.prescriptionSets[0])).toBe("");

    const [unavailable] = normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [{ ...item, planned_prescription: { note: "heavy reps" }, planned_sets: null }],
      sets: [], targets: [], definitions
    });
    expect(unavailable.normalizationStatus).toBe("unavailable");
    expect(unavailable.prescriptionSets).toEqual([]);
  });

  it("fails closed on duplicate set order, duplicate target identity and owner/session mismatches", () => {
    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow(), setRow({ id: "set-b" })], targets: [], definitions
    })).toThrow(/duplicate set order/i);

    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow()],
      targets: [targetRow(), targetRow({ id: "target-b" })], definitions
    })).toThrow(/duplicate target identity/i);

    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow({ workout_session_id: "session-b" })], targets: [], definitions
    })).toThrow(/session mismatch/i);
  });

  it("enforces registry integer, bounds and side support", () => {
    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow({ target_mode: "exact" })],
      targets: [targetRow({ target_mode: "exact", target_value: 8.5, minimum_value: null, maximum_value: null })], definitions
    })).toThrow(/integer values/i);

    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow({ target_mode: "exact" })],
      targets: [targetRow({ target_mode: "exact", target_value: 100001, minimum_value: null, maximum_value: null })], definitions
    })).toThrow(/outside registry bounds/i);

    expect(() => normalizeWorkoutSessionPrescriptionRows({
      snapshot, items: [item], sets: [setRow({ target_mode: "rounds" })],
      targets: [targetRow({ metric_key: "rounds", target_mode: "rounds", target_value: 3, minimum_value: null, maximum_value: null, side: "left" })],
      definitions: [{ metric_key: "rounds", metric_version: 1, value_kind: "integer", minimum_value: 0, maximum_value: 100000, supports_side: false }]
    })).toThrow(/does not support side/i);
  });

  it("sorts items, sets and targets from explicit identities rather than response order", () => {
    const items = [
      { ...item, id: "item-b", item_order: 2, source_plan_exercise_id: "exercise-b" },
      { ...item, planned_prescription: { sets: 2, reps: "8-12" }, planned_sets: 2 }
    ];
    const sets = [
      setRow({ id: "set-b", snapshot_item_id: "item-a", set_order: 2, target_mode: "custom" }),
      setRow({ target_mode: "custom" }),
      setRow({ id: "set-c", snapshot_item_id: "item-b", set_order: 1, target_mode: "custom" })
    ];
    const result = normalizeWorkoutSessionPrescriptionRows({ snapshot, items, sets, targets: [], definitions });
    expect(result.map((row) => row.id)).toEqual(["item-a", "item-b"]);
    expect(result[0].prescriptionSets.map((row) => row.setOrder)).toEqual([1, 2]);
  });
});
