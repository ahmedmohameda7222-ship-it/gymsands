import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/observability/correlation-id";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

export const WORKOUT_HISTORY_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
} as const;

const MAX_SAFE_DURATION_MS = 60_000;

export function boundedWorkoutHistoryDuration(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    MAX_SAFE_DURATION_MS,
    Math.max(0, Math.round(value * 10) / 10),
  );
}

export function workoutHistoryServerTiming(
  timings: {
    total?: number;
    list?: number;
    filters?: number;
  },
) {
  return Object.entries(timings)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(
      ([name, duration]) =>
        `${name};dur=${boundedWorkoutHistoryDuration(duration).toFixed(1)}`,
    )
    .join(", ");
}

export function withWorkoutHistoryHeaders(
  response: Response,
  requestId?: string,
  serverTiming?: string,
): Response {
  const headers = new Headers(response.headers);
  Object.entries(WORKOUT_HISTORY_HEADERS).forEach(([key, value]) =>
    headers.set(key, value),
  );
  if (requestId) headers.set(REQUEST_ID_HEADER, requestId);
  if (serverTiming) headers.set("Server-Timing", serverTiming);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function workoutHistoryError(
  error: unknown,
  options: {
    requestId?: string;
    totalDurationMs?: number;
  } = {},
): Response {
  const timing =
    options.totalDurationMs === undefined
      ? undefined
      : workoutHistoryServerTiming({ total: options.totalDurationMs });
  if (error instanceof WorkoutHistoryReaderError) {
    return withWorkoutHistoryHeaders(
      NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      ),
      options.requestId,
      timing,
    );
  }
  return withWorkoutHistoryHeaders(
    NextResponse.json(
      {
        error: "Workout history could not load.",
        code: "history_unavailable",
      },
      { status: 500 },
    ),
    options.requestId,
    timing,
  );
}
