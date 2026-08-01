import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const result = await auth.supabase
    .from("workout_sessions")
    .select(
      "id,workout_name,started_at,completed_at,cancelled_at,deleted_at,purge_after,history_revision",
    )
    .eq("user_id", auth.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(100);
  if (result.error)
    return NextResponse.json(
      { error: "Recently deleted workouts could not load." },
      { status: 503 },
    );
  const now = Date.now();
  const items = (result.data ?? []).map((item) => ({
    ...item,
    days_remaining: Math.max(
      0,
      Math.ceil((Date.parse(item.purge_after ?? "") - now) / 86_400_000),
    ),
  }));
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
