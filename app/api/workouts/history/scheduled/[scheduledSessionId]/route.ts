import { NextResponse } from "next/server";

import { WORKOUT_HISTORY_HEADERS, withWorkoutHistoryHeaders, workoutHistoryError } from "@/app/api/workouts/history/_shared";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import { getScheduledWorkoutHistoryDetail } from "@/services/workouts/history/server-reader";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scheduledSessionId: string }> },
) {
  const limited = rateLimit(request, "workout-history-scheduled-detail", 60, 60_000);
  if (limited) return withWorkoutHistoryHeaders(limited);
  const { scheduledSessionId } = await params;
  if (!isUuid(scheduledSessionId)) {
    return NextResponse.json(
      { error: "Workout history item was not found.", code: "history_not_found" },
      { status: 404, headers: WORKOUT_HISTORY_HEADERS },
    );
  }
  const context = await requireUser(request);
  if (context instanceof NextResponse) return withWorkoutHistoryHeaders(context);
  try {
    return NextResponse.json(
      await getScheduledWorkoutHistoryDetail(context.supabase, context.user.id, scheduledSessionId),
      { headers: WORKOUT_HISTORY_HEADERS },
    );
  } catch (error) {
    return workoutHistoryError(error);
  }
}
