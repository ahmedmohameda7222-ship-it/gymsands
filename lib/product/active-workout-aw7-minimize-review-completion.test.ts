import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const core = source("components/workouts/active-workout/active-workout-core-session-implementation.tsx");
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
const recordsClient = source(
  "services/workouts/active-workout/terminal-personal-records-client.ts"
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

  it("minimizes through the shared session-safe navigation boundary before returning to a validated prior route", () => {
    expect(core).toContain("useRegisterActiveWorkoutMinimize(minimizeWorkout)");
    expect(core).toContain("const minimizeWorkout = preserveWorkoutForNavigation");
    const preserve = core.slice(
      core.indexOf("const preserveWorkoutForNavigation"),
      core.indexOf("const minimizeWorkout")
    );
    expect(preserve).toContain("pendingSetCompletionPromiseRef.current");
    expect(preserve).toContain("await persistSetDrafts()");
    expect(preserve).toContain("await flushPendingSetWrites()");
    expect(preserve).toContain("mirrorExecutionState(authoritativeState)");
    expect(preserve).toContain("return true");
    expect(preserve).toContain("return false");
    expect(screen).toContain("readPreviousActiveWorkoutRoute");
    expect(screen).toContain("requestMinimize()");
    expect(screen).toContain("useReducedMotion");
    expect(screen).toContain('window.addEventListener("popstate"');
    expect(screen).not.toContain("confirmExit");
    expect(screen).not.toContain("router.back");
  });

  it("persists Review before revealing it and exposes exact corrective navigation", () => {
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
    expect(review).toContain("data-aw10-review-no-pr-preview");
    expect(review).toContain("data-aw7-review-exercise");
    expect(review).toContain("data-aw7-review-set");
    expect(review).toContain("onJumpToSet");
    expect(review).toContain("onReopenSet");
    expect(review).toContain("data-aw7-partial-confirmation");
    expect(review).toContain("onOpenAutoFocus");
    expect(review).not.toContain("previewPrs.length");
  });

  it("proves terminal state before terminal UI and keeps failures recoverable in Review", () => {
    const completion = core.slice(
      core.indexOf("async function completeSession"),
      core.indexOf("async function cancelCurrentSession")
    );
    expect(completion).toContain("await store.completeSession");
    expect(completion).toContain('terminal.root.status === "started"');
    expect(completion).toContain("terminal.executionState");
    expect(completion).toContain("restoreReviewAfterCompletionFailure");
    expect(core).toContain("completionRecovery");
    expect(core).not.toContain('router.push("/workout-history")');
    expect(review).toContain("data-aw7-completion-surface");
    expect(review).toContain("data-aw7-completed-summary");
    expect(review).toContain("data-aw10-terminal-completion");
    expect(review).toContain("data-aw7-final-muscle-load");
    expect(muscleController).toContain('mode?: "active" | "completed"');
    expect(muscleController).toContain('"mode=completed"');
  });

  it("reads Personal Records only after terminal save and never treats pending as zero", () => {
    expect(review).toContain("refreshAndReadActiveWorkoutPersonalRecords");
    expect(review).toContain('useState<"pending" | "loaded" | "unavailable">');
    expect(review).toContain('recordState === "pending"');
    expect(review).toContain('setRecordState("unavailable")');
    expect(review).toContain('recordState === "pending" || localizedRecords.length');
    expect(review).toContain("data-aw10-pr-post-save-only");
    expect(recordsClient).toContain("verified-records");
    expect(recordsClient).toContain("Personal records are unavailable");
    expect(recordsClient).toContain("if (!refreshResponse.ok)");
    expect(recordsClient).not.toContain(".catch(() => undefined)");
  });

  it("links terminal completion to canonical Workout History detail", () => {
    expect(review).toContain("/workout-history/${encodeURIComponent(sessionId)}");
    expect(review).toContain('tr("completion.viewDetails")');
    expect(review).toContain('tr("completion.backToToday")');
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
      core.indexOf("async function togglePause")
    );
    expect(cancel).toContain("await store.cancelSession()");
    expect(cancel.indexOf("setLaunchRevision"))
      .toBeGreaterThan(cancel.indexOf("await store.cancelSession()"));
  });

  it("exposes destructive current-session Cancel only through a confirmation and the store", () => {
    expect(core).toContain("data-aw10-cancel-confirmation");
    expect(core).toContain('tr("minimized.cancelWorkout")');
    const cancel = core.slice(
      core.indexOf("async function cancelCurrentSession"),
      core.indexOf("async function takeOverWorkout")
    );
    expect(cancel).toContain("await store.cancelSession()");
    expect(cancel).toContain("clearActiveWorkoutState(userId)");
    expect(cancel.indexOf("clearActiveWorkoutState(userId)"))
      .toBeGreaterThan(cancel.indexOf("await store.cancelSession()"));
  });
});
