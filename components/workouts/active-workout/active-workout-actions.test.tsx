import { describe, expect, it } from "vitest";

import {
  buildActiveWorkoutExerciseActions,
  buildActiveWorkoutQuickActions,
  projectActiveWorkoutQuickActions,
  type ActiveWorkoutExerciseActionInput,
  type ActiveWorkoutQuickActionInput
} from "./active-workout-actions";

const exerciseLabels = {
  "replace-today": "Replace Today",
  "skip-today": "Skip Today",
  "ask-chatgpt": "Ask ChatGPT"
} as const;

function exerciseInput(
  patch: Partial<ActiveWorkoutExerciseActionInput> = {}
): ActiveWorkoutExerciseActionInput {
  return {
    sourceKind: "plan-day",
    busy: false,
    paused: false,
    terminal: false,
    aiPermitted: true,
    labels: exerciseLabels,
    ...patch
  };
}

const legacyLabels = {
  "previous-set": "Previous set",
  "set-details": "Set details",
  "replace-today": "Replace today",
  "skip-today": "Skip today",
  "ask-plaivra": "Ask Plaivra"
} as const;

function legacyInput(
  patch: Partial<ActiveWorkoutQuickActionInput> = {}
): ActiveWorkoutQuickActionInput {
  return {
    sourceKind: "plan-day",
    busy: false,
    paused: false,
    activeSetCompleted: false,
    terminal: false,
    aiPermitted: true,
    labels: legacyLabels,
    ...patch
  };
}

describe("Active Workout exercise overflow authority", () => {
  it("contains exactly Replace Today, Skip Today, and Ask ChatGPT in binding order", () => {
    const visible = buildActiveWorkoutExerciseActions(exerciseInput())
      .filter((action) => action.visible);

    expect(visible.map((action) => action.id)).toEqual([
      "replace-today",
      "skip-today",
      "ask-chatgpt"
    ]);
    expect(visible.map((action) => action.label)).toEqual([
      "Replace Today",
      "Skip Today",
      "Ask ChatGPT"
    ]);
    expect(visible.map((action) => action.id)).not.toEqual(expect.arrayContaining([
      "previous-set",
      "set-details",
      "guide-video"
    ]));
  });

  it("keeps replacement and skip out of direct sessions while retaining Ask ChatGPT", () => {
    const visible = buildActiveWorkoutExerciseActions(exerciseInput({ sourceKind: "direct" }))
      .filter((action) => action.visible)
      .map((action) => action.id);

    expect(visible).toEqual(["ask-chatgpt"]);
  });

  it("disables exercise mutations while busy or paused without disabling assistance", () => {
    for (const state of [{ busy: true }, { paused: true }]) {
      const actions = buildActiveWorkoutExerciseActions(exerciseInput(state));
      expect(actions.find((action) => action.id === "replace-today")?.disabled).toBe(true);
      expect(actions.find((action) => action.id === "skip-today")?.disabled).toBe(true);
      expect(actions.find((action) => action.id === "ask-chatgpt")?.disabled).toBe(false);
    }
  });

  it("exposes no exercise overflow actions after terminal completion", () => {
    expect(buildActiveWorkoutExerciseActions(exerciseInput({ terminal: true }))
      .filter((action) => action.visible)).toEqual([]);
  });
});

describe("bounded Active Workout contextual action projection", () => {
  it("excludes canonical Exercise Detail content from the in-workout action projection", () => {
    const visible = buildActiveWorkoutQuickActions(legacyInput()).filter((action) => action.visible);
    expect(visible.map((action) => action.id)).toEqual([
      "previous-set",
      "set-details",
      "replace-today",
      "skip-today",
      "ask-plaivra"
    ]);
    expect(visible.map((action) => action.id)).not.toContain("guide-video");
  });

  it("keeps the mobile projection focused on Previous Performance and Set Details", () => {
    const actions = buildActiveWorkoutQuickActions(legacyInput());
    expect(projectActiveWorkoutQuickActions(actions, "mobile").map((action) => action.id))
      .toEqual(["previous-set", "set-details"]);
  });
});
