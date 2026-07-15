import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSession } from "@/types";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";

const { state, supabase } = vi.hoisted(() => {
  const state: {
    workouts: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
    inserts: Array<Record<string, unknown>>;
  } = { workouts: [], sessions: [], inserts: [] };

  function from(table: string) {
    const filters: Array<{ kind: "eq" | "is"; key: string; value: unknown }> = [];
    let inserted: Record<string, unknown> | null = null;
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push({ kind: "eq", key, value }); return builder; },
      is(key: string, value: unknown) { filters.push({ kind: "is", key, value }); return builder; },
      order() { return builder; },
      limit() { return builder; },
      insert(payload: Record<string, unknown>) { inserted = payload; state.inserts.push(payload); return builder; },
      async maybeSingle() {
        const rows = table === "workouts" ? state.workouts : state.sessions;
        const data = rows.find((row) => filters.every((filter) => filter.kind === "is"
          ? (row[filter.key] ?? null) === filter.value
          : row[filter.key] === filter.value)) ?? null;
        return { data, error: null };
      },
      async single() {
        if (!inserted) return { data: null, error: { message: "Missing insert" } };
        return {
          data: {
            id: "44444444-4444-4444-8444-444444444444",
            ...inserted
          },
          error: null
        };
      }
    };
    return builder;
  }

  return { state, supabase: { from: vi.fn(from) } };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/services/database/progress", () => ({ autoDetectPersonalRecordsFromExerciseLogs: vi.fn(async () => []) }));

const germanWorkout: Workout = {
  id: "55555555-5555-4555-8555-555555555555",
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
  catalog_slug: "barbell-squat",
  is_global: true
};

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: candidateId,
    user_id: userA,
    workout_id: null,
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
  state.workouts = [];
  state.sessions = [];
  state.inserts = [];
  vi.clearAllMocks();
});

describe("external workout session resume", () => {
  it("resumes an English-started session by owner-scoped ID after the catalog name becomes German", async () => {
    state.sessions = [session(), session({ id: "66666666-6666-4666-8666-666666666666", workout_name: "Squat" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");

    const result = await getOrStartWorkoutSession(userA, germanWorkout, candidateId);

    expect(result.id).toBe(candidateId);
    expect(result.workout_name).toBe("Squat");
    expect(state.inserts).toHaveLength(0);
  });

  it.each([
    ["foreign", session({ user_id: userB })],
    ["completed", session({ status: "completed", completed_at: "2026-07-15T09:00:00.000Z" })]
  ])("rejects a %s candidate before starting an owner-scoped replacement", async (_label, invalidCandidate) => {
    state.sessions = [invalidCandidate];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");

    const result = await getOrStartWorkoutSession(userA, germanWorkout, candidateId);

    expect(result.user_id).toBe(userA);
    expect(result.id).not.toBe(candidateId);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ user_id: userA, workout_id: null, workout_name: "Kniebeuge", status: "started" });
  });
});
