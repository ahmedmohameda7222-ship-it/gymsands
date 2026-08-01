import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workout History filter surface", () => {
  it("keeps all approved controls member-facing and excludes private URL state", () => {
    const filters = readFileSync("components/workouts/history/workout-history-filters.tsx", "utf8");
    const navigation = readFileSync("lib/workouts/history/navigation-state.ts", "utf8");
    for (const field of ["workoutType", "muscle", "exercise", "plan", "statuses", "progressOnly", "sort"]) {
      expect(filters).toContain(field);
    }
    for (const key of ["period", "from", "to", "q", "type", "muscle", "exercise", "plan", "status", "progress", "sort", "selected"]) {
      expect(navigation).toContain(`\"${key}\"`);
    }
    expect(navigation).not.toContain('params.set("notes"');
    expect(navigation).not.toContain('params.set("cursor"');
  });
});
