import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { parseEdamamMeal } from "@/lib/integrations/edamam";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "edamam-parse");
  if (limited) return limited;
  const missing = requireServerKeys("Edamam", [
    ["EDAMAM_APP_ID", serverEnv.edamamAppId],
    ["EDAMAM_APP_KEY", serverEnv.edamamAppKey]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Meal text is required.");

  try {
    const analysis = await parseEdamamMeal(text, serverEnv.edamamAppId, serverEnv.edamamAppKey);
    await logExternalApi({ userId: context.user.id, provider: "edamam", endpoint: "nutrition-details", status: "success", request: { text }, responseStatus: 200 });
    return NextResponse.json({ analysis });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "edamam", endpoint: "nutrition-details", status: "error", request: { text }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Edamam parse failed.", 400);
  }
}
