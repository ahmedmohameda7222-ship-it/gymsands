import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

export async function GET(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    const recipeVersionId = new URL(request.url).searchParams.get("recipeVersionId");
    if (!recipeVersionId) throw new NutritionRequestError("Recipe version is required.");
    return nutritionJson(await resolveRecipeHandoff(context.supabase, context.user.id, recipeId, recipeVersionId));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
