import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
export const outputDir = path.resolve(
  process.env.QA_TRAIN_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "train-phase0b-phase1")
);
export const contract = JSON.parse(
  await readFile(new URL("../lib/fixtures/train-mock-contract.json", import.meta.url), "utf8")
);
export const dayRoute = `/workouts/session/day/${contract.activeDayId}`;
export const activityId = "11111111-1111-4111-8111-111111111111";
export const directRoute = `/workouts/session/${activityId}`;
export const directExerciseName = "Barbell squat with a deliberately long activity name for responsive verification";
export const snapshotId = "21000000-0000-4000-8000-000000000001";
export const itemId = "22000000-0000-4000-8000-000000000001";
export const setIds = [
  "23000000-0000-4000-8000-000000000001",
  "23000000-0000-4000-8000-000000000002"
];
export const observations = [];
export const serverMode = process.env.QA_SERVER_MODE || "production";
export const buildCommand = process.env.QA_BUILD_COMMAND
  || "NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build";
export const startCommand = process.env.QA_START_COMMAND || "npm run start";
export const mockAuthBuildValue = process.env.QA_MOCK_AUTH_BUILD_VALUE || "true";
export const headSha = process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || null;
export const workflowRunId = process.env.QA_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null;

export function overlaps(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

export function overlapDepth(a, b) {
  if (!overlaps(a, b)) return 0;
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function truncate(value, limit = 2000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function reportPayload() {
  const observedFailures = observations.flatMap((item) =>
    item.failures.map((failure) => `${item.name}: ${failure}`)
  );
  const consistencyFailures = observations.flatMap((item) => {
    if (!item.metrics) return [];
    const pairs = [
      ["close intersects Mini Heat Map", item.metrics.close, item.metrics.heatMap],
      ["close intersects session title", item.metrics.close, item.metrics.sessionTitle],
      ["close intersects metadata", item.metrics.close, item.metrics.metadata],
      ["close intersects Pause/Resume", item.metrics.close, item.metrics.pause],
      ["sticky intersects reps input", item.metrics.sticky, item.metrics.reps],
      ["sticky intersects weight input", item.metrics.sticky, item.metrics.weight],
      ["sticky intersects details trigger", item.metrics.sticky, item.metrics.details],
      ["sticky intersects set path", item.metrics.sticky, item.metrics.setPath],
      ["sticky intersects validation feedback", item.metrics.sticky, item.metrics.feedback],
      ...item.metrics.restPresets.map((target, index) => [
        `sticky intersects rest preset ${index + 1}`,
        item.metrics.sticky,
        target
      ]),
      ...item.metrics.interactiveControls.map((target, index) => [
        `sticky intersects interactive control ${index + 1} (${target.label})`,
        item.metrics.sticky,
        target
      ])
    ];
    return pairs.flatMap(([label, first, second]) => {
      const depth = overlapDepth(first, second);
      if (depth <= 1 || item.failures.some((failure) => failure.startsWith(label))) return [];
      return [`${item.name}: unreported intersection ${label} (${depth.toFixed(2)}px)`];
    });
  });
  const failures = [...observedFailures, ...consistencyFailures];
  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    serverMode,
    buildCommand,
    startCommand,
    mockAuthBuildValue,
    headSha,
    workflowRunId,
    canonicalIdentity: {
      userId: contract.userId,
      activePlanId: contract.planIds.active,
      activeDayId: contract.activeDayId,
      activeFirstExerciseId: contract.activeFirstExerciseId,
      activeSessionId: contract.activeSessionId,
      activeExerciseLogId: contract.activeExerciseLogId,
      snapshotId,
      itemId,
      setIds
    },
    requiredStates: {
      setEntry: observations.some((item) => item.name.includes("set-entry") && !item.bootstrapFailed),
      direct: observations.some((item) => item.name.startsWith("direct-set-entry") && !item.bootstrapFailed),
      busy: observations.some((item) => item.name.includes("busy") && !item.bootstrapFailed),
      validationError: observations.some((item) => item.name.includes("validation-error") && !item.bootstrapFailed),
      rest: observations.some((item) => item.name.includes("rest") && !item.bootstrapFailed),
      paused: observations.some((item) => item.name.includes("paused") && !item.bootstrapFailed),
      details: observations.some((item) => item.name.includes("details") && !item.bootstrapFailed),
      review: observations.some((item) => item.name.includes("session-review") && !item.bootstrapFailed),
      completed: observations.some((item) => item.name.includes("completed-summary") && !item.bootstrapFailed),
      keyboardReps: observations.some((item) => item.name.includes("keyboard-reps") && !item.bootstrapFailed),
      keyboardWeight: observations.some((item) => item.name.includes("keyboard-weight") && !item.bootstrapFailed)
    },
    observations,
    consistencyFailures,
    failures
  };
}

export async function writeReport() {
  await writeFile(
    path.join(outputDir, "aw5-correction-layout-qa-results.json"),
    `${JSON.stringify(reportPayload(), null, 2)}\n`,
    "utf8"
  );
}

export function createDeferred() {
  let resolve;
  let settled = false;
  const promise = new Promise((next) => {
    resolve = () => {
      if (settled) return;
      settled = true;
      next();
    };
  });
  return { promise, resolve, get settled() { return settled; } };
}

export function requestRecord(request, outcome = "requested") {
  let postData = null;
  try {
    postData = request.postData();
  } catch {
    postData = null;
  }
  return {
    at: new Date().toISOString(),
    outcome,
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
    postData: postData ? truncate(postData, 1000) : null
  };
}

await mkdir(outputDir, { recursive: true });
