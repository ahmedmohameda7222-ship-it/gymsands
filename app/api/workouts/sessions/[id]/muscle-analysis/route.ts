import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { getWorkoutSessionMuscleAnalysis, SessionMuscleAnalysisError } from "@/lib/train/muscle-intelligence/session-analysis";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "session-muscle-analysis", 60, 60_000);
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const mode = new URL(request.url).searchParams.get("mode") ?? "planned";
  if (mode !== "planned" && mode !== "completed") {
    return NextResponse.json({ error: "Analysis mode must be planned or completed.", code: "invalid_analysis_mode" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const result = await getWorkoutSessionMuscleAnalysis(context.supabase, context.user.id, id, mode);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SessionMuscleAnalysisError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Workout session muscle analysis failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Historical muscle analysis could not be generated.", code: "analysis_failed" }, { status: 500 });
  }
}
