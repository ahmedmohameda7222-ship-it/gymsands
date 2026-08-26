import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { createRecipeDraft } from "@/services/nutrition-v1/server/recipes";
import { listRecipeHome, listRecentlyDeletedRecipes } from "@/services/nutrition-v1/server/recipe-workspace";

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("deleted") === "true") {
      return nutritionJson({ recipes: await listRecentlyDeletedRecipes(context.supabase, context.user.id, Number(url.searchParams.get("limit") || 20)) });
    }
    return nutritionJson({ recipes: await listRecipeHome(context.supabase, context.user.id, { query: url.searchParams.get("q") ?? "", limit: Number(url.searchParams.get("limit") || 24) }) });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = await request.json().catch(() => ({})) as { name?: unknown };
    const created = await createRecipeDraft(context.supabase, context.user.id, { name: typeof body.name === "string" ? body.name : null });
    return nutritionJson({ recipeId: created.recipeId, draftId: created.draftId }, { status: 201 });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
