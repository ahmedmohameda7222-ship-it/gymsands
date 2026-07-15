import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, `${content.trimEnd()}\n`, "utf8");
}

function replaceOne(path, pattern, replacement, label) {
  const source = read(path);
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label} not found in ${path}`);
  write(path, source.replace(pattern, replacement));
}

function remove(path) {
  if (existsSync(path)) rmSync(path, { force: true });
}

const mainQuality = execFileSync("git", ["show", "origin/main:.github/workflows/quality.yml"], { encoding: "utf8" });
let quality = mainQuality.replace("timeout-minutes: 55", "timeout-minutes: 120");
const renderedExit = `          echo "\${PIPESTATUS[0]}" > quality-reports/rendered-qa.exit\n`;
if (!quality.includes(renderedExit)) throw new Error("Rendered QA exit marker missing from authoritative Quality workflow");
quality = quality.replace(renderedExit, `${renderedExit}\n          (\n            set -euo pipefail\n            NEXT_PUBLIC_USE_MOCK_AUTH=true npm run dev > quality-reports/train-qa-server.log 2>&1 &\n            server_pid=$!\n            trap 'kill "$server_pid" 2>/dev/null || true' EXIT\n            for attempt in $(seq 1 90); do\n              if curl --fail --silent http://localhost:3000/ > /dev/null; then break; fi\n              sleep 1\n            done\n            curl --fail --silent http://localhost:3000/ > /dev/null\n            QA_BASE_URL=http://localhost:3000 QA_TRAIN_EVIDENCE_DIR=quality-reports/train-qa-evidence npm run qa:train\n          ) 2>&1 | tee quality-reports/train-qa.log\n          echo "\${PIPESTATUS[0]}" > quality-reports/train-qa.exit\n`);
quality = quality.replace("build rendered-qa manifest release-preflight", "build rendered-qa train-qa manifest release-preflight");
write(".github/workflows/quality.yml", quality);
write(".github/workflows/phase-a-diff-validation.yml", execFileSync("git", ["show", "origin/main:.github/workflows/phase-a-diff-validation.yml"], { encoding: "utf8" }));

replaceOne(
  "lib/activity-catalog/validation.ts",
  /function number\(value: unknown, options: \{ integer\?: boolean; min\?: number \} = \{\}\) \{[\s\S]*?\n\}/,
  `function number(value: unknown, options: { integer?: boolean; min?: number; max?: number } = {}) {\n  if (typeof value !== "number" || !Number.isFinite(value)) invalid();\n  if (options.integer && !Number.isInteger(value)) invalid();\n  if (options.min !== undefined && value < options.min) invalid();\n  if (options.max !== undefined && value > options.max) invalid();\n  return value;\n}`,
  "numeric validator"
);
replaceOne(
  "lib/activity-catalog/validation.ts",
  /relevanceWeight: number\(item\.relevanceWeight, \{ integer: true, min: 0 \}\)/,
  `relevanceWeight: number(item.relevanceWeight, { min: 0, max: 1 })`,
  "goal relevance validator"
);

write("lib/activity-catalog/validation.test.ts", `import { describe, expect, it } from "vitest";
import { CatalogError } from "./errors";
import { parseActivityEnvelope, parseAlternativesEnvelope, parseSearchEnvelope } from "./validation";

const activityId = "11111111-1111-4111-8111-111111111111";
const sportId = "22222222-2222-4222-8222-222222222222";
const taxonomyId = "33333333-3333-4333-8333-333333333333";
const taxonomy = { id: taxonomyId, slug: "strength", name: "Strength" };
const meta = { apiVersion: "v1", locale: "en", requestId: "request-1" };

function realShapedActivity() {
  return {
    id: activityId,
    slug: "barbell_squat",
    name: "Barbell squat",
    shortDescription: null as string | null,
    instructions: [
      { order: 1, text: "Brace the trunk." },
      { order: 2, text: "Descend under control." }
    ],
    difficulty: "intermediate",
    movementPattern: "squat",
    version: 3,
    activityType: taxonomy,
    metricSchema: {
      slug: "strength_sets",
      name: "Strength sets",
      fields: [
        { key: "reps", label: "Repetitions", type: "integer", unit: null, required: true },
        { key: "load", label: "Load", type: "number", unit: "kg", required: false }
      ]
    } as Record<string, unknown> | null,
    sports: [{ id: sportId, slug: "strength_training", name: "Strength training", isPrimary: true }],
    sessionTypes: [{ id: taxonomyId, slug: "strength_session", name: "Strength session", sportId }],
    sessionPhases: [{ id: taxonomyId, slug: "main_work", name: "Main work", sportId, isOptional: false }],
    equipment: [{ id: taxonomyId, slug: "barbell", name: "Barbell", isRequired: true }],
    muscles: [{ id: taxonomyId, slug: "quadriceps", name: "Quadriceps", bodyRegion: "lower_body", role: "primary" }],
    trainingGoals: [{ id: taxonomyId, slug: "strength", name: "Strength", relevanceWeight: 0.85 }],
    translations: {
      de: { name: "Langhantelkniebeuge", shortDescription: null, instructions: [{ order: 1, text: "Rumpf anspannen." }] },
      ar: { name: "قرفصاء بالبار" }
    },
    publishedAt: "2026-06-01T08:30:00.000Z" as string | undefined,
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

describe("Activity Catalog OpenAPI runtime validation", () => {
  it("accepts a representative real-shaped activity without discarding contract fields", () => {
    const parsed = parseActivityEnvelope({ data: realShapedActivity(), meta });
    expect(parsed.data.trainingGoals[0].relevanceWeight).toBe(0.85);
    expect(parsed.data.translations.de.shortDescription).toBeNull();
    expect(parsed.data.instructions.map((step) => step.order)).toEqual([1, 2]);
    expect(parsed.data.metricSchema?.fields?.[1]).toMatchObject({ key: "load", unit: "kg", required: false });
    expect(parsed.data.publishedAt).toBe("2026-06-01T08:30:00.000Z");
    expect(parsed.data.updatedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("accepts real-shaped pagination and preserves its next offset", () => {
    const parsed = parseSearchEnvelope({ data: [realShapedActivity()], pagination: { limit: 25, offset: 50, returned: 1, nextOffset: 75 }, meta });
    expect(parsed.pagination).toEqual({ limit: 25, offset: 50, returned: 1, nextOffset: 75 });
  });

  it("accepts a null metric schema and omitted optional nullable fields", () => {
    const source = realShapedActivity();
    const { shortDescription: _description, publishedAt: _publishedAt, ...withoutOptional } = source;
    const parsed = parseActivityEnvelope({ data: { ...withoutOptional, metricSchema: null }, meta });
    expect(parsed.data.shortDescription).toBeUndefined();
    expect(parsed.data.publishedAt).toBeUndefined();
    expect(parsed.data.metricSchema).toBeNull();
  });

  it("accepts live alternatives with nullable optional differences", () => {
    const parsed = parseAlternativesEnvelope({
      data: [{
        sourceActivityId: activityId,
        alternativeActivityId: "44444444-4444-4444-8444-444444444444",
        alternativeSlug: "goblet_squat",
        alternativeName: "Goblet squat",
        alternativeActivityTypeSlug: "strength",
        alternativeDifficulty: null,
        reasonCode: "equipment",
        differenceSummary: null,
        prescriptionTransfer: "partial",
        compatibilityScore: 0.9,
        priority: 1
      }],
      meta
    });
    expect(parsed.data[0]).toMatchObject({ alternativeSlug: "goblet_squat", compatibilityScore: 0.9, priority: 1 });
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects malformed relevance weight %s", (relevanceWeight) => {
    const activity = realShapedActivity();
    activity.trainingGoals[0].relevanceWeight = relevanceWeight;
    expect(() => parseActivityEnvelope({ data: activity, meta })).toThrowError(CatalogError);
  });

  it("rejects upstream additions rather than silently trusting unchecked JSON", () => {
    expect(() => parseActivityEnvelope({ data: { ...realShapedActivity(), privateUserNote: "must not pass" }, meta })).toThrowError(CatalogError);
  });
});`);

write("lib/workouts/workout-session-history.ts", `import type { ExerciseLog, Workout, WorkoutSessionSummary } from "@/types";

export type PreviousWorkoutSet = { reps: number | null; weightKg: number | null; performedAt: string | null };

function normalizedName(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
}

function hasPerformance(log: ExerciseLog) {
  return Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0;
}

export function findPreviousWorkoutSet(history: WorkoutSessionSummary[], workout: Workout): PreviousWorkoutSet | null {
  const external = workout.catalog_source === "external";
  const expectedName = normalizedName(workout.name);
  const candidates = history.flatMap((session) => (session.exercise_logs ?? [])
    .filter(hasPerformance)
    .filter((log) => {
      if (external) return log.source_workout_id === workout.id;
      if (log.source_workout_id) return log.source_workout_id === workout.id;
      if (session.workout_id) return session.workout_id === workout.id && normalizedName(log.exercise_name) === expectedName;
      return workout.catalog_source === "custom" && normalizedName(log.exercise_name) === expectedName;
    })
    .map((log) => ({
      log,
      performedAt: session.completed_at || session.started_at,
      timestamp: new Date(log.completed_at || log.created_at || session.completed_at || session.started_at).getTime()
    }))
  ).sort((left, right) => right.timestamp - left.timestamp);
  const latest = candidates[0];
  return latest ? { reps: latest.log.reps, weightKg: latest.log.weight_kg, performedAt: latest.performedAt } : null;
}`);

write("lib/workouts/workout-session-history.test.ts", `import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSessionSummary } from "@/types";
import { findPreviousWorkoutSet } from "./workout-session-history";

const externalId = "11111111-1111-4111-8111-111111111111";
const otherExternalId = "22222222-2222-4222-8222-222222222222";
const legacyId = "33333333-3333-4333-8333-333333333333";

function workout(overrides: Partial<Workout> = {}): Workout {
  return { id: externalId, name: "Kniebeuge", category: "Kraft", target_muscle: "Quadrizeps", equipment: "Langhantel", difficulty: "Fortgeschritten", sets: null, reps: null, rest_seconds: null, instructions: "", notes: null, catalog_source: "external", is_global: true, ...overrides };
}

function history(sourceWorkoutId: string | null, exerciseName = "Squat", sessionWorkoutId: string | null = null): WorkoutSessionSummary[] {
  return [{
    id: "44444444-4444-4444-8444-444444444444",
    user_id: "55555555-5555-4555-8555-555555555555",
    workout_id: sessionWorkoutId,
    workout_name: exerciseName,
    started_at: "2026-07-14T08:00:00.000Z",
    completed_at: "2026-07-14T09:00:00.000Z",
    duration_minutes: 60,
    notes: null,
    status: "completed",
    exercise_logs: [{
      id: "66666666-6666-4666-8666-666666666666",
      workout_session_id: "44444444-4444-4444-8444-444444444444",
      plan_exercise_id: null,
      source_workout_id: sourceWorkoutId,
      exercise_name: exerciseName,
      planned_sets: null,
      planned_reps: null,
      planned_rest_seconds: null,
      set_number: 1,
      reps: 8,
      weight_kg: 80,
      notes: null,
      completed_at: "2026-07-14T08:30:00.000Z",
      created_at: "2026-07-14T08:30:00.000Z"
    }]
  }];
}

describe("stable previous-set identity", () => {
  it("matches an external activity across a locale change by source UUID", () => {
    expect(findPreviousWorkoutSet(history(externalId, "Squat"), workout())).toMatchObject({ reps: 8, weightKg: 80 });
  });

  it("does not collide when two external UUIDs share the same display name", () => {
    expect(findPreviousWorkoutSet(history(otherExternalId, "Kniebeuge"), workout())).toBeNull();
  });

  it("does not fall back to a localized name when external source identity is unavailable", () => {
    expect(findPreviousWorkoutSet(history(null, "Kniebeuge"), workout())).toBeNull();
  });

  it("preserves legacy direct-session history through the real local workout ID", () => {
    expect(findPreviousWorkoutSet(history(null, "Bench press", legacyId), workout({ id: legacyId, name: "Bench press", catalog_source: "legacy" }))).toMatchObject({ reps: 8, weightKg: 80 });
  });
});`);

let sessionForm = read("components/workouts/workout-session-form.tsx");
if (!sessionForm.includes('import { findPreviousWorkoutSet } from "@/lib/workouts/workout-session-history";')) {
  sessionForm = sessionForm.replace('import { useTrainTranslation } from "@/lib/i18n/train";', 'import { useTrainTranslation } from "@/lib/i18n/train";\nimport { findPreviousWorkoutSet } from "@/lib/workouts/workout-session-history";');
}
const historyEffect = /  useEffect\(\(\) => \{\n    if \(!history\.length\) \{[\s\S]*?\n  \}, \[history, workout\.name\]\);/;
if (!historyEffect.test(sessionForm)) throw new Error("Previous-set effect not found");
sessionForm = sessionForm.replace(historyEffect, `  useEffect(() => {\n    setPreviousSet(findPreviousWorkoutSet(history, workout));\n  }, [history, workout]);`);
write("components/workouts/workout-session-form.tsx", sessionForm);

let sessions = read("services/database/workout-sessions.ts");
const getOrStart = /export async function getOrStartWorkoutSession\([\s\S]*?\n\}\n\nexport async function cancelWorkoutSession/;
if (!getOrStart.test(sessions)) throw new Error("Direct-session service block not found");
sessions = sessions.replace(getOrStart, `export async function getOrStartWorkoutSession(userId: string, workout: Workout, candidateSessionId?: string | null) {\n  requireWorkoutPersistence(userId, "Workout session");\n  const workoutId = await persistedLegacyWorkoutId(workout.id);\n  if (candidateSessionId && isUuid(candidateSessionId)) {\n    let candidateQuery = supabase!\n      .from("workout_sessions")\n      .select("*")\n      .eq("id", candidateSessionId)\n      .eq("user_id", userId)\n      .eq("status", "started");\n    if (workoutId) candidateQuery = candidateQuery.eq("workout_id", workoutId);\n    const candidate = await candidateQuery.maybeSingle();\n    if (candidate.error) throw candidate.error;\n    if (candidate.data) return normalizeWorkoutSession(candidate.data as WorkoutSession);\n  }\n  if (!workoutId) {\n    // The current schema has no safe persisted column for an external catalog UUID.\n    // Resume is limited to the route-scoped, owner-scoped active-session ID above.\n    // A translated display name must never become the canonical external identity.\n    return startWorkoutSession(userId, workout, null);\n  }\n  const { data, error } = await supabase!\n    .from("workout_sessions")\n    .select("*")\n    .eq("user_id", userId)\n    .eq("status", "started")\n    .eq("workout_id", workoutId)\n    .order("started_at", { ascending: false })\n    .limit(1)\n    .maybeSingle();\n  if (error) throw error;\n  return data ? normalizeWorkoutSession(data as WorkoutSession) : startWorkoutSession(userId, workout, workoutId);\n}\n\nexport async function cancelWorkoutSession`);
write("services/database/workout-sessions.ts", sessions);

write("services/database/workout-session-resume.test.ts", `import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSession } from "@/types";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const externalId = "55555555-5555-4555-8555-555555555555";
const legacyId = "77777777-7777-4777-8777-777777777777";

const { state, supabase } = vi.hoisted(() => {
  const state: { workouts: Array<Record<string, unknown>>; sessions: Array<Record<string, unknown>>; inserts: Array<Record<string, unknown>> } = { workouts: [], sessions: [], inserts: [] };
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
  return { id: candidateId, user_id: userA, workout_id: null, workout_name: "Squat", started_at: "2026-07-15T08:00:00.000Z", completed_at: null, duration_minutes: null, notes: null, status: "started", ...overrides };
}

beforeEach(() => { state.workouts = []; state.sessions = []; state.inserts = []; vi.clearAllMocks(); });

describe("direct workout session identity", () => {
  it("resumes a route-scoped external candidate after a locale change", async () => {
    state.sessions = [session()];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), candidateId);
    expect(result.id).toBe(candidateId);
    expect(state.inserts).toHaveLength(0);
  });

  it.each([
    ["foreign", session({ user_id: userB })],
    ["completed", session({ status: "completed", completed_at: "2026-07-15T09:00:00.000Z" })],
    ["skipped", session({ status: "skipped", completed_at: "2026-07-15T09:00:00.000Z" })]
  ])("never resumes a %s candidate", async (_label, invalidCandidate) => {
    state.sessions = [invalidCandidate];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), candidateId);
    expect(result.id).not.toBe(candidateId);
    expect(state.inserts).toHaveLength(1);
  });

  it("does not use a translated display name when active-session storage is missing", async () => {
    state.sessions = [session({ id: "66666666-6666-4666-8666-666666666666", workout_name: "Kniebeuge" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout(), null);
    expect(result.id).not.toBe("66666666-6666-4666-8666-666666666666");
    expect(state.inserts).toHaveLength(1);
  });

  it("does not collide two external UUIDs that share the same display name", async () => {
    state.sessions = [session({ id: "66666666-6666-4666-8666-666666666666", workout_name: "Kniebeuge" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    await getOrStartWorkoutSession(userA, externalWorkout({ id: "88888888-8888-4888-8888-888888888888" }), null);
    expect(state.inserts).toHaveLength(1);
  });

  it("preserves real local workout identity and reuses its open legacy session", async () => {
    state.workouts = [{ id: legacyId }];
    state.sessions = [session({ workout_id: legacyId, workout_name: "Bench press" })];
    const { getOrStartWorkoutSession } = await import("./workout-sessions");
    const result = await getOrStartWorkoutSession(userA, externalWorkout({ id: legacyId, name: "Bench press", catalog_source: "legacy" }), null);
    expect(result.workout_id).toBe(legacyId);
    expect(state.inserts).toHaveLength(0);
  });
});`);

let qa = read("scripts/run-train-layout-qa.mjs");
qa = qa.replace(/pageErrors\s*,keyboard,/, "pageErrors,\n    keyboard,");
write("scripts/run-train-layout-qa.mjs", qa);

for (const path of [
  ".github/workflows/pr59-correction-runner.yml",
  ".github/workflows/pr59-quality-bootstrap.yml",
  "scripts/pr59-corrections.mjs.gz.b64",
  "scripts/pr59-direct-corrections.mjs",
  "scripts/pr59-trigger.txt",
  "PR59_PAYLOAD_ERROR.txt",
  "PR59_DIRECT_ERROR.txt",
  "PR59_CLEAN_PAYLOAD_ERROR.txt"
]) remove(path);

write("lib/activity-catalog/validation.test.ts", read("lib/activity-catalog/validation.test.ts"));
write("services/activity-catalog/server/provider.ts", read("services/activity-catalog/server/provider.ts"));
console.log("Applied final deterministic PR59 corrections.");