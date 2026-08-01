import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import {
  getRepeatWorkoutPreview,
  RepeatWorkoutError,
} from "@/services/workouts/history/repeat";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const limited = rateLimit(
    request,
    "workout-history-repeat-preview",
    30,
    60_000,
  );
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
    const locale = new URL(request.url).searchParams.get("locale") ?? "en";
    return NextResponse.json(
      await getRepeatWorkoutPreview(
        auth.supabase,
        auth.user.id,
        sessionId,
        locale,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const known = error instanceof RepeatWorkoutError;
    return NextResponse.json(
      { error: known ? error.message : "Repeat preview failed." },
      { status: known ? error.status : 500 },
    );
  }
}
