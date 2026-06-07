import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { parseNutritionixExercise } from "@/lib/integrations/nutritionix";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "nutritionix-exercise");
  if (limited) return limited;
  const missing = requireServerKeys("Nutritionix", [
    ["NUTRITIONIX_APP_ID", serverEnv.nutritionixAppId],
    ["NUTRITIONIX_API_KEY", serverEnv.nutritionixApiKey]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? "").trim();
  if (!query) return jsonError("Exercise query is required.");

  try {
    const result = await parseNutritionixExercise(query, serverEnv.nutritionixAppId, serverEnv.nutritionixApiKey);
    if (body.save && Array.isArray(result.exercises)) {
      const rows = result.exercises.map((item: any, index: number) => ({
        user_id: context.user.id,
        provider: "nutritionix",
        provider_activity_id: `manual-${Date.now()}-${index}`,
        activity_type: item.name,
        title: query,
        duration_seconds: Number(item.duration_min ?? 0) * 60,
        calories: item.nf_calories ?? null,
        raw_data: item
      }));
      if (rows.length) await context.supabase.from("imported_cardio_activities").insert(rows);
    }
    await logExternalApi({ userId: context.user.id, provider: "nutritionix", endpoint: "natural/exercise", status: "success", request: { query }, responseStatus: 200 });
    return NextResponse.json({ result });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "nutritionix", endpoint: "natural/exercise", status: "error", request: { query }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Nutritionix exercise parse failed.", 400);
  }
}
