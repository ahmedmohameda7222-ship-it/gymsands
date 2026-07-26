import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  activeWorkoutNumber,
  activeWorkoutProgress,
  activeWorkoutSetIsCompletable,
  type ActiveWorkoutCoreSet
} from "./active-workout-ui-model";

const source = (path: string) => readFileSync(path, "utf8");

function set(overrides: Partial<ActiveWorkoutCoreSet> = {}): ActiveWorkoutCoreSet {
  return {
    setNumber: 1,
    reps: "8",
    weightKg: "60",
    notes: "",
    rpe: "",
    rir: "",
    setType: "working",
    sideMode: "none",
    plannedTempo: null,
    performedTempo: null,
    tempoAdherence: "not_recorded",
    detailSource: "manual",
    detailSourceProvider: "plaivra",
    detailSourceVersion: "aw5-v1",
    completedAt: null,
    prescriptionSet: null,
    hasPersistedDetails: false,
    ...overrides
  };
}

describe("AW-5 Active Workout UI core", () => {
  it("projects bounded progress and validates the current set without coercing empty values", () => {
    expect(activeWorkoutProgress(3, 10)).toBe(0.3);
    expect(activeWorkoutProgress(12, 10)).toBe(1);
    expect(activeWorkoutProgress(2, 0)).toBe(0);
    expect(activeWorkoutNumber(" ")).toBeNull();
    expect(activeWorkoutNumber("12.5")).toBe(12.5);
    expect(activeWorkoutSetIsCompletable(set())).toBe(true);
    expect(activeWorkoutSetIsCompletable(set({ reps: "0" }))).toBe(false);
    expect(activeWorkoutSetIsCompletable(set({ weightKg: "" }))).toBe(false);
    expect(activeWorkoutSetIsCompletable(set({ completedAt: "2026-07-26T00:00:00.000Z" }))).toBe(false);
  });

  it("routes plan-day and direct execution through one shared AW-5 shell while preserving bounded legacy bridges", () => {
    const dayRoute = source("app/(private)/workouts/session/day/[dayId]/page.tsx");
    const directRoute = source("app/(private)/workouts/session/[id]/page.tsx");
    for (const route of [dayRoute, directRoute]) {
      expect(route).toContain("<ActiveWorkoutCoreSession");
      expect(route).toContain("data-aw5-legacy-bridge");
      expect(route).toContain("onOpenLegacySurface");
    }
    expect(dayRoute).toContain("<WorkoutDayFocusSession day={day}");
    expect(directRoute).toContain("<WorkoutSessionForm workout={workout}");
  });

  it("keeps every AW-5 mutation on the AW-4 store, reducer, dispatcher and clock", () => {
    const controller = source("components/workouts/active-workout/active-workout-core-session.tsx");
    expect(controller).toContain("getActiveSessionStore");
    expect(controller).toContain("activeSessionClock");
    expect(controller).toContain("planSessionAfterSetCompletion");
    expect(controller).toContain("completeCanonicalSet");
    expect(controller).toContain("store.saveCanonicalSets");
    expect(controller).toContain('commandType: "complete_set_transition"');
    expect(controller).toContain('isPaused ? "resume" : "pause"');
    expect(controller).toContain('dispatchSimple("start_rest"');
    expect(controller).not.toContain("window.setInterval");
    expect(controller).not.toContain("createWorkoutSessionExecutionWriteQueue");
  });

  it("renders the approved compact hierarchy and excludes rejected primary-surface patterns", () => {
    const shell = source("components/workouts/active-workout/active-workout-execution-shell.tsx");
    expect(shell).toContain("data-aw5-execution-shell");
    expect(shell).toContain("data-aw5-mini-heat-map-slot");
    expect(shell).toContain("<MobileStickyActions allowOnSession");
    expect(shell).toContain('id="active-set-reps"');
    expect(shell).toContain('id="active-set-weight"');
    expect(shell).toContain("onCloseAutoFocus");
    expect(shell).not.toContain("SessionMuscleLoadPanel");
    expect(shell).not.toContain("exerciseStates.map");
    expect(shell).not.toContain('t("common.saving")');
  });

  it("preserves advanced-set hydration, provenance conversion and close-triggered autosave", () => {
    const controller = source("components/workouts/active-workout/active-workout-core-session.tsx");
    expect(controller).toContain("editableWorkoutSetProvenance");
    expect(controller).toContain("saveActiveSetDetails");
    expect(controller).toContain("if (!open) void saveActiveSetDetails()");
    expect(controller).toContain('sourceProvider: provenance.sourceProvider');
    expect(controller).toContain('sourceVersion: provenance.sourceVersion');
    for (const id of ["active-set-rpe", "active-set-rir", "active-set-type", "active-set-note"]) {
      expect(controller).toContain(`id="${id}"`);
    }
  });
});
