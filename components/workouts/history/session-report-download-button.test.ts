import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workout History report action contract", () => {
  it("places report, correction, and delete in the capability-driven More menu", () => {
    const source = readFileSync("components/workouts/history/session-history-more-actions.tsx", "utf8");
    expect(source).toContain("ActionMenu");
    expect(source).toContain("capabilities.downloadReport");
    expect(source).toContain("capabilities.correctSession");
    expect(source).toContain("capabilities.softDeleteSession");
    expect(source).toContain("downloadPerformedWorkoutReport");
    expect(source).toContain("useConfirm");
    expect(source).not.toContain("window.confirm");
  });
});
