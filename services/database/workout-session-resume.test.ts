import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSession } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const candidateId = "33333333-3333-4333-8333-333333333333";
const externalId = "55555555-5555-4555-8555-555555555555";

const { supabase } = vi.hoisted(() => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/services/database/progress", () => ({
  autoDetectPersonalRecordsFromExerciseLogs: vi.fn(async () => [])
}));

function externalWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: externalId,
    name: "Kniebeuge",
    category: "Kraft",
    target_muscle: "Quadrizeps",
    equipment: "Langhantel",
    difficulty: "Anfänger",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "",
    notes: null,
    catalog_source: "external",
    catalog_slug: "barbell_squat",
    is_global: true,
    ...overrides
  };
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: candidateId,
    user_id: userId,
    workout_id: null,
    plan_day_id: null,
    workout_name: "Squat",
    started_at: "2026-07-15T08:00:00.000Z",
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started",
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.rpc.mockResolvedValue({ data: { session: session() }, error: null });
});

describe("direct workout session atomic authority", () => {
  it("starts an external activity through the provider-activity identity", async () => {
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userId, externalWorkout(), null)).resolves.toMatchObject({ id: candidateId });
    expect(supabase.rpc).toHaveBeenCalledWith("start_or_resume_direct_workout_session_atomic", {
      p_user_id: userId,
      p_target_type: "provider_activity",
      p_identity: externalId,
      p_provider: "plaivra_activity_catalog",
      p_display_name: "Kniebeuge",
      p_category: "Kraft",
      p_planned_prescription: {},
      p_candidate_session_id: null
    });
  });

  it("passes the route-scoped candidate to database ownership validation", async () => {
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userId, externalWorkout({ name: "Squat" }), candidateId)).resolves.toMatchObject({ id: candidateId });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "start_or_resume_direct_workout_session_atomic",
      expect.objectContaining({ p_user_id: userId, p_candidate_session_id: candidateId })
    );
  });

  it("maps custom exercises to the custom authority identity", async () => {
    const customId = "88888888-8888-4888-8888-888888888888";
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await getOrStartWorkoutSession(userId, externalWorkout({
      id: customId,
      name: "My circuit",
      catalog_source: "custom",
      catalog_slug: null,
      catalog_version: null,
      is_global: false
    }));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "start_or_resume_direct_workout_session_atomic",
      expect.objectContaining({ p_target_type: "custom_exercise", p_identity: customId, p_provider: null })
    );
  });

  it("maps canonical local exercises to the global authority identity", async () => {
    const globalId = "77777777-7777-4777-8777-777777777777";
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await getOrStartWorkoutSession(userId, externalWorkout({
      id: globalId,
      catalog_source: undefined,
      catalog_slug: null,
      catalog_version: null
    }));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "start_or_resume_direct_workout_session_atomic",
      expect.objectContaining({ p_target_type: "global_exercise", p_identity: globalId, p_provider: null })
    );
  });

  it("forwards planned set, rep, and rest metadata without client-side persistence", async () => {
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await getOrStartWorkoutSession(userId, externalWorkout({ sets: 4, reps: "8", rest_seconds: 120 }));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "start_or_resume_direct_workout_session_atomic",
      expect.objectContaining({ p_planned_prescription: { sets: 4, reps: "8", restSeconds: 120 } })
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces authority conflicts instead of creating a client-side fallback", async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "An open direct workout session already exists." }
    });
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userId, externalWorkout())).rejects.toThrow(/open direct workout session/i);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("fails closed when the authority response has no canonical session", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: {}, error: null });
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userId, externalWorkout())).rejects.toThrow("Workout session could not be started.");
  });

  it("delegates concurrent requests to the same idempotent database authority", async () => {
    const canonical = session({ id: "44444444-4444-4444-8444-444444444444" });
    supabase.rpc.mockResolvedValue({ data: { session: canonical }, error: null });
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const [left, right] = await Promise.all([
      getOrStartWorkoutSession(userId, externalWorkout()),
      getOrStartWorkoutSession(userId, externalWorkout())
    ]);
    expect(left.id).toBe(canonical.id);
    expect(right.id).toBe(canonical.id);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
