import { describe, expect, it } from "vitest";

import {
  buildActiveWorkoutQuickActions,
  projectActiveWorkoutQuickActions,
  type ActiveWorkoutQuickActionInput
} from "./active-workout-actions";

const labels = {
  "previous-set": "Previous set",
  "set-details": "Set details",
  "guide-video": "Guide / video",
  "replace-today": "Replace today",
  "skip-today": "Skip today",
  "ask-plaivra": "Ask Plaivra"
} as const;

function input(
  patch: Partial<ActiveWorkoutQuickActionInput> = {}
): ActiveWorkoutQuickActionInput {
  return {
    sourceKind: "plan-day",
    hasGuideOrVideo: true,
    busy: false,
    paused: false,
    activeSetCompleted: false,
    terminal: false,
    aiPermitted: true,
    labels,
    ...patch
  };
}

describe("AW-6 contextual quick actions", () => {
  it("projects the approved plan-day actions and destinations", () => {
    const visible = buildActiveWorkoutQuickActions(input()).filter((action) => action.visible);
    expect(visible.map((action) => action.id)).toEqual([
      "previous-set",
      "guide-video",
      "set-details",
      "replace-today",
      "skip-today",
      "ask-plaivra"
    ]);
    expect(visible.find((action) => action.id === "replace-today")?.destination)
      .toBe("adjust-today");
    expect(visible.find((action) => action.id === "set-details")?.destination)
      .toBe("current-set");
  });

  it("keeps replacement and skip out of direct sessions", () => {
    const visible = buildActiveWorkoutQuickActions(input({ sourceKind: "direct" }))
      .filter((action) => action.visible)
      .map((action) => action.id);
    expect(visible).not.toContain("replace-today");
    expect(visible).not.toContain("skip-today");
    expect(visible).toContain("previous-set");
    expect(visible).toContain("set-details");
  });

  it("falls back from guide/video to set details on mobile", () => {
    const actions = buildActiveWorkoutQuickActions(input({ hasGuideOrVideo: false }));
    expect(projectActiveWorkoutQuickActions(actions, "mobile").map((action) => action.id))
      .toEqual(["previous-set", "set-details"]);
  });

  it("disables relevant mutations while an authoritative mutation is busy", () => {
    const actions = buildActiveWorkoutQuickActions(input({ busy: true }));
    for (const id of ["previous-set", "replace-today", "skip-today"] as const) {
      expect(actions.find((action) => action.id === id)?.disabled).toBe(true);
    }
    expect(actions.find((action) => action.id === "set-details")?.disabled).toBe(false);
  });

  it("keeps mobile compact and exposes every available desktop action once", () => {
    const actions = buildActiveWorkoutQuickActions(input());
    expect(projectActiveWorkoutQuickActions(actions, "mobile").map((action) => action.id))
      .toEqual(["previous-set", "guide-video"]);
    expect(projectActiveWorkoutQuickActions(actions, "desktop").map((action) => action.id))
      .toEqual([
        "previous-set",
        "guide-video",
        "set-details",
        "replace-today",
        "skip-today",
        "ask-plaivra"
      ]);
  });
});
