import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { purgeRecipeNow } from "@/services/nutrition-v1/server/recipes";

export async function DELETE(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    return nutritionJson(await purgeRecipeNow(context.supabase, recipeId));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
