import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("approved Train Phase 1 UI contracts", () => {
  it("shares the Train container, week selector, and official OpenAI mark", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    const detail = source("components/workouts/workout-plan-detail.tsx");
    const week = source("components/workouts/train-week-selector.tsx");
    const ui = source("components/workouts/train-ui.tsx");
    expect(overview).toContain("<TrainPageContainer");
    expect(detail).toContain("<TrainWeekSelector");
    expect(week).toContain('role="tablist"');
    expect(week).toContain('aria-current={item.isToday ? "date" : undefined}');
    expect(ui).toContain("<OpenAiBlossom");
  });

  it("keeps builder validation neutral until attempted and preserves keyboard reorder", () => {
    const builder = source("components/workouts/workout-plan-builder.tsx");
    const editor = source("components/workouts/workout-plan-editor.tsx");
    expect(builder).toContain("validationAttempted && incomplete");
    expect(builder).toContain("continueToNextStep");
    expect(builder).not.toContain('disabled={!basicsValid || !exerciseStepValid}');
    for (const content of [builder, editor]) {
      expect(content).toContain("<ActionMenuItem");
      expect(content).toContain("grid-cols-3");
      expect(content).toContain("<TrainStickyFooter");
      expect(content).not.toContain('role="tab"');
      expect(content).not.toContain('role="tablist"');
      expect(content).toContain("aria-pressed={selected}");
    }
  });

  it("keeps picker selection, duplicates, keyboard selection, focus return, request grouping, cancellation, and explicit pagination", () => {
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(picker).not.toContain('role="option"');
    expect(picker).toContain("aria-pressed={isSelected}");
    expect(picker).toContain("existing.has(key)");
    expect(picker).toContain("!isActionable(key)");
    expect(picker).toContain("onCloseAutoFocus");
    expect(picker).toContain('variant={isSelected ? "default" : "outline"} className="min-h-11 w-full"');
    expect(picker).toContain("onClick={() => toggle(exercise)}");
    expect(picker).toContain("activeFilterChips");
    expect(picker).toContain("min-h-[52px] w-full");
    expect(picker).toContain("const muscleOptions = filterOptions.primaryMuscles");
    expect(picker).toContain("hasAdvancedOptions");
    expect(picker).toContain("key={chip.id}");
    expect(picker).toContain('if (exercise.catalog_slug) return `catalog:${exercise.catalog_slug}`');
    expect(picker).toContain("createCatalogRequestGroupId()");
    expect(picker).toContain("requestGroupId: initialCatalogRequestGroupId");
    expect(picker).toContain("mergeCanonicalWorkoutFilterOptions(options, result.filterOptions!)");
    expect(picker).toContain('optionLabel(muscleOptions, muscle, language, "muscle")');
    expect(picker).toContain("signal: controller.signal");
    expect(picker).toContain("data-picker-load-more");
    expect(picker).toContain("pagination.nextCursor");
    expect(picker).not.toContain("pagination.nextOffset");
    expect(picker).not.toContain("slice(0, 60)");
  });

  it("localizes the day-focus session while preserving stable set and replacement identifiers", () => {
    const controller = source("components/workouts/active-workout/active-workout-core-session-implementation.tsx");
    const details = source("components/workouts/active-workout/active-workout-details-bridge.tsx");
    const replacement = source("components/workouts/active-workout/active-workout-replacement-recommendations.tsx");
    const shell = source("components/workouts/active-workout/active-workout-execution-shell.tsx");
    const activeWorkout = `${controller}\n${details}`;
    for (const key of ["normal", "warmup", "working", "failure", "drop", "backoff", "amrap", "timed", "other"]) {
      expect(activeWorkout).toContain(`tr("set.${key}"`);
    }
    expect(controller).toContain("useActiveWorkoutTranslation");
    expect(replacement).toContain('"machine_taken"');
    expect(replacement).toContain('machine_taken: "replacement.reasonMachineTaken"');
    expect(replacement).toContain('tr(reasonTranslationKey[candidateReason])');
    expect(controller).toContain('moreLabel={tr("common.more")}');
    expect(shell).toContain("aria-label={label}");
    expect(shell).toContain("label={moreLabel}");
    expect(activeWorkout).not.toContain('<option value="normal">Normal</option>');
  });

  it("localizes detail, history filters, direct-session failures, and the active workout controller", () => {
    const detail = source("app/(private)/workouts/[id]/page.tsx");
    const history = source("components/workouts/history/workout-history-period-control.tsx");
    const directSession = source("app/(private)/workouts/session/[id]/page.tsx");
    const activeWorkout = source("components/workouts/active-workout-indicator.tsx");
    const translations = source("lib/i18n/train.ts");
    const keys = [
      "exerciseVideoLoadWarning", "customVideoSavedTitle", "exerciseNotFoundDescription",
      "historyPeriodWeek", "historyPeriodMonth", "historyPreviousPeriod", "historyNextPeriod", "workoutSessionOpenFailed",
      "couldNotStartWorkout", "activeWorkoutLoadFailed", "returnToWorkout",
      "finishActiveWorkoutQuestion", "cancelActiveWorkoutQuestion"
    ];
    for (const key of keys) expect(translations.match(new RegExp(`${key}:`, "g"))?.length).toBe(3);
    expect(detail).toContain("useExerciseDetailTranslation");
    expect(detail).toContain("mediaUrl ? <ExerciseMedia");
    expect(detail).toContain("exercise.equipment.join");
    expect(history).toContain('week: tr("historyPeriodWeek")');
    expect(history).toContain('month: tr("historyPeriodMonth")');
    expect(history).toContain('aria-label={tr("historyPreviousPeriod")}');
    expect(history).toContain('aria-label={tr("historyNextPeriod")}');
    expect(directSession).toContain('userSafeError(error, tr("workoutSessionOpenFailed"))');
    expect(directSession).toContain("const userId = user?.id ?? null");
    expect(directSession).toContain("const workoutId = params.id");
    expect(directSession).toContain("[locale, toast, tr, userId, workoutId]");
    expect(activeWorkout).toContain("<ActiveWorkoutMinimizedBar");
    expect(activeWorkout).toContain('t("common.pause")');
    expect(activeWorkout).toContain('t("common.resume")');
    expect(activeWorkout).not.toContain('t("minimized.finishQuestion")');
    expect(activeWorkout).not.toContain('t("minimized.cancelQuestion")');
    expect(activeWorkout).not.toContain("Return to workout</Link>");
  });

  it("localizes Train destinations and preserves the hidden session shell with safe actions", () => {
    const library = source("app/(private)/workouts/page.tsx");
    const historyRoute = source("app/(private)/workout-history/page.tsx");
    const history = source("components/workouts/history/workout-history-page.tsx");
    const session = source("app/(private)/workouts/session/[id]/page.tsx");
    const sessionForm = source("components/workouts/active-workout/active-workout-execution-shell.tsx");
    const sticky = source("components/layout/mobile-sticky-actions.tsx");
    const shell = source("components/layout/app-shell.tsx");
    const translations = source("lib/i18n/train.ts");
    for (const route of [library, history]) {
      expect(route).toContain("useTrainTranslation");
      expect(route).toContain("<TrainPageContainer");
      expect(route).toContain("dir={dir}");
    }
    expect(historyRoute).toContain("<WorkoutHistoryScreen />");
    expect(session).toContain('<WorkoutSessionScreen fallbackHref="/workouts">');
    expect(session).not.toContain("confirmExit");
    expect(sessionForm).toContain("<MobileStickyActions");
    expect(sessionForm).toContain('placement="session"');
    expect(sessionForm).toContain('<MobileStickyActionsSpacer placement="session"');
    expect(sticky).toContain('export type MobileStickyActionsPlacement = "app" | "session"');
    expect(shell.match(/Logout/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(translations.match(/browseExercisesDescription:/g)?.length).toBe(3);
    expect(translations.match(/closeWorkoutSession:/g)?.length).toBe(3);
  });
});
