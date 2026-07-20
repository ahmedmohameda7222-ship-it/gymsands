import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("AW-1B Active Workout surface contract", () => {
  it("uses the ActiveWorkout namespace for the day-focus session without changing stable identifiers", () => {
    const session = source("components/workouts/workout-day-focus-session.tsx");
    const localeMessages = (["en", "de", "ar"] as const).map((locale) =>
      JSON.parse(source(`messages/${locale}.json`)) as {
        ActiveWorkout: {
          units: Record<string, string>;
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
      for (const unit of ["kg", "reps", "seconds", "minutes"]) {
        expect(messages.ActiveWorkout.units[unit]?.trim()).not.toBe("");
      }
    }
    expect(session).toContain('<option value="machine_taken">{tr("actions.machineOccupied")}</option>');
    expect(session).toContain('aria-label={tr("accessibility.openSessionMenu")}');
    expect(session).toContain("legacyReopenSetLabel");
    expect(session).toContain("restartSet(activeExerciseIndex, activeSetIndex)");
  });

  it("isolates dynamic names at their local interpolation or element boundary", () => {
    const session = source("components/workouts/workout-day-focus-session.tsx");
    const indicator = source("components/workouts/active-workout-indicator.tsx");

    expect(session).toContain('tr("exercise.nextExercise", { name: isolateBidiText(nextExercise.exercise.exercise_name) })');
    expect(session).not.toContain('tr("exercise.nextExercise", { name: nextExercise.exercise.exercise_name })');
    expect(session).toContain('tr("completion.savedNamedWorkout", { name: isolateBidiText(day.day_name) })');
    expect(session).toContain('tr("exercise.replacementReadyDescription", { name: isolateBidiText(replacement.name) })');
    expect(session).toContain('map((alternative) => isolateBidiText(alternative.alternative_exercise_name))');
    expect(session).toContain('<bdi dir="auto">{currentInstructions}</bdi>');
    expect(session).toContain('textarea id="finish-notes" dir="auto"');
    expect(indicator).toContain("<bdi>{state?.label");
    expect(indicator).toContain('<span dir="ltr" className="tabular-nums">{formatters.timer(elapsed)}</span>');
  });

  it("routes visible Active Workout measurements and counts through the formatter contract", () => {
    const session = source("components/workouts/workout-day-focus-session.tsx");

    expect(session).toContain('formatters.measurement(totalVolume, "kg")');
    expect(session).toContain('formatters.measurement(durationMinutes, "minutes", 0)');
    expect(session).toContain("formatters.ratio(completedSets, totalSets)");
    expect(session).toContain("formatters.integer(previewPrs.length)");
    expect(session).toContain("formatters.integer(set.setNumber)");
    expect(session).toContain("formatters.ratio(done, item.sets.length)");
    expect(session).toContain("formatters.ratio(activeExercise.sets.filter((set) => set.completedAt).length, activeExercise.sets.length)");
    expect(session).toContain("formatPlannedReps(nextExercise.exercise.reps, formatters");
    expect(session).not.toContain('value={`${totalVolume} kg`}');
    expect(session).not.toContain('value={`${completedSets}/${totalSets}`}');
    expect(session).not.toContain("value={String(previewPrs.length)}");
    expect(session).not.toContain("value={String(durationMinutes)}");
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

  it("keeps rendered locale QA aligned with authoritative persistence, final-head evidence, and tiny-screen spacing", () => {
    const qa = source("scripts/run-train-layout-qa.mjs");
    const quality = source(".github/workflows/quality.yml");
    const trainUi = source("components/workouts/train-ui.tsx");

    expect(qa).toContain('name: "plaivra.language.v1", value: language');
    expect(qa).toContain('x-plaivra-qa-fixture": "localized-settings"');
    expect(qa).toContain("document.documentElement.lang === expected");
    expect(qa).toContain("active-workout-indicator-ar-390x844.png");
    expect(qa).toContain('{ name: "360x780", width: 360, height: 780 }');
    expect(qa).toContain("horizontalOverflowMatrix");
    expect(quality).toContain("Upload AW-1B final-head rendered evidence");
    expect(quality).toContain("aw1b-final-head-rendered-${{ github.event.pull_request.head.sha }}");
    expect(trainUi).toContain("max-[340px]:pb-[var(--active-workout-controller-height)]");
  });
});
