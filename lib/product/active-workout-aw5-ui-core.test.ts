import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const controller = source(
  "components/workouts/active-workout/active-workout-core-session.tsx"
);
const shell = source(
  "components/workouts/active-workout/active-workout-execution-shell.tsx"
);
const runtimeModel = source(
  "components/workouts/active-workout/active-workout-runtime-model.ts"
);
const sourceCompatibility = source(
  "components/workouts/active-workout/active-workout-source-compatibility.ts"
);
const detailsBridge = source(
  "components/workouts/active-workout/active-workout-details-bridge.tsx"
);
const reviewBridge = source(
  "components/workouts/active-workout/active-workout-review-bridge.tsx"
);
const workoutSessionScreen = source(
  "components/workouts/workout-session-screen.tsx"
);
const stickyActions = source(
  "components/layout/mobile-sticky-actions.tsx"
);
const dayRoute = source("components/workouts/workout-day-focus-session.tsx");
const directRoute = source("components/workouts/workout-session-form.tsx");
const directPage = source("app/(private)/workouts/session/[id]/page.tsx");
const activeWorkoutI18n = source("lib/i18n/active-workout.ts");

describe("AW-5 Active Workout UI core source contract", () => {
  it("converges both routes on one shared controller and shell", () => {
    expect(dayRoute).toContain("ActiveWorkoutCoreSession");
    expect(directRoute).toContain("ActiveWorkoutCoreSession");
    expect(controller).toContain("ActiveWorkoutExecutionShell");
    expect(controller).toContain('sourceKind === "plan-day"');
    expect(controller).toContain('sourceKind === "direct"');
  });

  it("preserves AW-4 authority for clock, transitions, canonical sets, and terminal completion", () => {
    expect(controller).toContain("getActiveSessionStore");
    expect(controller).toContain("activeSessionClock");
    expect(controller).toContain("planSessionAfterSetCompletion");
    expect(controller).toContain("completeCanonicalSet");
    expect(controller).toContain("store.completeSession");
    expect(controller).not.toContain("window.setInterval");
    expect(controller).not.toMatch(/switch\s*\(\s*commandType/);
    expect(controller).not.toContain("createWorkoutSessionExecutionWriteQueue");
    expect(controller).not.toContain("supabase.from");
    expect(controller).not.toMatch(/from\(\s*["'](?:exercise_logs|workout_session_execution_state|workout_set_details)/);
  });

  it("keeps the compact primary shell free of rejected legacy presentation", () => {
    expect(shell).toContain("data-aw5-execution-shell");
    expect(shell).toContain("data-aw5-mini-heat-map-slot");
    expect(shell).toContain("data-active-set-details-trigger");
    expect(shell).toContain("active-set-reps");
    expect(shell).toContain("active-set-weight");
    expect(shell).toContain('aria-current={item.state === "active" ? "step"');
    expect(shell).not.toContain("SessionMuscleLoadPanel");
    expect(shell).not.toContain("Saving...");
    expect(shell).not.toContain("Saved");
    expect(shell).not.toContain("carousel");
    expect(shell).not.toMatch(/>\s*\{progressPercent\}%\s*</);
  });

  it("renders completion as a dedicated terminal surface instead of stacking it above the editor", () => {
    expect(reviewBridge).toContain("if (completedSummary)");
    expect(reviewBridge).toContain("data-aw5-completion-surface");
    expect(reviewBridge).toContain("fixed inset-0");
    expect(reviewBridge).toContain("overflow-y-auto bg-background");
    expect(reviewBridge).toContain("min-h-dvh");
    expect(reviewBridge).toContain("<WorkoutSummaryCard");
    expect(reviewBridge).not.toContain("{completedSummary ? (");
  });

  it("removes the loaded direct-route hero and uses one localized generic session label", () => {
    expect(directPage).not.toContain("PageHeading");
    expect(directPage).toContain("WorkoutSessionForm");
    expect(controller).toContain('tr("header.workoutSession")');
    expect(activeWorkoutI18n).toContain('en: "Workout session"');
    expect(activeWorkoutI18n).toContain('de: "Trainingseinheit"');
    expect(activeWorkoutI18n).toContain('ar: "جلسة التمرين"');
  });

  it("uses one source compatibility helper without regressing canonical cache namespaces", () => {
    expect(controller).toContain("activeWorkoutStorageIdentities");
    expect(sourceCompatibility).toContain('"workout-day-session"');
    expect(sourceCompatibility).toContain('"workout-day-rest-timer"');
    expect(sourceCompatibility).toContain('"single-workout-session"');
    expect(sourceCompatibility).toContain('"single-workout-rest"');
  });

  it("extracts pure runtime calculations and bounded AW-6/AW-7 compatibility bridges", () => {
    expect(controller).toContain("ActiveWorkoutDetailsBridge");
    expect(controller).toContain("ActiveWorkoutReviewBridge");
    expect(controller).toContain("active-workout-runtime-model");
    expect(controller).not.toMatch(/function\s+(?:buildPrs|buildSummary|historicalSets|previousPerformance|previousSetForExercise)\b/);
    expect(controller).not.toMatch(/from\s+["']@\/components\/ui\/dialog["']/);
    expect(controller).not.toContain("AiActionRequestDialog");
    expect(controller).not.toContain("WorkoutAiActionPanel");
    expect(controller).not.toContain("ExercisePickerDialog");
    expect(controller).not.toContain("MotionCard");
    expect(runtimeModel).not.toContain('from "react"');
    expect(runtimeModel).not.toContain("getActiveSessionStore");
    expect(runtimeModel).not.toContain("activeSessionClock");
    expect(runtimeModel).not.toContain("window.");
    for (const bridge of [detailsBridge, reviewBridge]) {
      expect(bridge).not.toContain("getActiveSessionStore");
      expect(bridge).not.toContain("activeSessionClock");
      expect(bridge).not.toContain("store.hydrate");
      expect(bridge).not.toContain("supabase");
    }
  });

  it("uses primitive identity for bootstrap and cache authority", () => {
    expect(controller).toContain("const userId = user?.id ?? null");
    expect(controller).toContain("const sourceKind = source.kind");
    expect(controller).toContain("const sourceId =");
    expect(controller).not.toContain("[mirrorExecutionState, session, toast, tr, user]");
    expect(controller).not.toContain("user.id");
    expect(controller).not.toContain("react-hooks/exhaustive-deps");
    expect(directPage).not.toContain("react-hooks/exhaustive-deps");
  });

  it("exposes explicit logical close and session-sticky geometry contracts", () => {
    expect(workoutSessionScreen).toContain("data-workout-session-close");
    expect(workoutSessionScreen).toContain("start-3");
    expect(workoutSessionScreen).not.toContain("end-3 top-3");
    expect(stickyActions).toContain('placement?: MobileStickyActionsPlacement');
    expect(stickyActions).toContain('"app" | "session"');
    expect(shell).toContain('placement="session"');
    for (const selector of [
      "data-aw5-session-title",
      "data-aw5-metadata",
      "data-aw5-pause-resume",
      "data-aw5-set-path",
      "data-aw5-rest-presets",
      "data-aw5-primary-editor",
      "data-aw5-feedback",
      "data-aw5-sticky-actions"
    ]) {
      expect(shell).toContain(selector);
    }
  });
});
