import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserWorkoutPlan, Workout, WorkoutPlanDaySession, WorkoutSession } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const dayId = "33333333-3333-4333-8333-333333333333";
const exerciseId = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";
const scheduledId = "77777777-7777-4777-8777-777777777777";

const { state, supabase, autoDetectPersonalRecordsFromExerciseLogs } = vi.hoisted(() => {
  const state: {
    rpcData: Record<string, unknown>;
    rpcError: Record<string, { message: string } | undefined>;
    singleData: unknown;
    orderData: unknown[];
  } = { rpcData: {}, rpcError: {}, singleData: null, orderData: [] };

  function from() {
    let insertedPayload: unknown;
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      limit() { return builder; },
      maybeSingle: vi.fn(async () => ({ data: state.singleData, error: null })),
      single: vi.fn(async () => ({ data: state.singleData ?? insertedPayload, error: null })),
      order: vi.fn(async () => ({ data: state.orderData, error: null })),
      insert: vi.fn((payload: unknown) => { insertedPayload = payload; return builder; }),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      in: vi.fn(() => builder),
      or: vi.fn(() => builder)
    };
    return builder;
  }

  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
    from: vi.fn(from),
    rpc: vi.fn(async (name: string) => ({
      data: state.rpcData[name] ?? null,
      error: state.rpcError[name] ?? null
    }))
  };
  return {
    state,
    supabase,
    autoDetectPersonalRecordsFromExerciseLogs: vi.fn(async () => [])
  };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/services/database/progress", () => ({ autoDetectPersonalRecordsFromExerciseLogs }));

const workout: Workout = {
  id: "66666666-6666-4666-8666-666666666666",
  plan_exercise_id: exerciseId,
  name: "Bench press",
  category: "Strength",
  target_muscle: "Chest",
  equipment: "Barbell",
  difficulty: "Beginner",
  sets: 3,
  reps: "8-10",
  rest_seconds: 90,
  instructions: "Use controlled form.",
  notes: null,
  is_global: true
};

const plan: UserWorkoutPlan = {
  id: planId,
  user_id: userId,
  name: "Strength plan",
  is_active: true,
  source: "manual",
  created_at: "2026-07-13T08:00:00.000Z",
  updated_at: "2026-07-13T08:00:00.000Z",
  days: [{
    id: dayId,
    plan_id: planId,
    day_number: 1,
    day_name: "Push",
    weekday: "Monday",
    notes: null,
    exercises: [{
      id: exerciseId,
      plan_day_id: dayId,
      workout_id: null,
      source_workout_id: workout.id,
      exercise_name: workout.name,
      category: workout.category,
      target_muscle: workout.target_muscle,
      equipment: workout.equipment,
      sets: workout.sets ?? null,
      reps: workout.reps ?? null,
      rest_seconds: workout.rest_seconds ?? null,
      sort_order: 1,
      notes: null
    }]
  }]
};

beforeEach(() => {
  state.rpcData = {};
  state.rpcError = {};
  state.singleData = null;
  state.orderData = [];
  vi.clearAllMocks();
});

describe("atomic workout plan browser persistence", () => {
  it("creates and activates plans through their atomic RPCs", async () => {
    state.rpcData.create_workout_plan_atomic = { id: planId };
    const { createUserWorkoutPlan, setDefaultUserWorkoutPlan } = await import("@/services/database/workout-plans");

    await expect(createUserWorkoutPlan({ userId, planName: " Strength plan ", days: [{ dayName: "Push", weekday: "Monday", exercises: [workout] }] }))
      .resolves.toEqual({ id: planId });
    await setDefaultUserWorkoutPlan(userId, planId);

    expect(supabase.rpc).toHaveBeenCalledWith("create_workout_plan_atomic", expect.objectContaining({
      p_user_id: userId,
      p_activate: true,
      p_plan: expect.objectContaining({
        name: "Strength plan",
        days: [expect.objectContaining({ exercises: [expect.objectContaining({ exercise_name: "Bench press" })] })]
      })
    }));
    expect(supabase.rpc).toHaveBeenCalledWith("activate_workout_plan_atomic", {
      p_user_id: userId,
      p_plan_id: planId,
      p_expected_updated_at: null
    });
  });

  it("saves a day with stable exercise identity through one RPC", async () => {
    const { updateUserWorkoutPlanDay } = await import("@/services/database/workout-plans");
    await updateUserWorkoutPlanDay(dayId, { dayName: " Push ", weekday: "Monday", notes: "Focus", exercises: [workout] });
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith("save_workout_plan_day_atomic", {
      p_user_id: userId,
      p_day_id: dayId,
      p_day: expect.objectContaining({
        day_name: "Push",
        exercises: [expect.objectContaining({ id: exerciseId, exercise_name: "Bench press" })]
      }),
      p_expected_updated_at: null
    });
  });

  it("routes full save, duplicate, archive, and delete through atomic RPCs", async () => {
    state.rpcData.duplicate_workout_plan_atomic = { id: "77777777-7777-4777-8777-777777777777" };
    const { archiveWorkoutPlan, deleteWorkoutPlan, duplicateWorkoutPlan, saveWorkoutPlan } = await import("@/services/database/workout-plan-loader");
    await saveWorkoutPlan(userId, planId, plan);
    await expect(duplicateWorkoutPlan(userId, planId)).resolves.toBe("77777777-7777-4777-8777-777777777777");
    await archiveWorkoutPlan(userId, planId);
    await deleteWorkoutPlan(userId, planId);

    expect(supabase.rpc).toHaveBeenCalledWith("save_workout_plan_atomic", expect.objectContaining({
      p_plan_id: planId,
      p_expected_updated_at: plan.updated_at,
      p_plan: expect.objectContaining({ days: [expect.objectContaining({ id: dayId })] })
    }));
    expect(supabase.rpc).toHaveBeenCalledWith("duplicate_workout_plan_atomic", { p_user_id: userId, p_plan_id: planId });
    expect(supabase.rpc).toHaveBeenCalledWith("archive_workout_plan_atomic", expect.objectContaining({ p_user_id: userId, p_plan_id: planId }));
    expect(supabase.rpc).toHaveBeenCalledWith("delete_workout_plan_atomic", { p_user_id: userId, p_plan_id: planId, p_confirmed: true });
  });

  it("filters archived days and exercises without replacing active IDs", async () => {
    state.orderData = [{
      ...plan,
      user_workout_plan_days: [{
        ...plan.days[0],
        user_workout_plan_exercises: [
          { ...plan.days[0].exercises[0], archived_at: null },
          { ...plan.days[0].exercises[0], id: "88888888-8888-4888-8888-888888888888", archived_at: "2026-07-13T09:00:00.000Z" }
        ]
      }, {
        ...plan.days[0],
        id: "99999999-9999-4999-8999-999999999999",
        archived_at: "2026-07-13T09:00:00.000Z"
      }]
    }];
    const { getAllUserWorkoutPlans } = await import("@/services/database/workout-plan-loader");
    const [loaded] = await getAllUserWorkoutPlans(userId);
    expect(loaded.days).toHaveLength(1);
    expect(loaded.days[0].id).toBe(dayId);
    expect(loaded.days[0].exercises.map((exercise) => exercise.id)).toEqual([exerciseId]);
  });
});

describe("atomic plan-day workout sessions", () => {
  const session: WorkoutSession = {
    id: sessionId,
    user_id: userId,
    workout_id: null,
    plan_id: planId,
    plan_day_id: dayId,
    workout_name: "Push - Monday",
    started_at: "2026-07-13T10:00:00.000Z",
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  const day = { ...plan.days[0], plan: { id: planId, user_id: userId, name: plan.name, is_active: true } } as WorkoutPlanDaySession;

  it("starts or resumes a plan day with one RPC", async () => {
    state.singleData = { id: scheduledId };
    state.rpcData.start_or_resume_workout_session_atomic = { session, resumed: false };
    const { getOrStartWorkoutDaySession } = await import("@/services/database/workout-sessions");
    await expect(getOrStartWorkoutDaySession(userId, day)).resolves.toMatchObject({ id: sessionId });
    expect(supabase.rpc).toHaveBeenCalledWith("start_or_resume_workout_session_atomic", {
      p_user_id: userId,
      p_plan_day_id: dayId,
      p_scheduled_session_id: scheduledId
    });
  });

  it("upserts stable sets and completes through plan-day RPCs", async () => {
    state.singleData = session;
    state.rpcData.complete_workout_session_atomic = {
      session: { ...session, status: "completed" },
      logs: [{ exercise_name: "Bench press", reps: 8, weight_kg: 60 }]
    };
    autoDetectPersonalRecordsFromExerciseLogs.mockRejectedValueOnce(new Error("PR unavailable"));
    const { completeWorkoutSession } = await import("@/services/database/workout-sessions");
    const finalLogs = [{
      planExerciseId: exerciseId,
      exerciseOrder: 1,
      exerciseName: "Bench press",
      setNumber: 1,
      reps: 8,
      weightKg: 60
    }];
    expect(autoDetectPersonalRecordsFromExerciseLogs).not.toHaveBeenCalled();
    await expect(completeWorkoutSession(sessionId, "Done", 42, finalLogs)).resolves.toBe(true);
    await Promise.resolve();

    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith("complete_workout_session_atomic", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_logs: [expect.objectContaining({ plan_exercise_id: exerciseId, exercise_order: 1, set_number: 1 })],
      p_duration_minutes: 42,
      p_notes: "Done"
    });
    expect(autoDetectPersonalRecordsFromExerciseLogs).toHaveBeenCalledOnce();
  });

  it("keeps standalone workout start on the existing table path", async () => {
    state.singleData = { ...session, plan_id: null, plan_day_id: null, workout_id: workout.id, workout_name: workout.name };
    const { startWorkoutSession } = await import("@/services/database/workout-sessions");
    await startWorkoutSession(userId, workout);
    expect(supabase.from).toHaveBeenCalledWith("workout_sessions");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
