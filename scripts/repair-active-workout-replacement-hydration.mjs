import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);
function replaceOnce(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing replacement-hydration anchor in ${path}: ${before.slice(0, 140)}`);
  write(path, source.replace(before, after));
}
function insertBefore(path, anchor, addition) {
  const source = read(path);
  if (source.includes(addition.trim())) return;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Missing insertion anchor in ${path}: ${anchor.slice(0, 100)}`);
  write(path, `${source.slice(0, index)}${addition}${source.slice(index)}`);
}

// Domain contract: the immutable plan source remains distinct from the canonical actual replacement.
replaceOnce(
  "types/workout-prescription.ts",
  '  sourcePlanActivityId: string | null;\n  activityName: string;\n  rawCompatibilityPrescription: PlannedActivityPrescription;\n  plannedSets: number | null;\n  executionState: "planned" | "completed" | "adjusted" | "skipped";',
  '  sourcePlanActivityId: string | null;\n  activityName: string;\n  originalActivityName?: string;\n  actualTargetType?: "global_exercise" | "custom_exercise" | null;\n  actualGlobalExerciseId?: string | null;\n  actualCustomExerciseId?: string | null;\n  actualProvider?: string | null;\n  actualProviderActivityId?: string | null;\n  rawCompatibilityPrescription: PlannedActivityPrescription;\n  plannedSets: number | null;\n  executionState: "planned" | "completed" | "adjusted" | "skipped" | "replaced";',
);

// Canonical frozen-prescription reader consumes the actual_* replacement snapshot written by the replacement RPC.
replaceOnce(
  "services/database/workout-session-prescriptions.ts",
  'const executionStates = new Set(["planned", "completed", "adjusted", "skipped"] as const);',
  'const executionStates = new Set(["planned", "completed", "adjusted", "skipped", "replaced"] as const);\nconst actualTargetTypes = new Set(["global_exercise", "custom_exercise"] as const);',
);
replaceOnce(
  "services/database/workout-session-prescriptions.ts",
  '  source_plan_activity_id: unknown;\n  activity_name_snapshot: unknown;\n  planned_prescription: unknown;',
  '  source_plan_activity_id: unknown;\n  activity_name_snapshot: unknown;\n  actual_target_type?: unknown;\n  actual_global_exercise_id?: unknown;\n  actual_custom_exercise_id?: unknown;\n  actual_provider?: unknown;\n  actual_provider_activity_id?: unknown;\n  actual_name_snapshot?: unknown;\n  planned_prescription: unknown;',
);
replaceOnce(
  "services/database/workout-session-prescriptions.ts",
  'function stringValue(value: unknown, label: string, nullable = false): string | null {\n  if (value === null && nullable) return null;',
  'function stringValue(value: unknown, label: string, nullable = false): string | null {\n  if ((value === null || value === undefined) && nullable) return null;',
);
replaceOnce(
  "services/database/workout-session-prescriptions.ts",
  '    const rawCompatibilityPrescription = objectValue(row.planned_prescription, "item.planned_prescription") as PlannedActivityPrescription;\n    const plannedSets = integerValue(row.planned_sets, "item.planned_sets", true);\n    if (plannedSets !== null && (plannedSets < 1 || plannedSets > 100)) fail("item.planned_sets is outside 1 through 100.");\n    const item: WorkoutSessionPrescriptionItem = {\n      snapshotId,\n      id,\n      workoutSessionId,\n      userId,\n      itemOrder,\n      sourcePlanExerciseId: stringValue(row.source_plan_exercise_id, "item.source_plan_exercise_id", true),\n      sourcePlanActivityId: stringValue(row.source_plan_activity_id, "item.source_plan_activity_id", true),\n      activityName: stringValue(row.activity_name_snapshot, "item.activity_name_snapshot")!,\n      rawCompatibilityPrescription,\n      plannedSets,\n      executionState: enumValue(row.state, executionStates, "item.state"),\n      normalizationStatus: "unavailable",\n      prescriptionSets: []\n    };',
  '    const rawCompatibilityPrescription = objectValue(row.planned_prescription, "item.planned_prescription") as PlannedActivityPrescription;\n    const plannedSets = integerValue(row.planned_sets, "item.planned_sets", true);\n    if (plannedSets !== null && (plannedSets < 1 || plannedSets > 100)) fail("item.planned_sets is outside 1 through 100.");\n    const executionState = enumValue(row.state, executionStates, "item.state");\n    const originalActivityName = stringValue(row.activity_name_snapshot, "item.activity_name_snapshot")!;\n    const actualTargetType = row.actual_target_type === null || row.actual_target_type === undefined\n      ? null\n      : enumValue(row.actual_target_type, actualTargetTypes, "item.actual_target_type");\n    const actualGlobalExerciseId = stringValue(row.actual_global_exercise_id, "item.actual_global_exercise_id", true);\n    const actualCustomExerciseId = stringValue(row.actual_custom_exercise_id, "item.actual_custom_exercise_id", true);\n    const actualProvider = stringValue(row.actual_provider, "item.actual_provider", true);\n    const actualProviderActivityId = stringValue(row.actual_provider_activity_id, "item.actual_provider_activity_id", true);\n    const actualName = stringValue(row.actual_name_snapshot, "item.actual_name_snapshot", true);\n    if (executionState === "replaced") {\n      if (!actualTargetType || !actualName) fail("replaced item requires canonical actual target and name.");\n      if (actualTargetType === "global_exercise" && !actualGlobalExerciseId) fail("replaced global item requires actual_global_exercise_id.");\n      if (actualTargetType === "custom_exercise" && !actualCustomExerciseId) fail("replaced custom item requires actual_custom_exercise_id.");\n    }\n    const item: WorkoutSessionPrescriptionItem = {\n      snapshotId,\n      id,\n      workoutSessionId,\n      userId,\n      itemOrder,\n      sourcePlanExerciseId: stringValue(row.source_plan_exercise_id, "item.source_plan_exercise_id", true),\n      sourcePlanActivityId: stringValue(row.source_plan_activity_id, "item.source_plan_activity_id", true),\n      activityName: actualName ?? originalActivityName,\n      originalActivityName,\n      actualTargetType,\n      actualGlobalExerciseId,\n      actualCustomExerciseId,\n      actualProvider,\n      actualProviderActivityId,\n      rawCompatibilityPrescription,\n      plannedSets,\n      executionState,\n      normalizationStatus: "unavailable",\n      prescriptionSets: []\n    };',
);
replaceOnce(
  "services/database/workout-session-prescriptions.ts",
  'const itemSelection = "id,snapshot_id,user_id,item_order,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,planned_prescription,planned_sets,state";',
  'const itemSelection = "id,snapshot_id,user_id,item_order,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,actual_target_type,actual_global_exercise_id,actual_custom_exercise_id,actual_provider,actual_provider_activity_id,actual_name_snapshot,planned_prescription,planned_sets,state";',
);

// Runtime projection preserves the plan-exercise id for commands while exposing the actual exercise identity/name after replacement hydration.
replaceOnce(
  "components/workouts/active-workout/active-workout-runtime-model-core.ts",
  '  const firstSet = item.prescriptionSets[0] ?? null;\n  return live ? {\n    ...live,\n    exercise_name: item.activityName,\n    sets: item.prescriptionSets.length || item.plannedSets,\n    reps: frozenRepetitionsTarget(item, firstSet),\n    rest_seconds: firstSet?.restSeconds ?? null\n  } : {\n    id: item.sourcePlanExerciseId ?? item.id,\n    plan_day_id: "",\n    workout_id: null,\n    source_workout_id: null,\n    exercise_name: item.activityName,',
  '  const firstSet = item.prescriptionSets[0] ?? null;\n  const actualExerciseId = item.actualGlobalExerciseId ?? item.actualCustomExerciseId ?? null;\n  return live ? {\n    ...live,\n    workout_id: actualExerciseId ?? live.workout_id,\n    source_workout_id: actualExerciseId ?? live.source_workout_id,\n    exercise_name: item.activityName,\n    sets: item.prescriptionSets.length || item.plannedSets,\n    reps: frozenRepetitionsTarget(item, firstSet),\n    rest_seconds: firstSet?.restSeconds ?? null\n  } : {\n    id: item.sourcePlanExerciseId ?? item.id,\n    plan_day_id: "",\n    workout_id: actualExerciseId,\n    source_workout_id: actualExerciseId,\n    exercise_name: item.activityName,',
);

// Unit evidence for canonical replacement hydration and identity projection.
insertBefore(
  "services/database/workout-session-prescriptions.test.ts",
  '  it("fails closed on duplicate set order, duplicate target identity and owner/session mismatches", () => {',
  '  it("hydrates canonical replaced snapshot identity without overwriting original plan identity", () => {\n    const replacementId = "11111111-1111-4111-8111-111111111121";\n    const [projection] = normalizeWorkoutSessionPrescriptionRows({\n      snapshot,\n      items: [{\n        ...item,\n        state: "replaced",\n        actual_target_type: "global_exercise",\n        actual_global_exercise_id: replacementId,\n        actual_custom_exercise_id: null,\n        actual_provider: null,\n        actual_provider_activity_id: null,\n        actual_name_snapshot: "Dumbbell Goblet Squat"\n      }],\n      sets: [setRow()],\n      targets: [targetRow()],\n      definitions\n    });\n    expect(projection).toMatchObject({\n      executionState: "replaced",\n      sourcePlanExerciseId: "exercise-a",\n      sourcePlanActivityId: "activity-a",\n      originalActivityName: "Frozen Press",\n      activityName: "Dumbbell Goblet Squat",\n      actualTargetType: "global_exercise",\n      actualGlobalExerciseId: replacementId\n    });\n  });\n\n',
);

write("components/workouts/active-workout/active-workout-replacement-hydration.test.ts", `import { describe, expect, it } from "vitest";\nimport type { UserWorkoutPlanExercise } from "@/types";\nimport type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";\nimport { frozenExercise } from "./active-workout-runtime-model-core";\n\ndescribe("Active Workout replacement hydration", () => {\n  it("keeps the source plan command id while projecting the actual replacement identity for detail/navigation", () => {\n    const replacementId = "11111111-1111-4111-8111-111111111121";\n    const item = {\n      id: "snapshot-item", snapshotId: "snapshot", workoutSessionId: "session", userId: "user", itemOrder: 1,\n      sourcePlanExerciseId: "plan-exercise", sourcePlanActivityId: "original-activity",\n      activityName: "Dumbbell Goblet Squat", originalActivityName: "Barbell Squat",\n      actualTargetType: "global_exercise", actualGlobalExerciseId: replacementId, actualCustomExerciseId: null,\n      actualProvider: null, actualProviderActivityId: null, rawCompatibilityPrescription: { sets: 2, reps: "8-10" },\n      plannedSets: 2, executionState: "replaced", normalizationStatus: "partial", prescriptionSets: []\n    } satisfies WorkoutSessionPrescriptionItem;\n    const live = [{\n      id: "plan-exercise", plan_day_id: "day", workout_id: "original-activity", source_workout_id: "original-activity",\n      exercise_name: "Barbell Squat", category: "strength", target_muscle: "Quadriceps", equipment: "Barbell",\n      sets: 2, reps: "8-10", rest_seconds: 90, instructions: null, exercise_url: null, video_url: null, custom_video_url: null, sort_order: 1, notes: null\n    }] as unknown as UserWorkoutPlanExercise[];\n    const projected = frozenExercise(item, live);\n    expect(projected.id).toBe("plan-exercise");\n    expect(projected.exercise_name).toBe("Dumbbell Goblet Squat");\n    expect(projected.workout_id).toBe(replacementId);\n    expect(projected.source_workout_id).toBe(replacementId);\n  });\n});\n`);

// Extend exact-head rendered authority: execute Replace for Today, hydrate the canonical replaced snapshot, then open the replacement Detail id.
{
  const path = "scripts/run-active-workout-full-authority-qa.mjs";
  let source = read(path);
  source = source.replace(
    'function replacementCatalogPayload(url) {',
    'const replacementDetailId = "11111111-1111-4111-8111-111111111121";\nconst replacementDetailName = "Dumbbell Goblet Squat";\n\nfunction replacementCatalogPayload(url) {',
  );
  source = source.replace(
    '    make("11111111-1111-4111-8111-111111111121", "Dumbbell Goblet Squat", "Dumbbell", "intermediate"),',
    '    make(replacementDetailId, replacementDetailName, "Dumbbell", "intermediate"),',
  );
  source = source.replace(
    'async function installReplacementOverrides(context) {',
    'async function installReplacementOverrides(context, enableCanonicalReplacement = false) {\n  let replacementApplied = false;\n  const replacementItem = () => ({\n    id: itemId, snapshot_id: snapshotId, user_id: contract.userId, item_order: 1,\n    source_plan_exercise_id: contract.activeFirstExerciseId, source_plan_activity_id: activityId,\n    activity_name_snapshot: contract.activeFirstExerciseName,\n    actual_target_type: replacementApplied ? "global_exercise" : null,\n    actual_global_exercise_id: replacementApplied ? replacementDetailId : null,\n    actual_custom_exercise_id: null, actual_provider: null, actual_provider_activity_id: null,\n    actual_name_snapshot: replacementApplied ? replacementDetailName : null,\n    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: 90 }, planned_sets: 2,\n    state: replacementApplied ? "replaced" : "planned"\n  });\n  if (enableCanonicalReplacement) {\n    await context.route(/\\/rest\\/v1\\/workout_session_muscle_snapshot_items(?:\\?.*)?$/, async (route) => {\n      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify([replacementItem()]) });\n    });\n    await context.route(/\\/rest\\/v1\\/rpc\\/replace_workout_session_snapshot_item_atomic(?:\\?.*)?$/, async (route) => {\n      const payload = route.request().postDataJSON();\n      check(payload?.p_replacement_identity === replacementDetailId, `Replacement RPC used unexpected identity ${payload?.p_replacement_identity}.`);\n      replacementApplied = true;\n      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(replacementItem()) });\n    });\n  }',
  );
  source = source.replace(
    '  await context.route(/\\/rest\\/v1\\/rpc\\/get_workout_replacement_candidate_eligibility(?:\\?.*)?$/, async (route) => {',
    '  await context.route(/\\/rest\\/v1\\/rpc\\/get_workout_replacement_candidate_eligibility(?:\\?.*)?$/, async (route) => {',
  );
  source = source.replace(
    '    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates.map((candidate) => ({ key: candidate.key, eligible: true, reason: null }))) });\n  });\n}',
    '    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates.map((candidate) => ({ key: candidate.key, eligible: true, reason: null }))) });\n  });\n  return { replacementDetailId, replacementDetailName, wasApplied: () => replacementApplied };\n}',
  );
  source = source.replace(
    '    if (scenario.multiExercise) await installMultiExerciseOverrides(context);\n    if (scenario.replacementCatalog) await installReplacementOverrides(context);\n    const route = scenario.direct ? directRoute : dayRoute;',
    '    if (scenario.multiExercise) await installMultiExerciseOverrides(context);\n    const replacementAuthority = scenario.replacementCatalog\n      ? await installReplacementOverrides(context, Boolean(scenario.replacementApply))\n      : null;\n    const route = scenario.direct ? directRoute : dayRoute;',
  );
  source = source.replace(
    '    await scenario.run({ page, context, fixture });',
    '    await scenario.run({ page, context, fixture, replacementAuthority });',
  );
  const scenarioAnchor = '  {\n    name: "optimistic-complete-network-delay-390x844",';
  const scenarioAddition = `  {\n    name: "replacement-exercise-detail-identity-390x844",\n    replacementCatalog: true,\n    replacementApply: true,\n    run: async ({ page, replacementAuthority }) => {\n      const menu = await openExerciseMenu(page);\n      await menu.locator('[role="menuitem"]').first().click();\n      const replacement = visible(page, "[data-aw-replacement-recommendations]");\n      await replacement.locator("ol li").first().waitFor({ state: "visible", timeout: 15_000 });\n      const firstRecommendation = replacement.locator("ol li").first();\n      check((await firstRecommendation.innerText()).includes(replacementAuthority.replacementDetailName), "Expected deterministic replacement candidate was not first.");\n      await firstRecommendation.getByRole("button", { name: /^Replace$/i }).click();\n      await page.getByRole("heading", { name: replacementAuthority.replacementDetailName, exact: true }).waitFor({ state: "visible", timeout: 15_000 });\n      check(replacementAuthority.wasApplied(), "Canonical replacement RPC was not acknowledged.");\n      await visible(page, "[data-aw10-exercise-details-trigger]").click();\n      await page.waitForURL((url) => url.pathname === \`/workouts/\${replacementAuthority.replacementDetailId}\` && url.searchParams.get("returnTo") === dayRoute, { timeout: 20_000 });\n      await page.getByText(replacementAuthority.replacementDetailName, { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });\n      const back = page.locator(\`a[href="\${dayRoute}"]\`).first();\n      await back.click();\n      await page.waitForURL((url) => url.pathname === dayRoute, { timeout: 20_000 });\n      await waitForActiveShell(page);\n      await page.getByRole("heading", { name: replacementAuthority.replacementDetailName, exact: true }).waitFor({ state: "visible", timeout: 15_000 });\n    },\n  },\n`;
  if (!source.includes(scenarioAnchor)) throw new Error("Could not locate optimistic scenario anchor for replacement Detail QA.");
  source = source.replace(scenarioAnchor, `${scenarioAddition}${scenarioAnchor}`);
  write(path, source);
}

// Contract-lock the explicit replacement-identity rendered scenario.
replaceOnce(
  "lib/product/active-workout-aw10-closure.test.ts",
  '      "replacement-intelligence-reason-aware-390x844",\n      "optimistic-complete-network-delay-390x844",',
  '      "replacement-intelligence-reason-aware-390x844",\n      "replacement-exercise-detail-identity-390x844",\n      "optimistic-complete-network-delay-390x844",',
);

console.log("Repaired Active Workout canonical replacement hydration and replacement Detail QA.");
