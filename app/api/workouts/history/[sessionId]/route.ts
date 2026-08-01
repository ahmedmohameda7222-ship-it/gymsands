import { NextResponse } from "next/server";

import { WORKOUT_HISTORY_HEADERS, withWorkoutHistoryHeaders, workoutHistoryError } from "@/app/api/workouts/history/_shared";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import { getWorkoutHistorySessionDetail } from "@/services/workouts/history/server-reader";
import { readSharedWorkoutHistorySessionMetrics } from "@/services/workouts/history/shared-session-metrics";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const limited = rateLimit(request, "workout-history-detail", 60, 60_000);
  if (limited) return withWorkoutHistoryHeaders(limited);
  const { sessionId } = await params;
  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Workout history item was not found.", code: "history_not_found" },
      { status: 404, headers: WORKOUT_HISTORY_HEADERS },
    );
  }
  const context = await requireUser(request);
  if (context instanceof NextResponse) return withWorkoutHistoryHeaders(context);
  try {
    const [detail, sharedMetrics] = await Promise.all([
      getWorkoutHistorySessionDetail(context.supabase, context.user.id, sessionId),
      readSharedWorkoutHistorySessionMetrics(
        context.supabase,
        context.user.id,
        sessionId,
      ),
    ]);
    return NextResponse.json(
      {
        ...detail,
        summary: {
          ...detail.summary,
          reliableVolume:
            sharedMetrics.externalLoadVolume > 0
              ? sharedMetrics.externalLoadVolume
              : null,
        },
      },
      { headers: WORKOUT_HISTORY_HEADERS },
    );
  } catch (error) {
    return workoutHistoryError(error);
  }
}
