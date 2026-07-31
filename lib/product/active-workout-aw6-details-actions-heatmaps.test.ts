import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const core = source("components/workouts/active-workout/active-workout-core-session-implementation.tsx");
const shell = source("components/workouts/active-workout/active-workout-execution-shell.tsx");
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
const aw5CorrectionQa = source("scripts/run-aw5-correction-layout-qa.mjs");
const trainLayoutQa = source("scripts/run-train-layout-qa-base.mjs");

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

  it("replaces the placeholder with a compact dual-view map and no compact labels or state card", () => {
    expect(shell).not.toContain("PersonStanding");
    expect(shell).toContain("data-aw5-mini-heat-map-slot");
    expect(mini).toContain('mode="compact"');
    expect(mini).toContain('view="both"');
    expect(mini).toContain("showViewLabels={false}");
    expect(mini).toContain("showStateMessage={false}");
    expect(mini).toContain("onOpen(event.currentTarget)");
  });

  it("keeps the binding Details order and one responsive surface", () => {
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

  it("opens the approved sections without URL state or dialog stacking", () => {
    expect(core).toContain('openDetails("muscle-load", trigger)');
    expect(core).toContain('openDetails("overview", trigger)');
    expect(core).toContain('action.destination ?? "overview"');
    expect(core).toContain('action.id === "guide-video" ? "guide-video" : null');
    expect(core).not.toMatch(/searchParams|URLSearchParams/);
    expect(core).toContain("window.setTimeout(() => setReplacementPickerOpen(true), 0)");
    expect(details).toContain("onBeforeOpen={closeBeforeAi}");
  });

  it("preserves one visible canonical Details trigger per responsive layout", () => {
    expect(shell.match(/data-active-set-details-trigger/g)).toHaveLength(2);
    expect(shell).toContain('className="mt-3 grid grid-cols-3 gap-2 lg:hidden"');
    expect(shell).toContain(
      'data-active-set-details-trigger={\n                    action.id === "set-details" ? true : undefined'
    );
    expect(shell).toContain("data-aw6-desktop-quick-actions");
    expect(shell).toContain(
      "onClick={(event) => onQuickAction(action, event.currentTarget)}"
    );
    expect(core).toContain("setDetailsTriggerRef.current = trigger");
    expect(core).toContain('action.destination ?? "overview"');
    expect(aw5CorrectionQa).toContain(
      'locator("[data-active-set-details-trigger]:visible")'
    );
    expect(aw5CorrectionQa).toContain(
      'feedbackText: document.querySelector("[data-aw5-feedback]")'
    );
    expect(aw5CorrectionQa).toContain(
      'locator("[data-aw5-rest-presets]:visible")'
    );
    expect(trainLayoutQa).toContain(
      '...document.querySelectorAll("[data-active-set-details-trigger]")'
    );
    expect(trainLayoutQa).toContain("].filter(visible).length");
    expect(shell.match(/data-aw5-rest-presets/g)).toHaveLength(2);
    expect(shell).toContain(
      'data-aw5-rest-presets className="mt-3 grid grid-cols-4 gap-2 lg:hidden"'
    );
    expect(shell).toContain('<MobileStickyActionsSpacer placement="session" />');
  });

  it("refreshes only after acknowledged persisted mutations, not local drafts", () => {
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
    expect(core.slice(canonicalCompletion, canonicalCompletion + 2200))
      .toContain("bumpMuscleLoadRefreshRevision()");
  });

  it("keeps plan-day replacement and skip out of direct sessions", () => {
    expect(core).toContain('sourceKind !== "plan-day"');
    expect(details).toContain('sourceKind === "plan-day"');
    expect(details).toContain("ExercisePickerDialog");
    expect(details).toContain("onSkipExercise");
    expect(shell).toContain("mobileQuickActions");
    expect(shell).toContain("desktopQuickActions");
  });

  it("adds complete EN DE AR member-facing copy without fallback English", () => {
    for (const locale of ["en", "de", "ar"]) {
      const messages = JSON.parse(source(`messages/${locale}.json`)) as {
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
      for (const key of [
        "guideVideo",
        "skipToday",
        "askPlaivra",
        "chooseReplacement"
      ]) expect(messages.ActiveWorkout.actions[key]?.trim()).not.toBe("");
      expect(messages.ActiveWorkout.heatMap.currentSessionMuscleLoad?.trim())
        .not.toBe("");
    }
  });
});
