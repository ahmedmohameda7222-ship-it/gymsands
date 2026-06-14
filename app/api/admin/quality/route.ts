import { NextResponse } from "next/server";
import { developmentDatabaseDetails, friendlyDatabaseWarning } from "@/lib/admin/migration-safety";
import { requireAdmin } from "@/lib/integrations/env";

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const [foods, exercises, batches] = await Promise.all([
    context.supabase.from("food_items").select("food_name,calories,protein_g,carbs_g,fat_g").limit(5000),
    context.supabase.from("exercises").select("name,video_url").eq("is_global", true).limit(5000),
    context.supabase.from("exercise_import_batches").select("status").limit(500)
  ]);

  const foodRows = foods.error ? [] : foods.data ?? [];
  const exerciseRows = exercises.error ? [] : exercises.data ?? [];
  const batchRows = batches.error ? [] : batches.data ?? [];
  const foodNames = new Map<string, number>();
  foodRows.forEach((food) => {
    const key = String(food.food_name ?? "").trim().toLowerCase();
    if (key) foodNames.set(key, (foodNames.get(key) ?? 0) + 1);
  });

  const warnings = [
    friendlyDatabaseWarning("Food quality data", foods.error),
    friendlyDatabaseWarning("Exercise quality data", exercises.error),
    friendlyDatabaseWarning("Import quality data", batches.error)
  ].filter((warning): warning is string => Boolean(warning));

  return NextResponse.json({
    foods_missing_macros: foodRows.filter((food) => [food.calories, food.protein_g, food.carbs_g, food.fat_g].some((value) => value === null || value === undefined)).length,
    missing_exercise_videos: exerciseRows.filter((exercise) => !exercise.video_url).length,
    duplicate_food_names: Array.from(foodNames.values()).filter((count) => count > 1).length,
    failed_import_rows: batchRows.filter((batch) => batch.status === "failed").length,
    warnings,
    debug_warnings: developmentDatabaseDetails([foods.error, exercises.error, batches.error].filter(Boolean))
  });
}
