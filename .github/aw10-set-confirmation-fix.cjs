const { readFileSync, writeFileSync } = require("node:fs");

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one target, found ${count}`);
  writeFileSync(path, source.replace(before, after), "utf8");
}

function replaceRegex(path, pattern, after) {
  const source = readFileSync(path, "utf8");
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) throw new Error(`${path}: regex target mismatch`);
  writeFileSync(path, source.replace(pattern, after), "utf8");
}

const contracts = "lib/workouts/active-session-sync/contracts.ts";
replaceOnce(
  contracts,
  `import type { SessionCommandRequest } from "@/lib/workouts/session-engine/contracts";`,
  `import type { SessionCommandRequest } from "@/lib/workouts/session-engine/contracts";\nimport { serializeWorkoutSetLogs } from "@/services/database/workout-set-log-serialization";`,
);
replaceRegex(
  contracts,
  /function stableSetValue\([\s\S]*?export function exerciseLogTargetIdentity/,
  `function record(value: unknown): Record<string, unknown> | null {\n  return value && typeof value === "object" && !Array.isArray(value)\n    ? value as Record<string, unknown>\n    : null;\n}\n\nfunction pick(value: unknown, ...keys: string[]) {\n  const row = record(value);\n  if (!row) return undefined;\n  for (const key of keys) {\n    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];\n  }\n  return undefined;\n}\n\nfunction nullableString(value: unknown) {\n  return value === undefined || value === null || value === ""\n    ? null\n    : String(value);\n}\n\nfunction nullableNumber(value: unknown) {\n  if (value === undefined || value === null || value === "") return null;\n  const numeric = Number(value);\n  return Number.isFinite(numeric) ? numeric : null;\n}\n\nfunction semanticMetric(value: unknown) {\n  return {\n    metric_key: nullableString(pick(value, "metric_key", "metricKey")),\n    metric_version: nullableNumber(pick(value, "metric_version", "metricVersion") ?? 1),\n    value: nullableNumber(pick(value, "value")),\n    side: nullableString(pick(value, "side") ?? "none"),\n    source: nullableString(pick(value, "source") ?? "manual"),\n    source_provider: nullableString(pick(value, "source_provider", "sourceProvider")),\n    source_version: nullableString(pick(value, "source_version", "sourceVersion")),\n  };\n}\n\nfunction semanticMetrics(value: unknown) {\n  return (Array.isArray(value) ? value : [])\n    .map(semanticMetric)\n    .sort((left, right) =>\n      String(left.metric_key).localeCompare(String(right.metric_key))\n      || Number(left.metric_version) - Number(right.metric_version)\n      || String(left.side).localeCompare(String(right.side)),\n    );\n}\n\nfunction semanticSetDetails(value: unknown) {\n  if (!record(value)) return null;\n  return {\n    schema_version: nullableNumber(pick(value, "schema_version", "schemaVersion") ?? 1),\n    set_type: nullableString(pick(value, "set_type", "setType")),\n    rpe: nullableNumber(pick(value, "rpe")),\n    rir: nullableNumber(pick(value, "rir")),\n    notes: nullableString(pick(value, "notes")),\n    side_mode: nullableString(pick(value, "side_mode", "sideMode") ?? "none"),\n    planned_tempo: nullableString(pick(value, "planned_tempo", "plannedTempo")),\n    performed_tempo: nullableString(pick(value, "performed_tempo", "performedTempo")),\n    tempo_adherence: nullableString(\n      pick(value, "tempo_adherence", "tempoAdherence") ?? "not_recorded",\n    ),\n    source: nullableString(pick(value, "source") ?? "manual"),\n    source_provider: nullableString(pick(value, "source_provider", "sourceProvider")),\n    source_version: nullableString(pick(value, "source_version", "sourceVersion")),\n  };\n}\n\nfunction semanticSegments(value: unknown) {\n  return (Array.isArray(value) ? value : [])\n    .map((segment) => ({\n      segment_order: nullableNumber(pick(segment, "segment_order", "segmentOrder")),\n      segment_kind: nullableString(pick(segment, "segment_kind", "segmentKind")),\n      side: nullableString(pick(segment, "side") ?? "none"),\n      completed_at: nullableString(pick(segment, "completed_at", "completedAt")),\n      source: nullableString(pick(segment, "source") ?? "manual"),\n      source_provider: nullableString(pick(segment, "source_provider", "sourceProvider")),\n      source_version: nullableString(pick(segment, "source_version", "sourceVersion")),\n      performance_metrics: semanticMetrics(\n        pick(segment, "performance_metrics", "performanceMetrics", "metric_values"),\n      ),\n    }))\n    .sort((left, right) => Number(left.segment_order) - Number(right.segment_order));\n}\n\nfunction stableSqlSetValue(value: unknown) {\n  return JSON.stringify({\n    reps: nullableNumber(pick(value, "reps")),\n    weight_kg: nullableNumber(pick(value, "weight_kg", "weightKg")),\n    notes: nullableString(pick(value, "notes")),\n    completed_at: nullableString(pick(value, "completed_at", "completedAt")),\n    set_details: semanticSetDetails(pick(value, "set_details", "setDetails")),\n    performance_metrics: semanticMetrics(\n      pick(value, "performance_metrics", "performanceMetrics"),\n    ),\n    segments: semanticSegments(pick(value, "segments")),\n  });\n}\n\nexport function fingerprintCanonicalSetWrite(log: CanonicalWorkoutSetWrite) {\n  return stableSqlSetValue(serializeWorkoutSetLogs([log])[0]);\n}\n\nexport function fingerprintCanonicalExerciseLog(log: ExerciseLog) {\n  return stableSqlSetValue(log);\n}\n\nexport function exerciseLogTargetIdentity`,
);

const coordinator = "lib/workouts/active-session-sync/coordinator.ts";
replaceOnce(
  coordinator,
  `          // Terminal server authority wins. Continue draining in case another\n          // local producer appended work while terminal proof was resolving.\n          continue;`,
  `          // Terminal server authority wins. Stop immediately so no stale\n          // operation can be reinserted after terminal cache cleanup.\n          return notify("online_synced");`,
);

const runner = "scripts/run-aw10-active-workout-closure-qa.mjs";
replaceOnce(
  runner,
  `async function mutateFirstOperation(page, patch) {`,
  `async function waitForNoPendingOperations(page, timeoutMs = 20_000) {\n  const deadline = Date.now() + timeoutMs;\n  let stableZeroObservations = 0;\n  while (Date.now() < deadline) {\n    const count = await operationCount(page);\n    stableZeroObservations = count === 0 ? stableZeroObservations + 1 : 0;\n    if (stableZeroObservations >= 3) return;\n    await page.waitForTimeout(100);\n  }\n  throw new Error("Durable operations did not reach a stable resolved state.");\n}\n\nasync function mutateFirstOperation(page, patch) {`,
);
replaceRegex(
  runner,
  /    await page\.waitForFunction\(async \(\) => \{[\s\S]*?    \}, undefined, \{ timeout: 20_000 \}\);\n    checks\.pendingAfter = await operationCount\(page\);/,
  `    await waitForNoPendingOperations(page);\n    checks.pendingAfter = await operationCount(page);`,
);

const aw10ContractTest = "lib/product/active-workout-aw10-closure.test.ts";
replaceOnce(
  aw10ContractTest,
  `    expect(runner).toContain('operation.state === "applied" || operation.state === "discarded"');`,
  `    expect(runner).toContain("waitForNoPendingOperations");\n    expect(runner).toContain("stableZeroObservations >= 3");`,
);

writeFileSync(
  "lib/workouts/active-session-sync/contracts.test.ts",
  `import { describe, expect, it } from "vitest";\nimport type { ExerciseLog } from "@/types";\nimport type { CanonicalWorkoutSetWrite } from "@/lib/workouts/active-session-store/persistence-adapter";\nimport { fingerprintCanonicalExerciseLog, fingerprintCanonicalSetWrite } from "./contracts";\n\ndescribe("durable set fingerprints", () => {\n  it("matches canonical input to its hydrated database projection", () => {\n    const write: CanonicalWorkoutSetWrite = {\n      planExerciseId: "10000000-0000-4000-8000-000000000011",\n      exerciseOrder: 1,\n      exerciseName: "Barbell Squat",\n      setNumber: 1,\n      reps: 8,\n      weightKg: 80,\n      notes: null,\n      completedAt: "2026-07-27T08:10:00.000Z",\n      metricSource: "manual",\n      metricSourceProvider: "plaivra",\n      metricSourceVersion: "aw3c-v1",\n      setDetails: {\n        setType: "working",\n        rpe: null,\n        rir: null,\n        notes: null,\n        sideMode: "none",\n        plannedTempo: null,\n        performedTempo: null,\n        tempoAdherence: "not_recorded",\n        source: "manual",\n        sourceProvider: "plaivra",\n        sourceVersion: "aw3c-v1",\n      },\n    };\n    const hydrated = {\n      reps: 8,\n      weight_kg: 80,\n      notes: null,\n      completed_at: write.completedAt,\n      performance_metrics: [],\n      segments: [],\n      set_details: {\n        exercise_log_id: "25000000-0000-4000-8000-000000000001",\n        workout_session_id: "10000000-0000-4000-8000-000000000001",\n        user_id: "00000000-0000-4000-8000-000000000001",\n        schema_version: 1,\n        set_type: "working",\n        rpe: null,\n        rir: null,\n        notes: null,\n        side_mode: "none",\n        planned_tempo: null,\n        performed_tempo: null,\n        tempo_adherence: "not_recorded",\n        source: "manual",\n        source_provider: "plaivra",\n        source_version: "aw3c-v1",\n        created_at: write.completedAt,\n        updated_at: write.completedAt,\n      },\n    } as unknown as ExerciseLog;\n    expect(fingerprintCanonicalExerciseLog(hydrated)).toBe(\n      fingerprintCanonicalSetWrite(write),\n    );\n  });\n});\n`,
  "utf8",
);
