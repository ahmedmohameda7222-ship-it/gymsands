import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("AW-1B Active Workout surface contract", () => {
  it("uses the ActiveWorkout namespace for the day-focus session without changing stable identifiers", () => {
    const session = source("components/workouts/workout-day-focus-session.tsx");
    const localeMessages = (["en", "de", "ar"] as const).map((locale) =>
      JSON.parse(source(`messages/${locale}.json`)) as {
        ActiveWorkout: {
          set: Record<string, string>;
          actions: Record<string, string>;
          completion: Record<string, string>;
        };
      }
    );

    expect(session).toContain("useActiveWorkoutTranslation");
    expect(session).not.toContain("useTrainTranslation");
    for (const key of ["normal", "warmup", "working", "failure", "drop", "newBest"] as const) {
      for (const messages of localeMessages) expect(messages.ActiveWorkout.set[key]?.trim()).not.toBe("");
      expect(session).toContain(`tr("set.${key}"`);
    }
    for (const messages of localeMessages) {
      expect(messages.ActiveWorkout.actions.machineOccupied.trim()).not.toBe("");
      expect(messages.ActiveWorkout.completion.title.trim()).not.toBe("");
    }
    expect(session).toContain('<option value="machine_taken">{tr("actions.machineOccupied")}</option>');
    expect(session).toContain('aria-label={tr("accessibility.openSessionMenu")}');
    expect(session).toContain("legacyReopenSetLabel");
    expect(session).toContain("restartSet(activeExerciseIndex, activeSetIndex)");
  });

  it("localizes the persistent controller and keeps mixed-direction values isolated", () => {
    const indicator = source("components/workouts/active-workout-indicator.tsx");
    expect(indicator).toContain("useActiveWorkoutTranslation");
    expect(indicator).not.toContain("useTrainTranslation");
    expect(indicator).toContain('t("minimized.finishQuestion")');
    expect(indicator).toContain('t("minimized.cancelQuestion")');
    expect(indicator).toContain("<bdi>{state?.label");
    expect(indicator).toContain('<span dir="ltr" className="tabular-nums">{formatters.timer(elapsed)}</span>');
  });

  it("keeps rendered locale QA aligned with authoritative language persistence and tiny-screen spacing", () => {
    const qa = source("scripts/run-train-layout-qa.mjs");
    const trainUi = source("components/workouts/train-ui.tsx");
    expect(qa).toContain('name: "plaivra.language.v1", value: language');
    expect(qa).toContain('x-plaivra-qa-fixture": "localized-settings"');
    expect(qa).toContain("document.documentElement.lang === expected");
    expect(trainUi).toContain("max-[340px]:pb-[var(--active-workout-controller-height)]");
  });
});
