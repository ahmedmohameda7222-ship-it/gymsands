// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/types";

const mocks = vi.hoisted(() => ({
  getCustomExercise: vi.fn(),
  getWorkout: vi.fn(),
  getUserExerciseVideo: vi.fn(),
  toast: vi.fn(),
  logRecoverableError: vi.fn()
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "workout-1" }) }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/components/ui/toaster", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/workouts/workout-session-screen", () => ({ WorkoutSessionScreen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/workouts/active-workout/active-workout-entry-state", () => ({
  ActiveWorkoutEntryLoading: () => <div data-test-entry-loading />,
  ActiveWorkoutEntryError: () => <div data-test-entry-error />
}));
vi.mock("@/components/workouts/workout-session-form", () => ({
  WorkoutSessionForm: ({ workout }: { workout: Workout }) => (
    <div data-test-session data-workout-id={workout.id} data-video={workout.video_url ?? ""} data-custom-video={workout.custom_video_url ?? ""} />
  )
}));
vi.mock("@/lib/i18n/train", () => ({ useTrainTranslation: () => ({ locale: "en", tr: (key: string) => key }) }));
vi.mock("@/lib/error-formatting", () => ({
  logRecoverableError: (...args: unknown[]) => mocks.logRecoverableError(...args),
  userSafeError: (_error: unknown, fallback: string) => fallback
}));
vi.mock("@/services/database/workout-library", () => ({
  getWorkout: (...args: unknown[]) => mocks.getWorkout(...args),
  getUserExerciseVideo: (...args: unknown[]) => mocks.getUserExerciseVideo(...args)
}));
vi.mock("@/services/workouts/exercise-library-store", () => ({
  getCustomExercise: (...args: unknown[]) => mocks.getCustomExercise(...args)
}));

import WorkoutSessionPage from "./page";

function workout(): Workout {
  return {
    id: "workout-1",
    name: "Authoritative workout",
    category: "Strength",
    target_muscle: "Chest",
    equipment: "Barbell",
    difficulty: "Intermediate",
    sets: 3,
    reps: "8",
    rest_seconds: 90,
    instructions: "",
    notes: null,
    is_global: true,
    video_url: "authoritative-video.mp4"
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe("direct Active Workout entry authority", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getCustomExercise.mockResolvedValue(null);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens the core session before optional custom-video enrichment resolves, then applies real media", async () => {
    const video = deferred<{ custom_video_url: string | null } | null>();
    mocks.getWorkout.mockResolvedValue(workout());
    mocks.getUserExerciseVideo.mockReturnValue(video.promise);

    await act(async () => { root.render(<WorkoutSessionPage />); });
    await flush();

    const sessionBeforeVideo = container.querySelector<HTMLElement>("[data-test-session]");
    expect(sessionBeforeVideo).not.toBeNull();
    expect(sessionBeforeVideo?.dataset.workoutId).toBe("workout-1");
    expect(sessionBeforeVideo?.dataset.video).toBe("authoritative-video.mp4");
    expect(container.querySelector("[data-test-entry-error]")).toBeNull();

    video.resolve({ custom_video_url: "custom-video.mp4" });
    await flush();

    const enriched = container.querySelector<HTMLElement>("[data-test-session]");
    expect(enriched?.dataset.video).toBe("custom-video.mp4");
    expect(enriched?.dataset.customVideo).toBe("custom-video.mp4");
  });

  it("keeps the authoritative workout usable when optional video lookup fails", async () => {
    mocks.getWorkout.mockResolvedValue(workout());
    mocks.getUserExerciseVideo.mockRejectedValue(new Error("media unavailable"));

    await act(async () => { root.render(<WorkoutSessionPage />); });
    await flush();
    await flush();

    const session = container.querySelector<HTMLElement>("[data-test-session]");
    expect(session).not.toBeNull();
    expect(session?.dataset.workoutId).toBe("workout-1");
    expect(session?.dataset.video).toBe("authoritative-video.mp4");
    expect(container.querySelector("[data-test-entry-error]")).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.logRecoverableError).toHaveBeenCalledWith("workout-session.optional-video", expect.any(Error));
  });

  it("keeps an authoritative workout load failure blocking", async () => {
    mocks.getWorkout.mockRejectedValue(new Error("core workout unavailable"));

    await act(async () => { root.render(<WorkoutSessionPage />); });
    await flush();

    expect(container.querySelector("[data-test-session]")).toBeNull();
    expect(container.querySelector("[data-test-entry-error]")).not.toBeNull();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.getUserExerciseVideo).not.toHaveBeenCalled();
  });
});
