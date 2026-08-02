import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "components/workouts/history/repeat-workout-review.tsx",
  "utf8",
);

describe("WH-8 repeat review surface", () => {
  it("reviews current availability and never presents previous results as a prescription", () => {
    expect(source).toContain("repeat-preview");
    expect(source).toContain("historyRepeatDescription");
    expect(source).not.toMatch(/previousActual|performedLogs|personalRecords/);
  });

  it("requires network confirmation and routes only after the server succeeds", () => {
    expect(source).toContain("navigator.onLine");
    expect(source).toContain("historyRepeatNetworkRequired");
    expect(source.indexOf("await fetch")).toBeLessThan(
      source.indexOf("router.push"),
    );
    expect(source).not.toMatch(/indexedDB|queue.*repeat/i);
  });

  it("returns to an active workout without silently cancelling it", () => {
    expect(source).toContain("historyRepeatReturnActive");
    expect(source).toContain("activeSessionConflict.sessionId");
    expect(source).not.toMatch(/cancel.*fetch|cancelWorkout/i);
  });
});
