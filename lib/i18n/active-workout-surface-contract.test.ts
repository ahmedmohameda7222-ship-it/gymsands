import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const controller = source(
  "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
);
const details = source(
  "components/workouts/active-workout/active-workout-details-bridge.tsx",
);
const review = source(
  "components/workouts/active-workout/active-workout-review-bridge.tsx",
);
const runtimeModel = source(
  "components/workouts/active-workout/active-workout-runtime-model.ts",
);
const activeWorkoutSurface = [controller, details, review, runtimeModel].join(
  "\n",
);

describe("AW-1B Active Workout surface contract", () => {
  it("uses the ActiveWorkout namespace without changing stable identifiers", () => {
    const shell = source(
      "components/workouts/active-workout/active-workout-execution-shell.tsx",
    );
    const localeMessages = (["en", "de", "ar"] as const).map(
      (locale) =>
        JSON.parse(source(`messages/${locale}.json`)) as {
          ActiveWorkout: {
            units: Record<string, string>;
            set: Record<string, string>;
            actions: Record<string, string>;
            completion: Record<string, string>;
          };
        },
    );

    expect(controller).toContain("useActiveWorkoutTranslation");
    expect(controller).not.toContain("useTrainTranslation");
    for (const key of [
      "normal",
      "warmup",
      "working",
      "failure",
      "drop",
      "backoff",
      "amrap",
      "timed",
      "other",
      "newBest",
    ] as const) {
      for (const messages of localeMessages)
        expect(messages.ActiveWorkout.set[key]?.trim()).not.toBe("");
      expect(activeWorkoutSurface).toContain(`tr("set.${key}"`);
    }
    for (const messages of localeMessages) {
      expect(messages.ActiveWorkout.actions.machineOccupied.trim()).not.toBe(
        "",
      );
      expect(messages.ActiveWorkout.completion.title.trim()).not.toBe("");
      for (const unit of ["kg", "reps", "seconds", "minutes"]) {
        expect(messages.ActiveWorkout.units[unit]?.trim()).not.toBe("");
      }
    }
    expect(details).toContain(
      '<option value="machine_taken">{tr("actions.machineOccupied")}</option>',
    );
    expect(shell).toContain("data-active-set-details-trigger");
    expect(controller).toContain('moreLabel={tr("common.more")}');
    expect(controller).toContain("legacyReopenSetLabel");
    expect(controller).toContain(
      "restartSet(activeExerciseIndex, activeSetIndex)",
    );
  });

  it("isolates dynamic names at their local interpolation or element boundary", () => {
    const indicator = source(
      "components/workouts/active-workout-indicator.tsx",
    );
    const minimizedBar = source(
      "components/workouts/active-workout-minimized-bar.tsx",
    );

    expect(controller).toContain('tr("exercise.nextExercise", {');
    expect(controller).toContain(
      "name: isolateBidiText(nextExercise.exercise.exercise_name)",
    );
    expect(controller).not.toContain(
      "name: nextExercise.exercise.exercise_name",
    );
    expect(controller).toContain('tr("completion.savedNamedWorkout", {');
    expect(controller).toContain("name: isolateBidiText(day.day_name)");
    expect(controller).toContain(
      'tr("exercise.replacementReadyDescription", {',
    );
    expect(controller).toContain("name: isolateBidiText(replacement.name)");
    expect(details).toContain(
      "isolateBidiText(alternative.alternative_exercise_name)",
    );
    expect(details).toContain('<bdi dir="auto">{currentInstructions}</bdi>');
    expect(review).toContain('id="finish-notes"');
    expect(review).toContain('dir="auto"');
    expect(minimizedBar).toContain("<bdi>{title}</bdi>");
    expect(minimizedBar).toContain('dir="ltr"');
  });

  it("routes visible Active Workout measurements and counts through the formatter contract", () => {
    expect(review).toContain('formatters.measurement(totalVolume, "kg")');
    expect(review).toContain(
      'formatters.measurement(durationMinutes, "minutes", 0)',
    );
    expect(review).toContain("formatters.ratio(review.completedSets, review.totalSets)");
    expect(review).toContain("formatters.integer(previewPrs.length)");
    expect(controller).toContain("formatSetNumber={formatters.integer}");
    expect(controller).toContain(
      "clampWorkoutProgress(completedSets, totalSets)",
    );
    expect(controller).toContain("buildActiveWorkoutSetPath");
    expect(controller).toContain('tr("set.label", {');
    expect(controller).toContain(
      "count: formatters.integer(activeSet.setNumber)",
    );
    expect(review).not.toContain("value={`${totalVolume} kg`}");
    expect(review).not.toContain("value={`${completedSets}/${totalSets}`}");
    expect(review).not.toContain("value={String(previewPrs.length)}");
    expect(review).not.toContain("value={String(durationMinutes)}");
  });

  it("localizes the persistent controller and keeps mixed-direction values isolated", () => {
    const indicator = source(
      "components/workouts/active-workout-indicator.tsx",
    );
    const minimizedBar = source(
      "components/workouts/active-workout-minimized-bar.tsx",
    );
    expect(indicator).toContain("useActiveWorkoutTranslation");
    expect(indicator).not.toContain("useTrainTranslation");
    expect(indicator).not.toContain('t("minimized.finishQuestion")');
    expect(indicator).not.toContain('t("minimized.cancelQuestion")');
    expect(minimizedBar).toContain("<bdi>{title}</bdi>");
    expect(minimizedBar).toContain('dir="ltr"');
  });

  it("keeps rendered locale QA aligned with scoped PR checks and phase-close evidence", () => {
    const qa = source("scripts/run-train-layout-qa-base.mjs");
    const prQuality = source(".github/workflows/pr-quality.yml");
    const qualityWorkflow = source(".github/workflows/quality.yml");
    const trainUi = source("components/workouts/train-ui.tsx");

    expect(qa).toMatch(/name:\s*"plaivra\.language\.v1",\s*value:\s*language/);
    expect(qa).toContain('x-plaivra-qa-fixture": "localized-settings"');
    expect(qa).toContain("document.documentElement.lang === expected");
    expect(qa).toContain("active-workout-indicator-ar-390x844.png");
    expect(qa).toContain('{ name: "360x780", width: 360, height: 780 }');
    expect(qa).toContain("horizontalOverflowMatrix");
    expect(prQuality).toContain("name: ui-and-i18n");
    expect(prQuality).toContain("npm run test:unit");
    expect(prQuality).not.toContain("npm run test:i18n");
    expect(prQuality).toContain("npm run qa:rendered");
    expect(prQuality).toContain("npm run qa:train");
    expect(qualityWorkflow).toContain("Record i18n evidence metadata");
    expect(qualityWorkflow).toContain(
      "Upload successful i18n rendered evidence",
    );
    expect(qualityWorkflow).toContain("- ready_for_review");
    expect(qualityWorkflow).toContain(
      "i18n-rendered-evidence-${{ github.event.pull_request.head.sha }}",
    );
    for (const filename of [
      "active-workout-en-390x844.png",
      "active-workout-de-390x844.png",
      "active-workout-ar-390x844.png",
      "active-workout-en-1440x900.png",
      "active-workout-de-1440x900.png",
      "active-workout-ar-1440x900.png",
      "active-workout-indicator-ar-390x844.png",
      "train-layout-qa-results.json",
      "i18n-rendered-evidence-metadata.json",
    ]) {
      expect(qualityWorkflow).toContain(filename);
    }
    for (const metadataKey of [
      "headSha",
      "workflowRunId",
      "workflowRunAttempt",
      "repository",
      "pullRequestNumber",
    ]) {
      expect(qualityWorkflow).toContain(`${metadataKey}:`);
    }
    expect(qualityWorkflow).toContain("retention-days: 14");
    expect(trainUi).toContain(
      "max-[340px]:pb-[calc(var(--active-workout-controller-height)+4rem)]",
    );
  });
});
