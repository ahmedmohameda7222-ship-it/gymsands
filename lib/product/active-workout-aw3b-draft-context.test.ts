import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("AW-3B draft-context effort isolation", () => {
  it("keeps invalid draft effort non-throwing for context while persistence remains strict", () => {
    const details = source("services/database/workout-set-details.ts");
    const runtimeModel = [
      source("components/workouts/active-workout/active-workout-runtime-model.ts"),
      source("components/workouts/active-workout/active-workout-runtime-model-core.ts")
    ].join("\n");

    expect(details).toContain("export function workoutSetEffortInputForContext(");
    expect(details).toContain("return result.error ? null : result.value");
    expect(details).toContain("export function parseWorkoutSetEffortInput(");
    expect(details).toContain("throw new Error(");

    expect(runtimeModel).toContain('effortMode?: "strict" | "draft-context"');
    expect(runtimeModel).toContain('buildCanonicalLogRows(states, { effortMode: "draft-context" })');
    expect(runtimeModel).toContain('rpe: workoutSetEffortInputForContext(set.rpe, "rpe")');
    expect(runtimeModel).toContain('rir: workoutSetEffortInputForContext(set.rir, "rir")');
    expect(runtimeModel).toContain('const parseEffort = options.effortMode === "draft-context"');
    expect(runtimeModel).toContain(": parseWorkoutSetEffortInput");
    expect(runtimeModel).not.toContain('parseWorkoutSetEffortInput(set.rpe');
    expect(runtimeModel).not.toContain('parseWorkoutSetEffortInput(set.rir');
  });
});
