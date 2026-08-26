import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { restoreRecipe } from "@/services/nutrition-v1/server/recipes";

export async function POST(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    return nutritionJson(await restoreRecipe(context.supabase, recipeId));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
