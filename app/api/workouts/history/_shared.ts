import { NextResponse } from "next/server";

import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

export const WORKOUT_HISTORY_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function withWorkoutHistoryHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(WORKOUT_HISTORY_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function workoutHistoryError(error: unknown): NextResponse {
  if (error instanceof WorkoutHistoryReaderError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: WORKOUT_HISTORY_HEADERS },
    );
  }
  console.error("Workout History request failed:", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json(
    { error: "Workout history could not load.", code: "history_unavailable" },
    { status: 500, headers: WORKOUT_HISTORY_HEADERS },
  );
}
