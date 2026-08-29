import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";

export async function GET(request: Request, { params }: { params: Promise<{ foodId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { foodId } = await params;
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const serving = url.searchParams.get("serving");
    const quantity = Number(url.searchParams.get("quantity"));
    if (source !== "catalog" && source !== "my_food") throw new NutritionRequestError("Food source is invalid.");
    if (!serving?.trim()) throw new NutritionRequestError("Resolved serving is required.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new NutritionRequestError("Resolved quantity is invalid.");
    return nutritionJson(await resolveFoodHandoff(context.supabase, context.user.id, { foodId, source, serving, quantity }));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
