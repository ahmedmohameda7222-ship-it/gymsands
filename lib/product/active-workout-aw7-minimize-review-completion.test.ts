import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const core = source("components/workouts/active-workout/active-workout-core-session.tsx");
const indicator = source("components/workouts/active-workout-indicator.tsx");
const minimizedBar = source("components/workouts/active-workout-minimized-bar.tsx");
const review = source(
  "components/workouts/active-workout/active-workout-review-bridge.tsx"
);
const screen = source("components/workouts/workout-session-screen.tsx");
const conflict = source("components/workouts/active-workout/active-workout-conflict.tsx");
const muscleController = source(
  "components/workouts/active-workout/active-workout-muscle-load-controller.ts"
);

describe("AW-7 minimize, review, and completion source contract", () => {
  it("uses a single compact authoritative minimized controller without terminal actions", () => {
    expect(indicator).toContain("getActiveSessionStore");
    expect(indicator).toContain("activeSessionClock");
    expect(indicator).toContain("<ActiveWorkoutMinimizedBar");
    expect(indicator).not.toContain("completeSession");
    expect(indicator).not.toContain("cancelSession");
    expect(minimizedBar).toContain("data-active-workout-minimized-bar");
    expect(minimizedBar).toContain('role="progressbar"');
    expect(minimizedBar).not.toContain("Finish");
    expect(minimizedBar).not.toContain("Cancel workout");
  });

  it("uses the authoritative rest cursor target and excludes skipped items from progress", () => {
    const restProjection = indicator.slice(
      indicator.indexOf('execution?.view_state === "rest"'),
      indicator.indexOf("return (", indicator.indexOf('execution?.view_state === "rest"'))
    );

    expect(indicator).not.toContain("const nextItem");
    expect(restProjection).toContain("name: activeItem.activityName");
    expect(restProjection).toContain("current: execution.active_set_number");
    expect(restProjection).toContain("total: activeSetCount");
    expect(minimizedBar).toContain('item.executionState !== "skipped"');
    expect(indicator).toContain("projectActiveWorkoutMinimizedProgress(prescription, logs)");
  });

  it("minimizes only after the core flushes and returns to a validated prior route", () => {
    expect(core).toContain("useRegisterActiveWorkoutMinimize(minimizeWorkout)");
    const minimize = core.slice(
      core.indexOf("const minimizeWorkout"),
      core.lastIndexOf("useRegisterActiveWorkoutMinimize")
    );
    expect(minimize).toContain("flushPendingSetWrites()");
    expect(minimize).toContain("return true");
    expect(minimize).toContain("return false");
    expect(screen).toContain("readPreviousActiveWorkoutRoute");
    expect(screen).toContain("requestMinimize()");
    expect(screen).toContain("useReducedMotion");
    expect(screen).toContain('window.addEventListener("popstate"');
    expect(screen).not.toContain("confirmExit");
    expect(screen).not.toContain("router.back");
  });

  it("persists review before revealing it and exposes exact corrective navigation", () => {
    const openReview = core.slice(
      core.indexOf("async function openSessionReview"),
      core.indexOf("async function leaveReviewAtSet")
    );
    expect(openReview.indexOf("await flushPendingSetWrites()")).toBeGreaterThan(-1);
    expect(openReview.indexOf('dispatchExecutionAwaited("move_cursor"')).toBeGreaterThan(-1);
    expect(openReview.indexOf('view_state: "session_review"')).toBeGreaterThan(-1);
    expect(openReview.indexOf("setFinishOpen(true)"))
      .toBeGreaterThan(openReview.indexOf('view_state: "session_review"'));
    expect(review).toContain("data-aw7-review-surface");
    expect(review).toContain("data-aw7-review-exercise");
    expect(review).toContain("data-aw7-review-set");
    expect(review).toContain("onJumpToSet");
    expect(review).toContain("onReopenSet");
    expect(review).toContain("data-aw7-partial-confirmation");
    expect(review).toContain("onOpenAutoFocus");
  });

  it("proves terminal state before terminal UI and keeps failures recoverable in review", () => {
    const completion = core.slice(
      core.indexOf("async function completeSession"),
      core.indexOf("async function cancelConflictingSession")
    );
    expect(completion).toContain("await store.completeSession");
    expect(completion).toContain('terminal.root.status === "started"');
    expect(completion).toContain("terminal.executionState");
    expect(completion).toContain("restoreReviewAfterCompletionFailure");
    expect(core).toContain('completionRecovery');
    expect(core).not.toContain('router.push("/workout-history")');
    expect(review).toContain("data-aw7-completion-surface");
    expect(review).toContain("data-aw7-completed-summary");
    expect(review).toContain("aw7-final-muscle-load");
    expect(muscleController).toContain('mode?: "active" | "completed"');
    expect(muscleController).toContain('"mode=completed"');
  });

  it("blocks a second session until the open session is resumed or explicitly cancelled", () => {
    expect(core).toContain("getOpenWorkoutSessionWithStatus");
    expect(core).toContain("setConflictingSession(open)");
    expect(core).toContain("if (conflictingSession)");
    expect(conflict).toContain("href={resumeHref}");
    expect(conflict).toContain("onCancelAndStart");
    expect(conflict).toContain("data-aw7-conflict-cancel-confirmation");
    const cancel = core.slice(
      core.indexOf("async function cancelConflictingSession"),
      core.indexOf("function handleReplacement")
    );
    expect(cancel).toContain("await store.cancelSession()");
    expect(cancel.indexOf("setLaunchRevision"))
      .toBeGreaterThan(cancel.indexOf("await store.cancelSession()"));
  });
});
