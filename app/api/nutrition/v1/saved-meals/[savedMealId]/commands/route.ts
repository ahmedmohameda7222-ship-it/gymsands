import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { purgeSavedMealNow, restoreSavedMeal } from "@/services/nutrition-v1/server/saved-meals";

export async function POST(request: Request, { params }: { params: Promise<{ savedMealId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { savedMealId } = await params;
    const body = await request.json().catch(() => ({})) as { operation?: unknown };
    if (body.operation === "restore") return nutritionJson(await restoreSavedMeal(context.supabase, savedMealId));
    if (body.operation === "purge") return nutritionJson(await purgeSavedMealNow(context.supabase, savedMealId));
    throw new NutritionRequestError("Unsupported Saved Meal lifecycle command.");
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
