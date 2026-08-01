import { NextResponse } from "next/server";

import { requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { parseWorkoutHistoryListRequest, WorkoutHistoryRequestError } from "@/lib/workouts/history/request";
import { readWorkoutHistoryFilterOptions } from "@/services/workouts/history/filter-options";
import { listWorkoutHistoryKeyset } from "@/services/workouts/history/server-list-reader";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";
import { WORKOUT_HISTORY_HEADERS, withWorkoutHistoryHeaders, workoutHistoryError } from "@/app/api/workouts/history/_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "workout-history-list", 60, 60_000);
  if (limited) return withWorkoutHistoryHeaders(limited);
  let input;
  try {
    input = parseWorkoutHistoryListRequest(new URL(request.url));
  } catch (error) {
    if (error instanceof WorkoutHistoryRequestError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400, headers: WORKOUT_HISTORY_HEADERS },
      );
    }
    return workoutHistoryError(error);
  }
  const context = await requireUser(request);
  if (context instanceof NextResponse) return withWorkoutHistoryHeaders(context);
  try {
    if (!serverEnv.workoutHistoryCursorSecret) {
      throw new WorkoutHistoryReaderError("history_unavailable", "Workout history could not load.", 503);
    }
    const [response, periodOptions] = await Promise.all([
      listWorkoutHistoryKeyset(
        context.supabase,
        context.user.id,
        input,
        serverEnv.workoutHistoryCursorSecret,
      ),
      input.cursor
        ? Promise.resolve(null)
        : readWorkoutHistoryFilterOptions(
            context.supabase,
            context.user.id,
            input,
          ),
    ]);
    return NextResponse.json(
      periodOptions ? { ...response, filterOptions: periodOptions } : response,
      { headers: WORKOUT_HISTORY_HEADERS },
    );
  } catch (error) {
    return workoutHistoryError(error);
  }
}
