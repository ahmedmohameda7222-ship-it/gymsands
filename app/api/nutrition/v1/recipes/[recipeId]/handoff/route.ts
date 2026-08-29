import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

export async function GET(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    const search = new URL(request.url).searchParams;
    const recipeVersionId = search.get("recipeVersionId");
    if (!recipeVersionId) throw new NutritionRequestError("Recipe version is required.");
    const rawQuantity = search.get("quantity");
    const quantity = rawQuantity === null || rawQuantity.trim() === "" ? 1 : Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new NutritionRequestError("Recipe serving quantity must be greater than zero.");
    return nutritionJson(await resolveRecipeHandoff(context.supabase, context.user.id, recipeId, recipeVersionId, quantity));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
