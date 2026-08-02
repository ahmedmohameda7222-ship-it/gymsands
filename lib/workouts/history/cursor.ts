import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { WORKOUT_HISTORY_CONTRACT_VERSION, type WorkoutHistorySort } from "@/types/workout-history";

export type WorkoutHistoryCursorPayload = {
  contractVersion: typeof WORKOUT_HISTORY_CONTRACT_VERSION;
  sort: WorkoutHistorySort;
  effectiveAt: string;
  activityId: string;
  durationMinutes: number | null;
};

export class WorkoutHistoryCursorError extends Error {
  constructor() {
    super("Workout History cursor is invalid.");
    this.name = "WorkoutHistoryCursorError";
  }
}

function signature(encodedPayload: string, secret: string): string {
  if (secret.length < 32) throw new Error("Workout History cursor secret is not configured.");
  return createHmac("sha256", secret)
    .update(`plaivra-workout-history-cursor-v1.${encodedPayload}`)
    .digest("base64url");
}

function isPayload(value: unknown): value is WorkoutHistoryCursorPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<WorkoutHistoryCursorPayload>;
  return (
    payload.contractVersion === WORKOUT_HISTORY_CONTRACT_VERSION &&
    (payload.sort === "newest" || payload.sort === "oldest" || payload.sort === "longest_duration") &&
    typeof payload.effectiveAt === "string" &&
    Number.isFinite(Date.parse(payload.effectiveAt)) &&
    typeof payload.activityId === "string" &&
    payload.activityId.length > 0 &&
    payload.activityId.length <= 160 &&
    (payload.durationMinutes === null ||
      (typeof payload.durationMinutes === "number" &&
        Number.isFinite(payload.durationMinutes) &&
        payload.durationMinutes >= 0))
  );
}

export function encodeWorkoutHistoryCursor(
  payload: WorkoutHistoryCursorPayload,
  secret: string,
): string {
  if (!isPayload(payload)) throw new WorkoutHistoryCursorError();
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function decodeWorkoutHistoryCursor(
  cursor: string,
  secret: string,
): WorkoutHistoryCursorPayload {
  try {
    const [encoded, provided, extra] = cursor.split(".");
    if (!encoded || !provided || extra || cursor.length > 1024) throw new WorkoutHistoryCursorError();
    const expected = signature(encoded, secret);
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);
    if (
      expectedBytes.length !== providedBytes.length ||
      !timingSafeEqual(expectedBytes, providedBytes)
    ) {
      throw new WorkoutHistoryCursorError();
    }
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!isPayload(parsed)) throw new WorkoutHistoryCursorError();
    return parsed;
  } catch (error) {
    if (error instanceof WorkoutHistoryCursorError) throw error;
    throw new WorkoutHistoryCursorError();
  }
}
