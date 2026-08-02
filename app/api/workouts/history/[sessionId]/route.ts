import { NextResponse } from "next/server";

import { WORKOUT_HISTORY_HEADERS, withWorkoutHistoryHeaders, workoutHistoryError } from "@/app/api/workouts/history/_shared";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import { workoutHistoryRecordProjectionIsCurrent } from "@/services/workouts/history/record-projection-state";
import { getWorkoutHistorySessionDetail } from "@/services/workouts/history/server-reader";
import { readSharedWorkoutHistorySessionMetricsForKnownOwnerScopedSession } from "@/services/workouts/history/shared-session-metrics";
import type { WorkoutHistoryDetailNotice } from "@/types/workout-history";

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
    const projectionState = workoutHistoryRecordProjectionIsCurrent(
      context.supabase,
      context.user.id,
      sessionId,
    ).catch(() => null);
    const [detail, sharedMetrics, recordsAreCurrent] = await Promise.all([
      getWorkoutHistorySessionDetail(context.supabase, context.user.id, sessionId),
      // The canonical detail read in this same request owns the explicit
      // user/session root validation. Reuse the member-scoped client for the
      // metric graph instead of issuing a second root query.
      readSharedWorkoutHistorySessionMetricsForKnownOwnerScopedSession(
        context.supabase,
        sessionId,
      ),
      projectionState,
    ]);
    const notices = new Set<WorkoutHistoryDetailNotice>(detail.notices);
    if (recordsAreCurrent === false) notices.add("user-action-required");
    else if (recordsAreCurrent === null) notices.add("partial-availability");
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
        notices: [...notices],
      },
      { headers: WORKOUT_HISTORY_HEADERS },
    );
  } catch (error) {
    return workoutHistoryError(error);
  }
}
