import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { getUsdaFoodDetail } from "@/lib/integrations/usda";

export async function GET(request: Request) {
  const limited = rateLimit(request, "usda-detail");
  if (limited) return limited;
  const missing = requireServerKeys("USDA FoodData Central", [["USDA_API_KEY", serverEnv.usdaApiKey]]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const fdcId = new URL(request.url).searchParams.get("fdcId")?.trim();
  if (!fdcId) return jsonError("fdcId is required.");

  try {
    const food = await getUsdaFoodDetail(fdcId, serverEnv.usdaApiKey);
    await logExternalApi({ userId: context.user.id, provider: "usda", endpoint: "food/detail", status: "success", request: { fdcId }, responseStatus: 200 });
    return NextResponse.json({ food });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "usda", endpoint: "food/detail", status: "error", request: { fdcId }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "USDA detail lookup failed.", 400);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "usda-save");
  if (limited) return limited;
  const missing = requireServerKeys("USDA FoodData Central", [["USDA_API_KEY", serverEnv.usdaApiKey]]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const body = await request.json().catch(() => ({}));
  const fdcId = String(body.fdcId ?? "").trim();
  if (!fdcId) return jsonError("fdcId is required.");

  try {
    const food = await getUsdaFoodDetail(fdcId, serverEnv.usdaApiKey);
    const { data, error } = await context.supabase.from("imported_foods").insert({ ...food, user_id: context.user.id }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ food: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "USDA food save failed.", 400);
  }
}
