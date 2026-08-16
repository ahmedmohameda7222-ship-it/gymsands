import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const core = source("components/workouts/active-workout/active-workout-core-session-implementation.tsx");
const shell = source("components/workouts/active-workout/active-workout-execution-shell.tsx");
const actions = source("components/workouts/active-workout/active-workout-actions.ts");
const controller = source(
  "components/workouts/active-workout/active-workout-muscle-load-controller.ts"
);
const mini = source(
  "components/workouts/active-workout/active-workout-mini-heat-map.tsx"
);
const details = source(
  "components/workouts/active-workout/active-workout-details-bridge.tsx"
);
const fullMap = source(
  "components/workouts/active-workout/active-workout-muscle-load-section.tsx"
);
const sessionPanel = source("components/workouts/session-muscle-load-panel.tsx");

describe("AW-6 Details, Actions, and Heat Maps source contract", () => {
  it("uses one active-session request owner for mini and full consumers", () => {
    expect(core).toContain("useActiveWorkoutMuscleLoad");
    expect(core).toContain("muscleLoadController={muscleLoadController}");
    expect(core).toContain("controller={muscleLoadController}");
    expect(mini).not.toContain("fetch(");
    expect(fullMap).not.toContain("fetch(");
    expect(details).not.toContain("fetch(");
    expect(sessionPanel).toContain("useActiveWorkoutMuscleLoad");
    expect(controller).toContain("cache: \"no-store\"");
    expect(controller).toContain("abortRef.current?.abort()");
    expect(controller).toContain("generation !== requestGenerationRef.current");
  });

  it("keeps the compact dual-view mini heat map without compact labels or a state card", () => {
    expect(shell).not.toContain("PersonStanding");
    expect(shell).toContain("data-aw5-mini-heat-map-slot");
    expect(mini).toContain('mode="compact"');
    expect(mini).toContain('view="both"');
    expect(mini).toContain("showViewLabels={false}");
    expect(mini).toContain("showStateMessage={false}");
    expect(mini).toContain("onOpen(event.currentTarget)");
  });

  it("keeps one responsive Details surface with the approved section order", () => {
    const order = [
      "data-aw6-details-overview",
      "data-aw6-details-current-set",
      "data-aw6-details-muscle-load",
      "data-aw6-details-adjust-today",
      "data-aw6-details-assistance"
    ].map((token) => details.indexOf(token));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(details.match(/<Dialog open=/g)).toHaveLength(1);
    expect(details).toContain('layout="responsive-drawer"');
    expect(details).toContain("onCloseAutoFocus");
    expect(details).toContain("returnFocusRef.current?.focus()");
    expect(details).toContain("requested?.scrollIntoView");
  });

  it("separates Exercise Details, Set Details, and Exercise Actions", () => {
    expect(shell.match(/data-active-set-details-trigger/g)).toHaveLength(1);
    expect(shell).toContain("data-aw10-exercise-details-trigger");
    expect(shell).toContain("data-aw10-exercise-actions");
    expect(shell).toContain("data-aw10-session-menu");
    expect(core).toContain("setDetailsTriggerRef.current = trigger");
    expect(core).toContain('openDetails("overview", trigger)');
    expect(core).toContain('action.destination ?? "overview"');
    expect(actions).toContain("buildActiveWorkoutExerciseActions");
    expect(actions).toContain('"replace-today"');
    expect(actions).toContain('"skip-today"');
    expect(actions).toContain('"ask-chatgpt"');
  });

  it("limits Set Details to RPE, RIR, Set Type, and Set Note", () => {
    const section = details.slice(
      details.indexOf("data-aw10-set-details-exact"),
      details.indexOf("data-aw6-details-muscle-load")
    );
    expect(section).toContain('htmlFor="active-set-rpe"');
    expect(section).toContain('htmlFor="active-set-rir"');
    expect(section).toContain('htmlFor="active-set-type"');
    expect(section).toContain('htmlFor="active-set-note"');
    expect(section).not.toContain("onRestartSet");
    expect(section).not.toContain("onResetTimer");
    expect(section).not.toContain("ExercisePickerDialog");
    expect(section).not.toContain("AiActionRequestDialog");
    expect(section).not.toContain("ActiveWorkoutMuscleLoadSection");
  });

  it("opens approved sections without URL state or dialog stacking", () => {
    expect(core).toContain('openDetails("muscle-load", trigger)');
    expect(core).toContain('openDetails("overview", trigger)');
    expect(core).toContain('action.destination ?? "overview"');
    expect(core).toContain('action.id === "guide-video" ? "guide-video" : null');
    expect(core).not.toMatch(/searchParams|URLSearchParams/);
    expect(core).toContain("window.setTimeout(() => setReplacementPickerOpen(true), 0)");
    expect(details).toContain("onBeforeOpen={closeBeforeAi}");
  });

  it("keeps rest and sticky geometry compatible with the execution-first shell", () => {
    expect(shell.match(/data-aw5-rest-presets/g)).toHaveLength(1);
    expect(shell).toContain("data-aw10-rest-state");
    expect(shell).toContain("data-aw10-paused-state");
    expect(shell).toContain("MobileStickyActionsSpacer");
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(shell).toContain("data-aw5-primary-action");
  });

  it("refreshes muscle analysis only after acknowledged persisted mutations, not local drafts", () => {
    const updateSet = core.slice(
      core.indexOf("function updateSet("),
      core.indexOf("function statesWithSetPatch(")
    );
    expect(updateSet).not.toContain("bumpMuscleLoadRefreshRevision");
    for (const successAnchor of [
      "await persistProgress(nextStates);",
      "await store.skipExercise(snapshotItemId",
      "await store.replaceExercise({"
    ]) {
      const anchor = core.indexOf(successAnchor);
      expect(anchor).toBeGreaterThan(-1);
      expect(core.slice(anchor, anchor + 1800)).toContain(
        "bumpMuscleLoadRefreshRevision()"
      );
    }
    const canonicalCompletion = core.indexOf("await store.completeCanonicalSet");
    expect(core.slice(canonicalCompletion, canonicalCompletion + 2600))
      .toContain("bumpMuscleLoadRefreshRevision()");
  });

  it("keeps plan-day replacement and skip out of direct sessions", () => {
    expect(core).toContain('sourceKind !== "plan-day"');
    expect(details).toContain('sourceKind === "plan-day"');
    expect(details).toContain("ExercisePickerDialog");
    expect(details).toContain("onSkipExercise");
    expect(actions).toContain('sourceKind === "plan-day"');
  });

  it("uses ChatGPT-branded member-facing assistance in EN DE AR", () => {
    expect(core).toContain('"ask-plaivra": tr("chatGPT.ask")');
    expect(details).toContain('tr("chatGPT.ask")');
    expect(details).not.toContain('tr("actions.askPlaivra")');
    for (const locale of ["en", "de", "ar"]) {
      const raw = source(`messages/${locale}.json`);
      const messages = JSON.parse(raw) as {
        ActiveWorkout: {
          details: Record<string, string>;
          actions: Record<string, string>;
          heatMap: Record<string, string>;
        };
      };
      for (const key of [
        "activeWorkoutDetails",
        "exerciseOverview",
        "currentSet",
        "muscleLoad",
        "adjustToday",
        "assistance"
      ]) expect(messages.ActiveWorkout.details[key]?.trim()).not.toBe("");
      for (const key of ["guideVideo", "skipToday", "chooseReplacement"]) {
        expect(messages.ActiveWorkout.actions[key]?.trim()).not.toBe("");
      }
      expect(messages.ActiveWorkout.heatMap.currentSessionMuscleLoad?.trim()).not.toBe("");
      expect(raw).toContain("ChatGPT");
    }
  });
});
