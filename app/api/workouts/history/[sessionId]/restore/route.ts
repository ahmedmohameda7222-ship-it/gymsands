import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import {
  restoreSession,
  WorkoutHistoryMutationError,
} from "@/services/workouts/history/mutations";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const limited = rateLimit(request, "workout-history-restore", 20, 60_000);
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
    const body = await request.json();
    return NextResponse.json(
      await restoreSession(
        auth.supabase,
        auth.user.id,
        sessionId,
        body.idempotencyKey,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const known = error instanceof WorkoutHistoryMutationError;
    return NextResponse.json(
      { error: known ? error.message : "Workout restore failed." },
      { status: known ? error.status : 500 },
    );
  }
}
