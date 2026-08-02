import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "components/workouts/history/session-correction-dialog.tsx",
  "utf8",
);

describe("Workout History correction draft recovery", () => {
  it("keeps invalid edited values actionable so Save can show validation", () => {
    expect(source).toContain("function draftHasChanges");
    expect(source).toContain("const hasChanges = sessionChanged || draftHasChanges(draft)");
    expect(source).toContain("disabled={busy || !hasChanges}");
    expect(source).not.toContain("const hasChanges = sessionChanged || preview.length > 0");
  });

  it("keeps Undo remove interactive while disabling only the removed set inputs", () => {
    expect(source).toContain("aria-disabled={set.removed}");
    expect(source).not.toMatch(/<fieldset[^>]*\sdisabled=/u);
    expect(source).toContain("<Input disabled={set.removed}");
    expect(source).toContain("<select disabled={set.removed}");
    expect(source).toContain("onClick={() => toggleRemoved(exercise.identity, set.key)}");
  });

  it("drops a newly added unsaved set instead of creating a no-op removal", () => {
    expect(source).toContain("if (target?.added)");
    expect(source).toContain("sets: exercise.sets.filter((set) => set.key !== setKey)");
  });

  it("refuses mutation requests without a member access token", () => {
    expect(source).toContain("const token = session?.access_token");
    expect(source).toContain('"unauthorized"');
    expect(source).toContain("Authorization: `Bearer ${token}`");
    expect(source).not.toContain('Authorization: `Bearer ${session?.access_token ?? ""}`');
  });
});
