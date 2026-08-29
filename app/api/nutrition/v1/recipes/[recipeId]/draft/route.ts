import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { discardRecipeDraft } from "@/services/nutrition-v1/server/recipes";
import { ensureRecipeWorkingDraft, getRecipeWorkspace } from "@/services/nutrition-v1/server/recipe-workspace";

export async function POST(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    return nutritionJson({ recipe: await ensureRecipeWorkingDraft(context.supabase, context.user.id, recipeId) });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    await discardRecipeDraft(context.supabase, context.user.id, recipeId);
    return nutritionJson({ recipe: await getRecipeWorkspace(context.supabase, context.user.id, recipeId) });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
