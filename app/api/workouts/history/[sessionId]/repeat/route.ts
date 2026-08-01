import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import {
  RepeatWorkoutError,
  startRepeatedWorkout,
} from "@/services/workouts/history/repeat";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const limited = rateLimit(request, "workout-history-repeat", 10, 60_000);
  if (limited) return limited;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId))
    return NextResponse.json(
      { error: "Workout session is invalid." },
      { status: 400 },
    );
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(
      await startRepeatedWorkout(
        auth.supabase,
        auth.user.id,
        sessionId,
        await request.json(),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const known = error instanceof RepeatWorkoutError;
    return NextResponse.json(
      {
        error: known ? error.message : "Repeat workout failed.",
        code: known ? error.code : "repeat_failed",
      },
      { status: known ? error.status : 500 },
    );
  }
}
