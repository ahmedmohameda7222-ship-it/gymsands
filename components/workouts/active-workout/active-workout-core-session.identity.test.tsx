// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkoutPlanDaySession } from "@/types";

const startDaySession = vi.fn();
const hydrate = vi.fn();
const getSnapshot = vi.fn();
const dispatch = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" } })
}));
vi.mock("@/components/feedback/success-feedback", () => ({
  useSuccessFeedback: () => ({ celebrate: vi.fn() })
}));
vi.mock("@/components/ui/toaster", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/workouts/active-workout/active-workout-execution-shell", () => ({
  ActiveWorkoutExecutionShell: () => <div data-test-shell />
}));
vi.mock("@/components/workouts/active-workout/active-workout-details-bridge", () => ({
  ActiveWorkoutDetailsBridge: () => null
}));
vi.mock("@/components/workouts/active-workout/active-workout-review-bridge", () => ({
  ActiveWorkoutReviewBridge: () => null
}));
vi.mock("@/lib/i18n/active-workout", () => ({
  isolateBidiText: (value: string) => value,
  useActiveWorkoutTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    direction: "ltr",
    formatters: {
      integer: (value: number) => String(value),
      decimal: (value: number) => String(value),
      ratio: (left: number, right: number) => `${left}/${right}`,
      timer: (value: number) => String(value),
      measurement: (value: number, unit: string) => `${value} ${unit}`
    }
  })
}));
vi.mock("@/lib/i18n/train", () => ({ translateTrain: (_locale: string, key: string) => key }));
vi.mock("@/lib/active-workout", () => ({
  activeWorkoutCacheFromExecution: () => ({}),
  clearActiveWorkoutState: vi.fn(),
  isValidActiveWorkoutRoute: () => true,
  readActiveWorkoutState: () => null,
  writeActiveWorkoutState: vi.fn()
}));
vi.mock("@/lib/fixtures/mock-auth", () => ({ isMockAuthUserId: () => false }));
vi.mock("@/lib/workouts/active-workout-device", () => ({
  getActiveWorkoutDeviceId: () => "device-1"
}));
vi.mock("@/lib/workouts/active-session-store/clock", () => ({
  activeSessionClock: { getSnapshot: () => Date.now(), subscribe: () => () => undefined }
}));
vi.mock("@/lib/workouts/active-session-store/store", () => ({
  getActiveSessionStore: () => ({
    hydrate,
    getSnapshot,
    dispatch,
    saveCanonicalSets: vi.fn(),
    completeCanonicalSet: vi.fn(),
    completeSession: vi.fn(),
    skipExercise: vi.fn(),
    replaceExercise: vi.fn()
  })
}));
vi.mock("@/services/database/active-session-persistence-adapter", () => ({
  activeSessionPersistenceAdapter: {}
}));
vi.mock("@/services/database/direct-workout-sessions", () => ({
  getOrStartWorkoutSession: vi.fn()
}));
vi.mock("@/services/database/execution-layer", () => ({
  createExerciseAlternative: vi.fn(),
  getExerciseAlternatives: () => Promise.resolve([]),
  getProgressionTargets: () => Promise.resolve([])
}));
vi.mock("@/services/database/workout-set-autosave", () => ({
  mountWorkoutSetAutosaveCoordinator: () => () => undefined
}));
vi.mock("@/services/database/workout-sessions", () => ({
  getOrStartWorkoutDaySession: (...args: unknown[]) => startDaySession(...args),
  getWorkoutHistoryDetailed: () => Promise.resolve([])
}));

import { ActiveWorkoutCoreSession } from "./active-workout-core-session";

function day(id: string): WorkoutPlanDaySession {
  return {
    id,
    plan_id: "plan-1",
    day_number: 1,
    day_name: "Strength A",
    weekday: "monday",
    notes: null,
    plan: null,
    exercises: [{
      id: `exercise-${id}`,
      plan_day_id: id,
      workout_id: null,
      source_workout_id: null,
      exercise_name: "Bench Press",
      category: "strength",
      target_muscle: "chest",
      equipment: "barbell",
      sets: 1,
      reps: "8",
      rest_seconds: 60,
      instructions: null,
      exercise_url: null,
      video_url: null,
      custom_video_url: null,
      sort_order: 1,
      notes: null
    }]
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ActiveWorkoutCoreSession primitive bootstrap identity", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    startDaySession.mockReset();
    hydrate.mockReset();
    getSnapshot.mockReset();
    dispatch.mockReset();

    startDaySession.mockImplementation(async (_userId: string, currentDay: WorkoutPlanDaySession) => ({
      id: `session-${currentDay.id}`,
      user_id: "user-1",
      workout_id: null,
      plan_id: "plan-1",
      plan_day_id: currentDay.id,
      workout_name: currentDay.day_name,
      workout_day_name: currentDay.day_name,
      workout_category: "strength",
      started_at: "2026-07-27T08:00:00.000Z",
      completed_at: null,
      skipped_at: null,
      duration_minutes: null,
      notes: null,
      status: "started"
    }));
    hydrate.mockResolvedValue(undefined);
    getSnapshot.mockImplementation(() => ({
      root: { status: "started" },
      executionState: {
        workout_session_id: "session-day-1",
        user_id: "user-1",
        session_state: "active",
        view_state: "set_entry",
        active_snapshot_item_id: "item-1",
        active_item_order: 1,
        active_set_number: 1,
        controller_device_id: "device-1",
        elapsed_active_seconds: 0,
        active_run_started_at: "2026-07-27T08:00:00.000Z",
        rest_duration_seconds: null,
        rest_ends_at: null,
        revision: 1
      },
      prescription: [{
        id: "item-1",
        snapshotId: "snapshot-1",
        workoutSessionId: "session-day-1",
        userId: "user-1",
        itemOrder: 1,
        sourcePlanExerciseId: "exercise-day-1",
        sourcePlanActivityId: null,
        activityName: "Bench Press",
        rawCompatibilityPrescription: {},
        plannedSets: 1,
        executionState: "planned",
        normalizationStatus: "partial",
        prescriptionSets: [{
          id: "set-1",
          snapshotItemId: "item-1",
          snapshotId: "snapshot-1",
          workoutSessionId: "session-day-1",
          userId: "user-1",
          setOrder: 1,
          performedOrderHint: null,
          setType: "working",
          targetMode: "custom",
          sideMode: "none",
          restSeconds: 60,
          tempoTarget: null,
          schemaVersion: 1,
          createdAt: "2026-07-27T08:00:00.000Z",
          targets: []
        }]
      }],
      performedLogs: []
    }));
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("does not restart or rehydrate for equivalent wrappers, but does for a new source ID", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{ kind: "plan-day", day: day("day-1") }} />);
    });
    await flushEffects();
    expect(startDaySession).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{ kind: "plan-day", day: day("day-1") }} />);
    });
    await flushEffects();
    expect(startDaySession).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{ kind: "plan-day", day: day("day-2") }} />);
    });
    await flushEffects();
    expect(startDaySession).toHaveBeenCalledTimes(2);
    expect(hydrate).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});
