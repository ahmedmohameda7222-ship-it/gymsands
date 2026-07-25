import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("AW-3B draft-context effort isolation", () => {
  it("keeps invalid draft effort non-throwing for context while persistence remains strict", () => {
    const details = source("services/database/workout-set-details.ts");
    const session = source("components/workouts/workout-day-focus-session.tsx");
    const renderedQa = source("scripts/run-train-layout-qa.mjs");

    expect(details).toContain("export function workoutSetEffortInputForContext(");
    expect(details).toContain("return result.error ? null : result.value");
    expect(details).toContain("export function parseWorkoutSetEffortInput(");
    expect(details).toContain("throw new Error(");

    expect(session).toContain('effortMode?: "strict" | "draft-context"');
    expect(session).toContain('buildLogRows(states, { effortMode: "draft-context" })');
    expect(session).toContain('rpe: workoutSetEffortInputForContext(set.rpe, "rpe")');
    expect(session).toContain('rir: workoutSetEffortInputForContext(set.rir, "rir")');
    expect(session).toContain('const parseEffort = options.effortMode === "draft-context"');
    expect(session).toContain(": parseWorkoutSetEffortInput");
    expect(session).not.toContain('parseWorkoutSetEffortInput(set.rpe');
    expect(session).not.toContain('parseWorkoutSetEffortInput(set.rir');

    expect(renderedQa).toContain('await rpe.fill("8.25")');
    expect(renderedQa).toContain('await rir.fill("20.1")');
    expect(renderedQa).toContain('await rpe.fill("8.5")');
    expect(renderedQa).toContain('await rir.fill("2.5")');
    expect(renderedQa).toContain("invalidEffortBlocked");
    expect(renderedQa).toContain("validCorrectionCleared");
  });
});
