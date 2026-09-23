import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveFoodHandoff, type FoodHandoffInput } from "@/services/nutrition-v1/server/food-handoff";

export async function GET(request: Request, { params }: { params: Promise<{ foodId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { foodId } = await params;
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const serving = url.searchParams.get("serving");
    const selectedName = url.searchParams.get("selectedName");
    const languageTag = url.searchParams.get("languageTag")?.trim() || null;
    const quantity = Number(url.searchParams.get("quantity"));
    if (source !== "catalog" && source !== "my_food") throw new NutritionRequestError("Food source is invalid.");
    if (!serving?.trim()) throw new NutritionRequestError("Resolved serving is required.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new NutritionRequestError("Resolved quantity is invalid.");
    const input: FoodHandoffInput = source === "catalog"
      ? {
          foodId,
          source,
          serving,
          quantity,
          selectedName: selectedName?.trim() || (() => { throw new NutritionRequestError("Selected Food name is required."); })(),
          languageTag,
        }
      : { foodId, source, serving, quantity };
    return nutritionJson(await resolveFoodHandoff(context.supabase, context.user.id, input));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
