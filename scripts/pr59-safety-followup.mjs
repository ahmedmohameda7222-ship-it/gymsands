import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => writeFileSync(path, `${content.trimEnd()}\n`, "utf8");
const remove = (path) => { if (existsSync(path)) rmSync(path, { force: true }); };

let sessions = read("services/database/workout-sessions.ts");
const directBlock = /(?:const directSessionStartPromises = new Map<string, Promise<WorkoutSession>>\(\);\n\n)?export async function getOrStartWorkoutSession\([\s\S]*?\n\}\n\nexport async function cancelWorkoutSession/;
if (!directBlock.test(sessions)) throw new Error("Direct-session block not found for safety correction");
sessions = sessions.replace(directBlock, `const directSessionStartPromises = new Map<string, Promise<WorkoutSession>>();

export async function getOrStartWorkoutSession(userId: string, workout: Workout, candidateSessionId?: string | null) {
  requireWorkoutPersistence(userId, "Workout session");
  const workoutId = await persistedLegacyWorkoutId(workout.id);

  if (candidateSessionId && isUuid(candidateSessionId)) {
    let candidateQuery = supabase!
      .from("workout_sessions")
      .select("*")
      .eq("id", candidateSessionId)
      .eq("user_id", userId)
      .eq("status", "started")
      .is("plan_day_id", null);
    candidateQuery = workoutId
      ? candidateQuery.eq("workout_id", workoutId)
      : candidateQuery.is("workout_id", null);
    const candidate = await candidateQuery.maybeSingle();
    if (candidate.error) throw candidate.error;
    if (candidate.data) return normalizeWorkoutSession(candidate.data as WorkoutSession);
  }

  if (workoutId) {
    const { data, error } = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "started")
      .is("plan_day_id", null)
      .eq("workout_id", workoutId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeWorkoutSession(data as WorkoutSession) : startWorkoutSession(userId, workout, workoutId);
  }

  if (workout.catalog_source === "custom") {
    const { data, error } = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "started")
      .is("plan_day_id", null)
      .is("workout_id", null)
      .eq("workout_name", workout.name)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeWorkoutSession(data as WorkoutSession) : startWorkoutSession(userId, workout, null);
  }

  const { data: unresolved, error: unresolvedError } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "started")
    .is("plan_day_id", null)
    .is("workout_id", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unresolvedError) throw unresolvedError;
  if (unresolved) {
    throw new Error("An open direct workout session already exists. Resume or finish it before starting another external activity.");
  }

  const key = userId + ":" + workout.id;
  const pending = directSessionStartPromises.get(key);
  if (pending) return pending;
  const start = startWorkoutSession(userId, workout, null).finally(() => directSessionStartPromises.delete(key));
  directSessionStartPromises.set(key, start);
  return start;
}

export async function cancelWorkoutSession`);
write("services/database/workout-sessions.ts", sessions);

write("services/database/workout-session-resume.test.ts", `import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSession } from "@/types";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const externalId = "55555555-5555-4555-8555-555555555555";
const legacyId = "77777777-7777-4777-8777-777777777777";

const { state, supabase } = vi.hoisted(() => {
  const state: { workouts: Array<Record<string, unknown>>; sessions: Array<Record<string, unknown>>; inserts: Array<Record<string, unknown>>; insertDelay: Promise<void> | null } = { workouts: [], sessions: [], inserts: [], insertDelay: null };
  function from(table: string) {
    const filters: Array<{ kind: "eq" | "is" | "in"; key: string; value: unknown }> = [];
    let inserted: Record<string, unknown> | null = null;
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push({ kind: "eq", key, value }); return builder; },
      is(key: string, value: unknown) { filters.push({ kind: "is", key, value }); return builder; },
      in(key: string, value: unknown[]) { filters.push({ kind: "in", key, value }); return builder; },
      order() { return builder; },
      limit() { return builder; },
      insert(payload: Record<string, unknown>) { inserted = payload; state.inserts.push(payload); return builder; },
      async maybeSingle() {
        const rows = table === "workouts" ? state.workouts : state.sessions;
        const data = rows.find((row) => filters.every((filter) => filter.kind === "is" ? (row[filter.key] ?? null) === filter.value : filter.kind === "in" ? (filter.value as unknown[]).includes(row[filter.key]) : row[filter.key] === filter.value)) ?? null;
        return { data, error: null };
      },
      async single() {
        if (state.insertDelay) await state.insertDelay;
        if (!inserted) return { data: null, error: { message: "Missing insert" } };
        return { data: { id: "44444444-4444-4444-8444-444444444444", ...inserted }, error: null };
      }
    };
    return builder;
  }
  return { state, supabase: { from: vi.fn(from), rpc: vi.fn() } };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/services/database/progress", () => ({ autoDetectPersonalRecordsFromExerciseLogs: vi.fn(async () => []) }));

function externalWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: externalId, name: "Kniebeuge", category: "Kraft", target_muscle: "Quadrizeps", equipment: "Langhantel", difficulty: "Anfänger", sets: null, reps: null, rest_seconds: null, instructions: "", notes: null, catalog_source: "external", catalog_slug: "barbell_squat", is_global: true, ...overrides };
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return { id: candidateId, user_id: userA, workout_id: null, plan_day_id: null, workout_name: "Squat", started_at: "2026-07-15T08:00:00.000Z", completed_at: null, duration_minutes: null, notes: null, status: "started", ...overrides };
}

beforeEach(() => { state.workouts = []; state.sessions = []; state.inserts = []; state.insertDelay = null; vi.clearAllMocks(); });

describe("direct workout session identity", () => {
  it("starts an external activity when no direct session is open", async () => {
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), null);
    expect(result.workout_id).toBeNull();
    expect(state.inserts).toHaveLength(1);
  });

  it("resumes the route-scoped external candidate after a locale change", async () => {
    state.sessions = [session()];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), candidateId);
    expect(result.id).toBe(candidateId);
    expect(state.inserts).toHaveLength(0);
  });

  it.each([
    ["foreign", session({ user_id: userB })],
    ["completed", session({ status: "completed", completed_at: "2026-07-15T09:00:00.000Z" })],
    ["skipped", session({ status: "skipped", completed_at: "2026-07-15T09:00:00.000Z" })],
    ["plan-day", session({ plan_day_id: "99999999-9999-4999-8999-999999999999" })]
  ])("never resumes a %s candidate", async (_label, invalidCandidate) => {
    state.sessions = [invalidCandidate];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userA, externalWorkout(), candidateId)).rejects.toThrow(/open direct workout session/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("blocks ambiguous external auto-start when local active-session storage is cleared", async () => {
    state.sessions = [session({ id: "66666666-6666-4666-8666-666666666666", workout_name: "Kniebeuge" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userA, externalWorkout(), null)).rejects.toThrow(/open direct workout session/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("does not resume two external UUIDs that share the same display name", async () => {
    state.sessions = [session({ id: "66666666-6666-4666-8666-666666666666", workout_name: "Kniebeuge" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await expect(getOrStartWorkoutSession(userA, externalWorkout({ id: "88888888-8888-4888-8888-888888888888" }), null)).rejects.toThrow(/open direct workout session/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("preserves real local workout identity and reuses its open legacy session", async () => {
    state.workouts = [{ id: legacyId }];
    state.sessions = [session({ workout_id: legacyId, workout_name: "Bench press" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout({ id: legacyId, name: "Bench press", catalog_source: "legacy" }), null);
    expect(result.workout_id).toBe(legacyId);
    expect(state.inserts).toHaveLength(0);
  });

  it("preserves exact-name resume for user-owned custom direct workouts", async () => {
    state.sessions = [session({ workout_name: "My circuit" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout({ id: "88888888-8888-4888-8888-888888888888", name: "My circuit", catalog_source: "custom", is_global: false }), null);
    expect(result.id).toBe(candidateId);
    expect(state.inserts).toHaveLength(0);
  });

  it("deduplicates concurrent external starts in the supported process flow", async () => {
    let release!: () => void;
    state.insertDelay = new Promise<void>((resolve) => { release = resolve; });
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const first = getOrStartWorkoutSession(userA, externalWorkout(), null);
    const second = getOrStartWorkoutSession(userA, externalWorkout(), null);
    await Promise.resolve();
    release();
    const [left, right] = await Promise.all([first, second]);
    expect(left.id).toBe(right.id);
    expect(state.inserts).toHaveLength(1);
  });

  it("keeps plan-day starts on the canonical atomic RPC path", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { session: session({ plan_day_id: "99999999-9999-4999-8999-999999999999" }) }, error: null });
    const { startWorkoutDaySession } = await import("./workout-sessions");
    await startWorkoutDaySession(userA, { id: "99999999-9999-4999-8999-999999999999", plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", day_number: 1, day_name: "Day 1", weekday: "Monday", notes: null, exercises: [], plan: null });
    expect(supabase.rpc).toHaveBeenCalledWith("start_or_resume_workout_session_atomic", expect.objectContaining({ p_user_id: userA, p_plan_day_id: "99999999-9999-4999-8999-999999999999" }));
  });
});`);

let historyTest = read("lib/workouts/workout-session-history.test.ts");
if (!historyTest.includes("preserves exact-name history for user-owned custom workouts")) {
  historyTest = historyTest.replace(/\n\}\);\s*$/, `\n\n  it("preserves exact-name history for user-owned custom workouts", () => {\n    const custom = workout({ id: "88888888-8888-4888-8888-888888888888", name: "My circuit", catalog_source: "custom", is_global: false });\n    expect(findPreviousWorkoutSet(history(null, "My circuit"), custom)).toMatchObject({ reps: 8, weightKg: 80 });\n  });\n});\n`);
  write("lib/workouts/workout-session-history.test.ts", historyTest);
}

for (const path of [
  "scripts/pr59-final-corrections.mjs",
  "scripts/pr59-safety-followup.mjs",
  "scripts/pr59-direct-corrections.mjs",
  "scripts/pr59-corrections.mjs.gz.b64",
  "scripts/pr59-trigger.txt",
  "PR59_PAYLOAD_ERROR.txt",
  "PR59_DIRECT_ERROR.txt",
  "PR59_CLEAN_PAYLOAD_ERROR.txt",
  ".github/workflows/pr59-correction-runner.yml",
  ".github/workflows/pr59-quality-bootstrap.yml"
]) remove(path);

console.log("Applied PR59 external-session safety follow-up.");