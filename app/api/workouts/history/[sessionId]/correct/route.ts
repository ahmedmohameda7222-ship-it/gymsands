import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  requireUser,
  serverEnv,
} from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import {
  correctCompletedSession,
  WorkoutHistoryMutationError,
} from "@/services/workouts/history/mutations";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const limited = rateLimit(request, "workout-history-correct", 20, 60_000);
  if (limited) return limited;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json(
      { error: "Workout session is invalid." },
      { status: 400 },
    );
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!serverEnv.supabaseServiceRoleKey)
    return NextResponse.json(
      { error: "Workout correction is temporarily unavailable." },
      { status: 503 },
    );
  try {
    return NextResponse.json(
      await correctCompletedSession(
        auth.supabase,
        createSupabaseServerClient(null, true),
        auth.user.id,
        sessionId,
        await request.json(),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const known = error instanceof WorkoutHistoryMutationError;
    return NextResponse.json(
      {
        error: known ? error.message : "Workout correction failed.",
        code: known ? error.code : "correction_failed",
      },
      { status: known ? error.status : 500 },
    );
  }
}
