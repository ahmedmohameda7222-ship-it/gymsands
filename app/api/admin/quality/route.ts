import { NextResponse } from "next/server";

import { developmentDatabaseDetails, friendlyDatabaseWarning } from "@/lib/admin/migration-safety";
import { createSupabaseServerClient, requireAdmin } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { getCurrentGenerationQuality } from "@/services/food-catalog/server/current-generation-quality";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin-quality", 30, 60_000);
  if (limited) return limited;

  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const catalogSupabase = createSupabaseServerClient(null, true);
  const [foodQualityResult, exercises, batches] = await Promise.all([
    getCurrentGenerationQuality(catalogSupabase)
      .then((data) => ({ data, error: null as Error | null }))
      .catch((error) => ({ data: null, error: error instanceof Error ? error : new Error("Food quality read failed.") })),
    context.supabase.from("exercises").select("name,video_url").eq("is_global", true).limit(5000),
    context.supabase.from("exercise_import_batches").select("status").limit(500)
  ]);

  const exerciseRows = exercises.error ? [] : exercises.data ?? [];
  const batchRows = batches.error ? [] : batches.data ?? [];
  const foodQuality = foodQualityResult.data;

  const warnings = [
    foodQualityResult.error ? `Food quality data: ${foodQualityResult.error.message}` : null,
    foodQuality && !foodQuality.available ? "Food quality data: no current promoted Food Catalog generation." : null,
    friendlyDatabaseWarning("Exercise quality data", exercises.error),
    friendlyDatabaseWarning("Import quality data", batches.error)
  ].filter((warning): warning is string => Boolean(warning));

  return NextResponse.json({
    food_catalog_generation_id: foodQuality?.generationId ?? null,
    active_catalog_foods: foodQuality?.activeFoodCount ?? null,
    foods_missing_macros: foodQuality?.foodsMissingMacros ?? null,
    missing_exercise_videos: exerciseRows.filter((exercise) => !exercise.video_url).length,
    duplicate_food_names: foodQuality?.duplicateSelectedNames ?? null,
    failed_import_rows: batchRows.filter((batch) => batch.status === "failed").length,
    warnings,
    debug_warnings: developmentDatabaseDetails([
      foodQualityResult.error,
      exercises.error,
      batches.error
    ].filter(Boolean))
  });
}
