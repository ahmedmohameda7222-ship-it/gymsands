import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { parseNutritionixFood } from "@/lib/integrations/nutritionix";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "nutritionix-food");
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
  if (!query) return jsonError("Food query is required.");

  try {
    const result = await parseNutritionixFood(query, serverEnv.nutritionixAppId, serverEnv.nutritionixApiKey);
    await logExternalApi({ userId: context.user.id, provider: "nutritionix", endpoint: "natural/nutrients", status: "success", request: { query }, responseStatus: 200 });
    return NextResponse.json({ result });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "nutritionix", endpoint: "natural/nutrients", status: "error", request: { query }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Nutritionix food parse failed.", 400);
  }
}
