import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireAdmin, requireServerKeys, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { fetchWgerExercises, type WgerExerciseImport } from "@/lib/integrations/wger";

export async function POST(request: Request) {
  const limited = rateLimit(request, "wger-import", 6, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("wger", [["WGER_API_KEY", serverEnv.wgerApiKey]]);
  if (missing) return missing;
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const batch = await context.supabase
    .from("exercise_import_batches")
    .insert({ source: "wger", status: "running", created_by: context.user.id })
    .select("id")
    .single();
  if (batch.error || !batch.data) return jsonError(batch.error?.message ?? "Could not create import batch.", 400);

  try {
    const results: WgerExerciseImport[] = [];
    let totalAvailable = 0;
    let next: string | null = null;
    let currentOffset = offset;
    let remaining = limit;

    while (remaining > 0) {
      const imported = await fetchWgerExercises(serverEnv.wgerApiKey, Math.min(remaining, 100), currentOffset);
      totalAvailable = imported.count;
      next = imported.next;
      results.push(...imported.results);
      if (!imported.results.length || !imported.next) break;
      currentOffset += Math.min(remaining, 100);
      remaining -= imported.results.length;
    }

    let activatedCount = 0;
    if (results.length) {
      const { data, error } = await context.supabase.from("exercises").upsert(results, {
        onConflict: "source,source_id",
        ignoreDuplicates: true
      }).select("id");
      if (error) throw error;
      activatedCount = data?.length ?? 0;
    }

    await context.supabase
      .from("exercise_import_batches")
      .update({
        status: "completed",
        imported_count: results.length,
        approved_count: activatedCount,
        rejected_count: 0,
        completed_at: new Date().toISOString()
      })
      .eq("id", batch.data.id);
    await logExternalApi({ userId: context.user.id, provider: "wger", endpoint: "exerciseinfo", status: "success", request: { limit, offset }, responseStatus: 200 });
    return NextResponse.json({ batchId: batch.data.id, importedCount: results.length, activatedCount, totalAvailable, next });
  } catch (error) {
    await context.supabase
      .from("exercise_import_batches")
      .update({ status: "failed", error_message: error instanceof Error ? error.message : "Unknown error", completed_at: new Date().toISOString() })
      .eq("id", batch.data.id);
    await logExternalApi({ userId: context.user.id, provider: "wger", endpoint: "exerciseinfo", status: "error", request: { limit, offset }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "wger import failed.", 400);
  }
}
