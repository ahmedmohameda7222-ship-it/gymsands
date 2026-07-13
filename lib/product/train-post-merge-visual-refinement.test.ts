
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Train post-merge visual refinement contracts", () => {
  test("renders concise menu labels while retaining descriptive accessible labels", () => {
    const menu = source("components/ui/action-menu.tsx");
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(menu).toContain('visibleLabel ?? label');
    expect(overview).toContain('visibleLabel={tr("moreActions")}');
  });

  test("uses a full-screen mobile picker and no more than two result columns", () => {
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(picker).toContain("top-0 h-dvh max-h-dvh w-screen");
    expect(picker).toContain("grid grid-cols-1 gap-3 lg:grid-cols-2");
    const resultGrid = picker.match(/className="([^"]*grid-cols-1[^"]*)" data-picker-results/)?.[1] ?? "";
    expect(resultGrid).toContain("lg:grid-cols-2");
    expect(resultGrid).not.toMatch(/grid-cols-3/);
  });

  test("keeps picker filters wrapping and reserves space for the fixed footer", () => {
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(picker).toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(picker).toContain("pb-32");
    expect(picker).toContain("data-picker-footer");
  });

  test("distinguishes Today from the selected week day", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(overview).toContain('aria-current={isToday ? "date" : undefined}');
    expect(overview).toContain("data-week-selected");
    expect(overview).toContain('isSelected ? "border-primary bg-primary/10');
    expect(overview).toContain('isToday ? "border-primary/50 bg-primary/[0.04]');
  });

  test("shows local incomplete-day validation and 44px exercise actions", () => {
    for (const file of ["components/workouts/workout-plan-builder.tsx", "components/workouts/workout-plan-editor.tsx"]) {
      const content = source(file);
      expect(content).toContain('tr("addExercisesToContinue")');
      expect(content).toContain("min-h-11 min-w-11");
      expect(content).toContain("data-exercise-prescription");
    }
  });

  test("filters internal source metadata from builder and editor presentation", () => {
    const helper = source("lib/workouts/train-visual.ts");
    const builder = source("components/workouts/workout-plan-builder.tsx");
    const editor = source("components/workouts/workout-plan-editor.tsx");
    expect(helper).toContain("plaivra_legacy_workouts");
    expect(builder).toContain("userFacingExerciseNote(exercise.notes)");
    expect(editor).toContain("userFacingExerciseNote(exercise.notes)");
  });

  test("includes complete localized visual labels", () => {
    const i18n = source("lib/i18n/train.ts");
    expect(i18n.match(/programDuration:/g)?.length).toBe(3);
    expect(i18n.match(/sessionDuration:/g)?.length).toBe(3);
    expect(i18n.match(/noExercisesAdded:/g)?.length).toBe(3);
    expect(i18n.match(/selectedDay:/g)?.length).toBe(3);
  });
});
