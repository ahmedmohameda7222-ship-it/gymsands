import { describe, expect, it } from "vitest";
import type { MuscleMappingReference } from "./contracts";
import { calculateMuscleLoad, getExerciseMuscleFocus } from "./calculate-muscle-load";
import { MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

function mapping(id: string, entries: MuscleMappingReference["entries"]): MuscleMappingReference {
  return {
    mappingSetId: `${id}-mapping`, targetId: id, targetType: "global_exercise", mappingVersion: 1,
    schemaVersion: MUSCLE_MAPPING_SCHEMA_VERSION, checksum: "a".repeat(64), entries
  };
}

const bench = mapping("bench", [
  { muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 },
  { muscleId: "triceps_brachii", role: "secondary", contribution: 0.5, sideScope: "bilateral", sortOrder: 2 },
  { muscleId: "anterior_deltoid", role: "secondary", contribution: 0.5, sideScope: "bilateral", sortOrder: 3 }
]);
const fly = mapping("fly", [
  { muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 },
  { muscleId: "anterior_deltoid", role: "secondary", contribution: 0.25, sideScope: "bilateral", sortOrder: 2 },
  { muscleId: "triceps_brachii", role: "stabilizer", contribution: 0, sideScope: "bilateral", sortOrder: 3 }
]);

function score(result: ReturnType<typeof calculateMuscleLoad>, muscleId: string) {
  return result.muscles.find((muscle) => muscle.muscleId === muscleId);
}

describe("deterministic resistance-set muscle load", () => {
  it("calculates the exact Bench Press fixture", () => {
    const result = calculateMuscleLoad({ mode: "planned", period: { kind: "session" }, items: [{ itemId: "bench", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets: 3 } }] });
    expect(score(result, "pectoralis_major")?.rawScore).toBe(3);
    expect(score(result, "triceps_brachii")?.rawScore).toBe(1.5);
    expect(score(result, "anterior_deltoid")?.rawScore).toBe(1.5);
    expect(result.completeness).toBe("complete");
  });

  it("calculates Chest Fly and preserves a zero-score stabilizer in the breakdown", () => {
    const result = calculateMuscleLoad({ mode: "completed", period: { kind: "session" }, items: [{ itemId: "fly", mapping: fly, workload: { model: "resistance_sets_v1", qualifyingSets: 3 } }] });
    expect(score(result, "pectoralis_major")?.rawScore).toBe(3);
    expect(score(result, "anterior_deltoid")?.rawScore).toBe(0.75);
    expect(score(result, "triceps_brachii")?.rawScore).toBe(0);
    expect(result.contributionBreakdown).toContainEqual(expect.objectContaining({ muscleId: "triceps_brachii", role: "stabilizer", rawScore: 0 }));
  });

  it("applies exact completeness rules and machine-readable warnings", () => {
    const empty = calculateMuscleLoad({ mode: "planned", period: { kind: "session" }, items: [] });
    expect(empty.completeness).toBe("complete");
    expect(empty.warnings).toEqual(["no_items"]);
    expect(empty.muscles.every((muscle) => muscle.level === "inactive")).toBe(true);

    const partial = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items: [
      { itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets: 1 } },
      { itemId: "b", workload: { model: "resistance_sets_v1", qualifyingSets: 2 } },
      { itemId: "c", mapping: fly, workload: { model: "duration_minutes_v1", value: 20 } }
    ] });
    expect(partial.completeness).toBe("partial");
    expect(partial.coverage).toEqual({ totalItemCount: 3, includedItemCount: 1, unmappedItemCount: 1, unsupportedItemCount: 1 });

    const limited = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items: [{ itemId: "a", mapping: bench, workload: { model: "distance_meters_v1", value: 5000 } }] });
    expect(limited.completeness).toBe("limited");
    const unavailable = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items: [{ itemId: "a", workload: { model: "resistance_sets_v1", qualifyingSets: 1 } }] });
    expect(unavailable.completeness).toBe("unavailable");
  });

  it.each([
    [0, "inactive"], [0.01, "low"], [2, "low"], [2.01, "medium"], [5, "medium"], [5.01, "high"], [8, "high"], [8.01, "very_high"]
  ])("applies session boundary %s as %s", (sets, level) => {
    const result = calculateMuscleLoad({ mode: "planned", period: { kind: "session" }, items: [{ itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets: sets as number } }] });
    expect(score(result, "pectoralis_major")?.level).toBe(level);
  });

  it.each([
    [0, "inactive"], [0.01, "low"], [4, "low"], [4.01, "medium"], [8, "medium"], [8.01, "high"], [14, "high"], [14.01, "very_high"]
  ])("applies weekly boundary %s as %s", (sets, level) => {
    const result = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items: [{ itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets: sets as number } }] });
    expect(score(result, "pectoralis_major")?.level).toBe(level);
  });

  it("rejects negative, NaN, and infinite qualifying sets", () => {
    for (const qualifyingSets of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calculateMuscleLoad({ mode: "planned", period: { kind: "session" }, items: [{ itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets } }] })).toThrow(/finite and non-negative/i);
    }
  });

  it("returns identical normalized output after item and entry shuffling", () => {
    const input = { mode: "planned" as const, period: { kind: "week" as const }, items: [
      { itemId: "b", mapping: { ...fly, entries: [...fly.entries].reverse() }, workload: { model: "resistance_sets_v1" as const, qualifyingSets: 2 } },
      { itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1" as const, qualifyingSets: 3 } }
    ] };
    expect(calculateMuscleLoad(input)).toEqual(calculateMuscleLoad({ ...input, items: [...input.items].reverse() }));
  });

  it("uses weekly average for long-period level while preserving total raw score", () => {
    const result = calculateMuscleLoad({ mode: "completed", period: { kind: "long_period", weekCount: 4 }, items: [{ itemId: "a", mapping: bench, workload: { model: "resistance_sets_v1", qualifyingSets: 36 } }] });
    expect(score(result, "pectoralis_major")).toMatchObject({ rawScore: 36, averageWeeklyRawScore: 9, levelInputScore: 9, level: "high" });
  });

  it("returns roles for exercise focus without workload or presentation colors", () => {
    expect(getExerciseMuscleFocus(fly)).toContainEqual({ muscleId: "triceps_brachii", role: "stabilizer", contribution: 0, sideScope: "bilateral" });
    const result = calculateMuscleLoad({ mode: "planned", period: { kind: "session" }, items: [] });
    expect(JSON.stringify(result)).not.toMatch(/color|danger|injury|overtraining/i);
  });

  it("scales result size linearly without wall-clock assertions", () => {
    const items = Array.from({ length: 500 }, (_, index) => ({ itemId: `item-${index.toString().padStart(3, "0")}`, mapping: bench, workload: { model: "resistance_sets_v1" as const, qualifyingSets: 3 } }));
    const result = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items });
    expect(result.coverage.includedItemCount).toBe(500);
    expect(result.contributionBreakdown).toHaveLength(500 * bench.entries.length);
    expect(result.muscles).toHaveLength(24);
  });
});
