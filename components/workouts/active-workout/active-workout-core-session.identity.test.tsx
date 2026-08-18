// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkoutPlanDaySession } from "@/types";

const {
  startDaySession,
  startDirectSession,
  hydrate,
  getSnapshot,
  dispatch,
  completeSession,
  getOpenSession,
  routerPush,
  clearStoredValue,
  runtimePresentation
} = vi.hoisted(() => ({
  startDaySession: vi.fn(),
  startDirectSession: vi.fn(),
  hydrate: vi.fn(),
  getSnapshot: vi.fn(),
  dispatch: vi.fn(),
  completeSession: vi.fn(),
  getOpenSession: vi.fn(),
  routerPush: vi.fn(),
  clearStoredValue: vi.fn(),
  runtimePresentation: {
    toast: vi.fn(),
    tr: ((key: string) => `first:${key}`) as (key: string) => string
  }
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush, back: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" } })
}));
vi.mock("@/components/feedback/success-feedback", () => ({
  useSuccessFeedback: () => ({ celebrate: vi.fn() })
}));
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: runtimePresentation.toast })
}));
vi.mock("@/components/workouts/active-workout/active-workout-execution-shell", () => ({
  ActiveWorkoutExecutionShell: (props: {
    pauseLabel: string;
    repsDraft: string;
    weightDraft: string;
    onPauseResume: () => void;
    onFinish: () => void;
    onRepsChange: (value: string) => void;
    onWeightChange: (value: string) => void;
    completionContent?: React.ReactNode;
  }) => (
    <div data-test-shell>
      <span data-test-pause-label>{props.pauseLabel}</span>
      <input
        data-test-reps
        value={props.repsDraft}
        onChange={(event) => props.onRepsChange(event.target.value)}
      />
      <input
        data-test-weight
        value={props.weightDraft}
        onChange={(event) => props.onWeightChange(event.target.value)}
      />
      <button data-test-pause type="button" onClick={props.onPauseResume}>pause</button>
      <button data-test-set-reps type="button" onClick={() => props.onRepsChange("8")}>
        set reps
      </button>
      <button data-test-set-weight type="button" onClick={() => props.onWeightChange("80")}>
        set weight
      </button>
      <button data-test-finish type="button" onClick={props.onFinish}>finish</button>
      {props.completionContent}
    </div>
  )
}));
vi.mock("@/components/workouts/active-workout/active-workout-details-bridge", () => ({
  ActiveWorkoutDetailsBridge: () => null
}));
vi.mock("@/components/workouts/active-workout/active-workout-muscle-load-controller", () => ({
  useActiveWorkoutMuscleLoad: () => ({
    result: null,
    analysis: null,
    state: "empty",
    loading: false,
    refreshing: false,
    failed: false,
    hasCachedResult: false,
    reload: vi.fn()
  })
}));
vi.mock("@/components/workouts/active-workout/active-workout-review-bridge", () => ({
  ActiveWorkoutReviewBridge: (props: {
    open: boolean;
    busy: boolean;
    onComplete: () => void;
    completedSummary: unknown;
  }) => props.completedSummary
    ? <div data-test-completed-summary />
    : props.open
      ? (
          <button
            data-test-save-finish
            type="button"
            disabled={props.busy}
            onClick={props.onComplete}
          >
            save
          </button>
        )
      : null
}));
vi.mock("@/lib/i18n/active-workout", () => ({
  isolateBidiText: (value: string) => value,
  useActiveWorkoutTranslation: () => ({
    t: runtimePresentation.tr,
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
  readPreviousActiveWorkoutRoute: () => null,
  resolveActiveWorkoutRoute: () => "/workouts/session/day/day-1",
  writeActiveWorkoutState: vi.fn()
}));
vi.mock("@/lib/error-formatting", () => ({
  userSafeError: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? String(error)
}));
vi.mock("@/lib/workout-persistence", () => ({
  clearStoredValue,
  readStoredTimestamp: () => null,
  storeTimestamp: vi.fn(),
  workoutStorageKey: (parts: string[]) => parts.join(":")
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
    subscribe: () => () => undefined,
    dispatch,
    saveCanonicalSets: vi.fn(),
    completeCanonicalSet: vi.fn(),
    completeSession,
    skipExercise: vi.fn(),
    replaceExercise: vi.fn(),
    cancelSession: vi.fn(),
    retryPendingTransport: vi.fn(),
    resolveConflict: vi.fn(),
    setSecondaryProjection: vi.fn()
  })
}));
vi.mock("@/lib/workouts/active-session-sync", () => ({
  createActiveWorkoutTabLeadership: () => ({
    tabId: "tab-1",
    isLeader: () => true,
    acquire: async () => true,
    renew: () => true,
    release: () => undefined,
    dispose: () => undefined,
    subscribe: (listener: (leader: boolean) => void) => {
      listener(true);
      return () => undefined;
    }
  })
}));
vi.mock("@/services/database/active-session-persistence-adapter", () => ({
  activeSessionPersistenceAdapter: {}
}));
vi.mock("@/services/database/active-session-realtime", () => ({
  subscribeToActiveSessionInvalidation: () => () => undefined
}));
vi.mock("@/services/database/direct-workout-sessions", () => ({
  getOrStartWorkoutSession: (...args: unknown[]) => startDirectSession(...args)
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
  getOpenWorkoutSessionWithStatus: (...args: unknown[]) => getOpenSession(...args),
  getWorkoutHistoryDetailed: () => Promise.resolve([])
}));

import { ActiveWorkoutCoreSession } from "./active-workout-core-session";

function day(id: string): WorkoutPlanDaySession {
  return {
    id,
    plan_id: "plan-1",
    day_number: 1,
    day_name: "Strength A",
    weekday: "Monday",
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T08:01:00.000Z"));
    startDaySession.mockReset();
    hydrate.mockReset();
    getSnapshot.mockReset();
    dispatch.mockReset();
    completeSession.mockReset();
    getOpenSession.mockReset();
    routerPush.mockReset();
    clearStoredValue.mockReset();
    startDirectSession.mockReset();
    runtimePresentation.toast = vi.fn();
    runtimePresentation.tr = (key: string) => `first:${key}`;

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
    dispatch.mockImplementation(async (intent) => ({
      state: getSnapshot().executionState,
      commandId: intent.commandId
    }));
    completeSession.mockResolvedValue(undefined);
    getOpenSession.mockResolvedValue({ session: null });
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
        session_elapsed_seconds: 0,
        session_running_since: "2026-07-27T08:00:00.000Z",
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
        rawCompatibilityPrescription: { reps: "8" },
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
    startDirectSession.mockImplementation(async () => ({
      id: "session-day-1",
      user_id: "user-1",
      workout_id: "workout-1",
      plan_id: null,
      plan_day_id: null,
      workout_name: "Direct workout",
      workout_day_name: null,
      workout_category: "strength",
      started_at: "2026-07-27T08:00:00.000Z",
      completed_at: null,
      skipped_at: null,
      duration_minutes: null,
      notes: null,
      status: "started"
    }));
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
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

    const firstToast = runtimePresentation.toast;
    runtimePresentation.toast = vi.fn();
    runtimePresentation.tr = (key: string) => `second:${key}`;
    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{ kind: "plan-day", day: day("day-1") }} />);
    });
    await flushEffects();
    expect(startDaySession).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-test-pause-label]")?.textContent).toBe("second:common.pause");

    dispatch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      (container.querySelector("[data-test-pause]") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(firstToast).not.toHaveBeenCalled();
    expect(runtimePresentation.toast).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{ kind: "plan-day", day: day("day-2") }} />);
    });
    await flushEffects();
    expect(startDaySession).toHaveBeenCalledTimes(2);
    expect(hydrate).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it("completes a direct session once with pending valid logs and keeps the shared terminal surface", async () => {
    let resolveCompletion: (() => void) | undefined;
    completeSession.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    }));
    const directSnapshot = getSnapshot();
    directSnapshot.performedLogs = [{
      id: "log-1",
      workout_session_id: "session-day-1",
      user_id: "user-1",
      exercise_name: "Bench Press",
      plan_exercise_id: "exercise-day-1",
      set_number: 1,
      reps: 8,
      weight_kg: 70,
      notes: null,
      set_type: "working",
      completed_at: "2026-07-27T08:00:30.000Z",
      set_details: null
    }];
    getSnapshot.mockReturnValue(directSnapshot);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{
        kind: "direct",
        workout: {
          id: "workout-1",
          name: "Direct workout",
          sets: 1,
          reps: "8",
          rest_seconds: 60
        } as never
      }} />);
    });
    await flushEffects();

    await act(async () => {
      (container.querySelector("[data-test-set-reps]") as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector("[data-test-set-weight]") as HTMLButtonElement).click();
    });
    clearStoredValue.mockClear();
    await act(async () => {
      (container.querySelector("[data-test-finish]") as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector("[data-test-save-finish]") as HTMLButtonElement).click();
    });

    expect(completeSession).toHaveBeenCalledTimes(1);
    expect(completeSession.mock.calls[0]?.[0]).toMatchObject({
      finalLogs: [expect.objectContaining({
        exerciseName: "Bench Press",
        reps: 8,
        weightKg: 80
      })]
    });
    expect(routerPush).not.toHaveBeenCalled();
    expect(clearStoredValue).not.toHaveBeenCalledWith("single-workout-session:user-1:workout-1");
    expect((container.querySelector("[data-test-save-finish]") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      getSnapshot.mockReturnValue({
        ...directSnapshot,
        root: {
          ...directSnapshot.root,
          status: "completed",
          completed_at: "2026-07-27T09:00:00.000Z"
        },
        executionState: null
      });
      resolveCompletion?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(routerPush).not.toHaveBeenCalled();
    expect(clearStoredValue).toHaveBeenCalledWith("single-workout-session:user-1:workout-1");
    expect(clearStoredValue).toHaveBeenCalledWith("single-workout-rest:user-1:workout-1");
    expect(container.querySelector("[data-test-completed-summary]")).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps direct review and timer/cache state recoverable when completion fails", async () => {
    completeSession.mockRejectedValue(new Error("completion failed"));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ActiveWorkoutCoreSession source={{
        kind: "direct",
        workout: {
          id: "workout-1",
          name: "Direct workout",
          sets: 1,
          reps: "8",
          rest_seconds: 60
        } as never
      }} />);
    });
    await flushEffects();
    clearStoredValue.mockClear();
    await act(async () => {
      (container.querySelector("[data-test-finish]") as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector("[data-test-save-finish]") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(completeSession).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    expect(clearStoredValue).not.toHaveBeenCalledWith("single-workout-session:user-1:workout-1");
    expect(container.querySelector("[data-test-save-finish]")).not.toBeNull();
    expect(container.querySelector("[data-test-completed-summary]")).toBeNull();
    expect(runtimePresentation.toast).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
