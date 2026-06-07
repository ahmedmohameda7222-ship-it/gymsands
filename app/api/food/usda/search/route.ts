import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { searchUsdaFoods } from "@/lib/integrations/usda";

export async function GET(request: Request) {
  const limited = rateLimit(request, "usda-search");
  if (limited) return limited;
  const missing = requireServerKeys("USDA FoodData Central", [["USDA_API_KEY", serverEnv.usdaApiKey]]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return jsonError("Search query is required.");

  try {
    const foods = await searchUsdaFoods(query, serverEnv.usdaApiKey);
    await logExternalApi({ userId: context.user.id, provider: "usda", endpoint: "foods/search", status: "success", request: { query }, responseStatus: 200 });
    return NextResponse.json({ foods });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "usda", endpoint: "foods/search", status: "error", request: { query }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "USDA search failed.", 400);
  }
}
