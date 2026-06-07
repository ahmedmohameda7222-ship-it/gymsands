import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireUser } from "@/lib/integrations/env";
import { lookupOpenFoodFactsBarcode } from "@/lib/integrations/open-food-facts";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function GET(request: Request) {
  const limited = rateLimit(request, "open-food-facts");
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode) return jsonError("Barcode is required.");

  try {
    const food = await lookupOpenFoodFactsBarcode(barcode);
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product", status: "success", request: { barcode }, responseStatus: 200 });
    return NextResponse.json({ food });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product", status: "error", request: { barcode }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Open Food Facts lookup failed.", 400);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "open-food-facts-save");
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const barcode = String(body.barcode ?? "").trim();
  if (!barcode) return jsonError("Barcode is required.");

  try {
    const food = await lookupOpenFoodFactsBarcode(barcode);
    const { data, error } = await context.supabase
      .from("imported_foods")
      .insert({ ...food, user_id: context.user.id, raw_data: food.raw_data })
      .select("*")
      .single();
    if (error) throw error;
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product_save", status: "success", request: { barcode }, responseStatus: 200 });
    return NextResponse.json({ food: data });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product_save", status: "error", request: { barcode }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Open Food Facts save failed.", 400);
  }
}
