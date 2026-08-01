import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  requireUser,
  serverEnv,
} from "@/lib/integrations/env";
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
  if (!serverEnv.supabaseServiceRoleKey)
    return NextResponse.json(
      { error: "Workout restore is temporarily unavailable." },
      { status: 503 },
    );
  try {
    const body = await request.json();
    return NextResponse.json(
      await restoreSession(
        auth.supabase,
        createSupabaseServerClient(null, true),
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
