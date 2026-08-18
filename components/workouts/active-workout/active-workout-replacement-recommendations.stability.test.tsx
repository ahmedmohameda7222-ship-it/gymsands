// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";
import type { ReplacementExerciseProfile } from "@/services/workouts/active-workout/replacement-ranking";
import type { ExerciseAlternativeReason, UserExerciseAlternative } from "@/types";

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
}));

vi.mock(
  "@/services/workouts/active-workout/replacement-recommendations-client",
  () => ({
    getActiveWorkoutReplacementRecommendations: mocks.getRecommendations,
  }),
);

import { ActiveWorkoutReplacementRecommendations } from "./active-workout-replacement-recommendations";

const userId = "11111111-1111-4111-8111-111111111111";
const originalId = "22222222-2222-4222-8222-222222222222";
const savedAlternativeId = "33333333-3333-4333-8333-333333333333";
const sessionExerciseId = "44444444-4444-4444-8444-444444444444";
const addedSessionExerciseId = "55555555-5555-4555-8555-555555555555";

const tr = ((key: string) => key) as unknown as ActiveWorkoutTranslator;

function originalProfile(): ReplacementExerciseProfile {
  return {
    id: originalId,
    name: "Barbell Bench Press",
    targetMuscle: "chest",
    equipment: "barbell",
    difficulty: "intermediate",
    mechanics: "compound",
    forceType: "push",
    movementPattern: "horizontal_press",
    secondaryMuscles: ["triceps", "front delts"],
    catalogDegraded: false,
  };
}

function savedAlternative(
  alternativeExerciseName = "Dumbbell Bench Press",
): UserExerciseAlternative {
  return {
    id: savedAlternativeId,
    user_id: userId,
    plan_exercise_id: "plan-exercise-1",
    original_exercise_name: "Barbell Bench Press",
    alternative_exercise_name: alternativeExerciseName,
    reason: "machine_taken",
    created_at: "2026-08-18T08:00:00.000Z",
    updated_at: "2026-08-18T08:00:00.000Z",
  } as unknown as UserExerciseAlternative;
}

type RenderInput = {
  original?: ReplacementExerciseProfile;
  reason?: ExerciseAlternativeReason;
  savedAlternatives?: readonly UserExerciseAlternative[];
  sessionExerciseIds?: ReadonlySet<string>;
  busy?: boolean;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderRecommendations(input: RenderInput = {}) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const original = input.original ?? originalProfile();
  const reason = input.reason ?? "machine_taken";
  const savedAlternatives = input.savedAlternatives ?? [savedAlternative()];
  const sessionExerciseIds = input.sessionExerciseIds ?? new Set([sessionExerciseId]);

  await act(async () => {
    root!.render(
      <ActiveWorkoutReplacementRecommendations
        userId={userId}
        original={original}
        reason={reason}
        onReasonChange={() => undefined}
        locale="en-US"
        savedAlternatives={savedAlternatives}
        sessionExerciseIds={sessionExerciseIds}
        busy={input.busy ?? false}
        onReplace={() => undefined}
        onBrowseAll={() => undefined}
        tr={tr}
      />,
    );
  });
  await flushEffects();
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.getRecommendations.mockReset().mockResolvedValue({
    recommendations: [],
    source: "catalog",
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("Active Workout replacement recommendation request stability", () => {
  it("refetches only when recommendation semantics change", async () => {
    await renderRecommendations();
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(1);

    await renderRecommendations({
      original: originalProfile(),
      savedAlternatives: [savedAlternative()],
      sessionExerciseIds: new Set([sessionExerciseId]),
    });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(1);

    await renderRecommendations({
      original: originalProfile(),
      savedAlternatives: [savedAlternative()],
      sessionExerciseIds: new Set([sessionExerciseId]),
      busy: true,
    });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(1);

    await renderRecommendations({
      original: originalProfile(),
      reason: "no_equipment",
      savedAlternatives: [savedAlternative()],
      sessionExerciseIds: new Set([sessionExerciseId]),
      busy: true,
    });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(2);

    await renderRecommendations({
      original: originalProfile(),
      reason: "no_equipment",
      savedAlternatives: [savedAlternative("Cable Chest Press")],
      sessionExerciseIds: new Set([sessionExerciseId]),
      busy: true,
    });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(3);

    await renderRecommendations({
      original: originalProfile(),
      reason: "no_equipment",
      savedAlternatives: [savedAlternative("Cable Chest Press")],
      sessionExerciseIds: new Set([sessionExerciseId, addedSessionExerciseId]),
      busy: true,
    });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(4);
  });

  it("aborts a stale request when a real semantic input changes", async () => {
    let resolveFirst!: (value: { recommendations: never[]; source: "catalog" }) => void;
    const firstRequest = new Promise<{ recommendations: never[]; source: "catalog" }>((resolve) => {
      resolveFirst = resolve;
    });
    mocks.getRecommendations
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValue({ recommendations: [], source: "catalog" });

    await renderRecommendations();
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(1);
    const firstSignal = mocks.getRecommendations.mock.calls[0]?.[0]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    await renderRecommendations({ reason: "too_hard" });
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(2);
    expect(firstSignal.aborted).toBe(true);

    resolveFirst({ recommendations: [], source: "catalog" });
    await flushEffects();
  });
});
