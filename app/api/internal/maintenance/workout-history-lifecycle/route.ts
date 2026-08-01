import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!serverEnv.cronSecret)
    return NextResponse.json(
      { error: "Maintenance authentication is not configured." },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const dryRun = !serverEnv.workoutHistoryPurgeExecutionEnabled;
  const result = await createSupabaseAdminClient().rpc(
    "purge_expired_workout_sessions",
    { p_batch_size: 100, p_dry_run: dryRun },
  );
  if (result.error) {
    console.error(
      "Workout History lifecycle maintenance failed:",
      result.error.message,
    );
    return NextResponse.json(
      { error: "Workout History maintenance failed." },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { ok: true, destructive_execution: !dryRun, result: result.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
