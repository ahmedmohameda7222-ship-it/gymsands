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

export function overlaps(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function truncate(value, limit = 2000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function reportPayload() {
  const failures = observations.flatMap((item) =>
    item.failures.map((failure) => `${item.name}: ${failure}`)
  );
  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
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
