import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireAdmin, requireServerKeys, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { fetchWgerExercises } from "@/lib/integrations/wger";

export async function POST(request: Request) {
  const limited = rateLimit(request, "wger-import", 6, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("wger", [["WGER_API_KEY", serverEnv.wgerApiKey]]);
  if (missing) return missing;
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const limit = Number(body.limit ?? 50);
  const offset = Number(body.offset ?? 0);
  const batch = await context.supabase
    .from("exercise_import_batches")
    .insert({ source: "wger", status: "running", created_by: context.user.id })
    .select("id")
    .single();
  if (batch.error || !batch.data) return jsonError(batch.error?.message ?? "Could not create import batch.", 400);

  try {
    const imported = await fetchWgerExercises(serverEnv.wgerApiKey, limit, offset);
    const { error } = await context.supabase.from("exercises").upsert(imported.results, { onConflict: "source,source_id" });
    if (error) throw error;
    await context.supabase
      .from("exercise_import_batches")
      .update({ status: "completed", imported_count: imported.results.length, completed_at: new Date().toISOString() })
      .eq("id", batch.data.id);
    await logExternalApi({ userId: context.user.id, provider: "wger", endpoint: "exerciseinfo", status: "success", request: { limit, offset }, responseStatus: 200 });
    return NextResponse.json({ batchId: batch.data.id, importedCount: imported.results.length, totalAvailable: imported.count, next: imported.next });
  } catch (error) {
    await context.supabase
      .from("exercise_import_batches")
      .update({ status: "failed", error_message: error instanceof Error ? error.message : "Unknown error", completed_at: new Date().toISOString() })
      .eq("id", batch.data.id);
    await logExternalApi({ userId: context.user.id, provider: "wger", endpoint: "exerciseinfo", status: "error", request: { limit, offset }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "wger import failed.", 400);
  }
}
