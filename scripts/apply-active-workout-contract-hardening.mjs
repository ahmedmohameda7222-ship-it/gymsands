import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);
function replaceOnce(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing anchor in ${path}: ${before.slice(0, 120)}`);
  write(path, source.replace(before, after));
}

// A transient menu closes when the pointer leaves that menu, not merely when it leaves the whole workout shell.
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  '  const rootRef = useRef<HTMLDivElement>(null);\n',
  '',
);
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  '    const onPointerDown = (event: PointerEvent) => {\n      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);\n    };',
  '    const onPointerDown = (event: PointerEvent) => {\n      const selector = openMenu === "session"\n        ? "[data-aw10-session-menu]"\n        : "[data-aw10-exercise-actions]";\n      const target = event.target;\n      if (!(target instanceof Element) || !target.closest(selector)) setOpenMenu(null);\n    };',
);
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  '    <div\n      ref={rootRef}\n      data-aw5-execution-shell',
  '    <div\n      data-aw5-execution-shell',
);

// Reason-aware ranking explicitly penalizes unavailable-equipment reuse while retaining structured positive signals.
replaceOnce(
  "services/workouts/active-workout/replacement-ranking.ts",
  '  equipmentAlternative: number;\n  easierDifficulty: number;',
  '  equipmentAlternative: number;\n  equipmentConflict: number;\n  easierDifficulty: number;',
);
replaceOnce(
  "services/workouts/active-workout/replacement-ranking.ts",
  '  equipmentAlternative: 8,\n  easierDifficulty: 8,',
  '  equipmentAlternative: 8,\n  equipmentConflict: 0,\n  easierDifficulty: 8,',
);
replaceOnce(
  "services/workouts/active-workout/replacement-ranking.ts",
  '  machine_taken: Object.freeze({ primaryMuscle: 42, movement: 22, equipmentAlternative: 22 }),\n  no_equipment: Object.freeze({ primaryMuscle: 42, equipmentAlternative: 30, movement: 16 }),',
  '  machine_taken: Object.freeze({ primaryMuscle: 42, movement: 22, equipmentAlternative: 22, equipmentConflict: -48 }),\n  no_equipment: Object.freeze({ primaryMuscle: 42, equipmentAlternative: 30, equipmentConflict: -56, movement: 16 }),',
);
replaceOnce(
  "services/workouts/active-workout/replacement-ranking.ts",
  'function values(value: string | null | undefined) {\n  return new Set(normalized(value).split(/\\s*(?:,|\\/|\\+|\\band\\b)\\s*/u).filter(Boolean));\n}',
  'function values(value: string | null | undefined) {\n  return new Set(\n    (value ?? "")\n      .split(/(?:,|\\/|\\+|\\band\\b)/iu)\n      .map((item) => normalized(item))\n      .filter(Boolean),\n  );\n}',
);
replaceOnce(
  "services/workouts/active-workout/replacement-ranking.ts",
  '    equipmentAlternative: equipmentDiffers(input.original.equipment, candidate.equipment),\n    easierDifficulty: easierDifficulty(input.original.difficulty, candidate.difficulty),',
  '    equipmentAlternative: equipmentDiffers(input.original.equipment, candidate.equipment),\n    equipmentConflict: same(input.original.equipment, candidate.equipment) ? 1 : 0,\n    easierDifficulty: easierDifficulty(input.original.difficulty, candidate.difficulty),',
);

// The superseded surface contract now asserts the intelligent replacement surface and bidi isolation where it actually renders.
{
  const path = "lib/i18n/active-workout-surface-contract.test.ts";
  let source = read(path);
  if (!source.includes('const replacement = source(')) {
    source = source.replace(
      'const details = source(\n  "components/workouts/active-workout/active-workout-details-bridge.tsx",\n);\n',
      'const details = source(\n  "components/workouts/active-workout/active-workout-details-bridge.tsx",\n);\nconst replacement = source(\n  "components/workouts/active-workout/active-workout-replacement-recommendations.tsx",\n);\n',
    );
    source = source.replace(
      '    expect(details).toContain(\n      \'<option value="machine_taken">{tr("actions.machineOccupied")}</option>\',\n    );',
      '    expect(details).toContain("<ActiveWorkoutReplacementRecommendations");\n    expect(replacement).toContain("SUPPORTED_REASONS");\n    expect(replacement).toContain("replacement.reasonMachineTaken");',
    );
    source = source.replace(
      '    expect(details).toContain(\n      "isolateBidiText(alternative.alternative_exercise_name)",\n    );',
      '    expect(replacement).toContain("<bdi>{recommendation.workout.name}</bdi>");',
    );
    write(path, source);
  }
}

// AW-10 rendered QA follows the controlled-menu contract and the IndexedDB v2 draft schema.
{
  const path = "scripts/run-aw10-active-workout-closure-qa.mjs";
  let source = read(path);
  source = source.replaceAll('indexedDB.open("plaivra-active-workout-v1", 1)', 'indexedDB.open("plaivra-active-workout-v1", 2)');
  source = source.replace(
    '        if (!database.objectStoreNames.contains("operations")) {\n          const operations = database.createObjectStore("operations", { keyPath: "id" });\n          operations.createIndex("by_session_sequence", ["userId", "workoutSessionId", "sequence"], { unique: true });\n          operations.createIndex("by_user", "userId");\n          operations.createIndex("by_state", "state");\n        }',
    '        if (!database.objectStoreNames.contains("operations")) {\n          const operations = database.createObjectStore("operations", { keyPath: "id" });\n          operations.createIndex("by_session_sequence", ["userId", "workoutSessionId", "sequence"], { unique: true });\n          operations.createIndex("by_user", "userId");\n          operations.createIndex("by_state", "state");\n        }\n        if (!database.objectStoreNames.contains("set_drafts")) {\n          const drafts = database.createObjectStore("set_drafts", { keyPath: "key" });\n          drafts.createIndex("by_session", ["userId", "workoutSessionId"]);\n          drafts.createIndex("by_user", "userId");\n          drafts.createIndex("by_expiry", "expiresAt");\n        }',
  );
  source = source.replace(
    'async function openSessionMenu(page) {\n  const trigger = visible(page, "[data-aw10-session-menu] > summary");\n  await trigger.click({ timeout: 10_000 });\n  await page.waitForFunction(() => {\n    const menu = document.querySelector("[data-aw10-session-menu]");\n    return menu instanceof HTMLDetailsElement && menu.open;\n  }, undefined, { timeout: 5_000 });\n  return visible(page, "[data-aw10-session-menu]");\n}',
    'async function openSessionMenu(page) {\n  const trigger = visible(page, \'[data-aw10-session-menu] [data-aw-menu-trigger="session"]\');\n  await trigger.click({ timeout: 10_000 });\n  await page.waitForFunction(() =>\n    document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open",\n  undefined, { timeout: 5_000 });\n  return visible(page, "[data-aw10-session-menu]");\n}',
  );
  write(path, source);
}

// The production fixture can prove delayed optimistic acceptance, rollback, short natural rest expiry, and persisted feedback defaults.
{
  const path = "scripts/train-layout-qa-fixture.mjs";
  let source = read(path);
  source = source.replace(
    '  delayCanonical,\n  muscleScenario = "ready",\n  includeGuide = true\n}, requestHistory) {',
    '  delayCanonical,\n  canonicalSetFailure = false,\n  restSeconds = 90,\n  muscleScenario = "ready",\n  includeGuide = true\n}, requestHistory) {',
  );
  source = source.replace(
    '    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: 90 },',
    '    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: restSeconds },',
  );
  source = source.replace('    rest_seconds: 90,', '    rest_seconds: restSeconds,');
  source = source.replace(
    '    large_text_mode: false,\n    quick_log_sections: ["workout"],',
    '    large_text_mode: false,\n    workout_sounds: true,\n    haptics: true,\n    quick_log_sections: ["workout"],',
  );
  source = source.replace(
    '    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {\n      if (delayCanonical) await delayedCanonical.promise;\n      const payload = request.postDataJSON();',
    '    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {\n      if (delayCanonical) await delayedCanonical.promise;\n      if (canonicalSetFailure) {\n        canonicalFinished.resolve();\n        return respond({ message: "qa canonical set failure" }, 503);\n      }\n      const payload = request.postDataJSON();',
  );
  write(path, source);
}

write("lib/workouts/active-workout-detail-navigation.test.ts", `import { describe, expect, it } from "vitest";\n\nimport {\n  activeWorkoutExerciseDetailHref,\n  resolveActiveWorkoutExerciseDetailId,\n  validatedActiveWorkoutReturnTo,\n} from "./active-workout-detail-navigation";\n\ndescribe("Active Workout canonical Exercise Detail navigation", () => {\n  it("resolves stable identity without display-name matching", () => {\n    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: " catalog-id ", workoutId: "legacy-id", sourcePlanActivityId: "activity-id" })).toBe("catalog-id");\n    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: null, workoutId: "legacy-id", sourcePlanActivityId: "activity-id" })).toBe("legacy-id");\n    expect(resolveActiveWorkoutExerciseDetailId({ sourceWorkoutId: null, workoutId: null, sourcePlanActivityId: "activity-id" })).toBe("activity-id");\n    expect(resolveActiveWorkoutExerciseDetailId({})).toBeNull();\n  });\n\n  it("builds the canonical library route with a validated workout return boundary", () => {\n    const href = activeWorkoutExerciseDetailHref("exercise/one", "/workouts/session/day/day-1");\n    expect(href).toBe("/workouts/exercise%2Fone?returnTo=%2Fworkouts%2Fsession%2Fday%2Fday-1");\n    expect(validatedActiveWorkoutReturnTo("/workouts/session/day/day-1")).toBe("/workouts/session/day/day-1");\n    expect(validatedActiveWorkoutReturnTo("https://evil.example/workouts/session/day/day-1")).toBeNull();\n    expect(validatedActiveWorkoutReturnTo("//evil.example")).toBeNull();\n  });\n});\n`);

write("lib/workouts/active-session-sync/set-drafts.test.ts", `import { describe, expect, it } from "vitest";\n\nimport { activeWorkoutSetDraftKey, mergeActiveWorkoutSetDrafts } from "./set-drafts";\n\ndescribe("Active Workout session-scoped set drafts", () => {\n  it("keys drafts by user, session, frozen snapshot item, and set", () => {\n    expect(activeWorkoutSetDraftKey("user-a", "session-a", "item-a", 2)).toBe("user-a:session-a:item-a:2");\n    expect(activeWorkoutSetDraftKey("user-b", "session-a", "item-a", 2)).not.toBe(activeWorkoutSetDraftKey("user-a", "session-a", "item-a", 2));\n  });\n\n  it("restores only incomplete sets and never overwrites canonical completed work", () => {\n    const exercises = [{\n      prescriptionItem: { id: "item-a" },\n      sets: [\n        { setNumber: 1, reps: "10", weightKg: "20", rpe: "", rir: "", setType: "working", notes: "saved", completedAt: "2026-08-16T00:00:00Z" },\n        { setNumber: 2, reps: "", weightKg: "", rpe: "", rir: "", setType: "working", notes: "", completedAt: null },\n      ],\n    }];\n    const drafts = [{\n      key: "user-a:session-a:item-a:2", userId: "user-a", workoutSessionId: "session-a", snapshotItemId: "item-a", setNumber: 2,\n      reps: "8", weightKg: "32.5", rpe: "8", rir: "2", setType: "working", notes: "draft",\n      updatedAt: "2026-08-16T00:00:00Z", expiresAt: "2026-08-17T00:00:00Z",\n    }, {\n      key: "user-a:session-a:item-a:1", userId: "user-a", workoutSessionId: "session-a", snapshotItemId: "item-a", setNumber: 1,\n      reps: "1", weightKg: "1", rpe: "1", rir: "1", setType: "working", notes: "must-not-overwrite",\n      updatedAt: "2026-08-16T00:00:00Z", expiresAt: "2026-08-17T00:00:00Z",\n    }];\n    const merged = mergeActiveWorkoutSetDrafts(exercises, drafts);\n    expect(merged[0]?.sets[0]?.reps).toBe("10");\n    expect(merged[0]?.sets[0]?.notes).toBe("saved");\n    expect(merged[0]?.sets[1]?.reps).toBe("8");\n    expect(merged[0]?.sets[1]?.weightKg).toBe("32.5");\n    expect(merged[0]?.sets[1]?.notes).toBe("draft");\n  });\n});\n`);

write("components/workouts/active-workout/active-workout-exercise-navigator.test.ts", `import { describe, expect, it } from "vitest";\n\nimport { buildActiveWorkoutExerciseNavigatorRows } from "./active-workout-exercise-navigator";\n\ndescribe("Active Workout Exercise Navigator model", () => {\n  it("targets the first incomplete set and preserves completed, skipped, and replacement state", () => {\n    const rows = buildActiveWorkoutExerciseNavigatorRows({\n      activeExerciseIndex: 1,\n      originalNamesByPlanExerciseId: new Map([["plan-2", "Original Row"]]),\n      exercises: [\n        { exercise: { exercise_name: "Completed" }, prescriptionItem: { executionState: "completed", sourcePlanExerciseId: "plan-1" }, sets: [{ completedAt: "done" }, { completedAt: "done" }] },\n        { exercise: { exercise_name: "Replacement Row" }, prescriptionItem: { executionState: "planned", sourcePlanExerciseId: "plan-2" }, sets: [{ completedAt: "done" }, { completedAt: null }, { completedAt: null }] },\n        { exercise: { exercise_name: "Skipped" }, prescriptionItem: { executionState: "skipped", sourcePlanExerciseId: "plan-3" }, sets: [{ completedAt: null }] },\n      ],\n    });\n    expect(rows[0]).toMatchObject({ completedSets: 2, totalSets: 2, targetSetIndex: 1, current: false });\n    expect(rows[1]).toMatchObject({ completedSets: 1, totalSets: 3, targetSetIndex: 1, current: true, replacedFrom: "Original Row" });\n    expect(rows[2]).toMatchObject({ skipped: true, targetSetIndex: 0 });\n  });\n});\n`);

console.log("Applied Active Workout contract hardening.");
