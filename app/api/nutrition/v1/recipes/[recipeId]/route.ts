import { NextResponse } from "next/server";

import { normalizeOwnedRecipeCoverPath } from "@/lib/nutrition-v1/recipe-cover-path";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse, NutritionRequestError } from "@/services/nutrition-v1/server/errors";
import { duplicatePublishedRecipeAtomically } from "@/services/nutrition-v1/server/recipe-duplicate";
import { autosaveRecipeDraft, softDeleteRecipe } from "@/services/nutrition-v1/server/recipes";
import { getRecipeWorkspace, updateRecipePresentation } from "@/services/nutrition-v1/server/recipe-workspace";
import { getPublishedRecipeDetail } from "@/services/nutrition-v1/server/recipe-published";

export async function GET(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    const published = new URL(request.url).searchParams.get("published") === "true";
    return nutritionJson({ recipe: published ? await getPublishedRecipeDetail(context.supabase, context.user.id, recipeId) : await getRecipeWorkspace(context.supabase, context.user.id, recipeId) });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.operation === "autosave") {
      const draft = body.draft;
      const expectedRevision = Number(body.expectedRevision);
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new NutritionRequestError("Recipe Draft payload is required.");
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new NutritionRequestError("Recipe Working Draft expected revision is required.");
      await autosaveRecipeDraft(context.supabase, context.user.id, recipeId, draft as Parameters<typeof autosaveRecipeDraft>[3], expectedRevision);
      return nutritionJson({ recipe: await getRecipeWorkspace(context.supabase, context.user.id, recipeId) });
    }
    if (body.operation === "presentation") {
      let coverPath: string | null | undefined;
      try {
        coverPath = normalizeOwnedRecipeCoverPath(context.user.id, body.coverPath);
      } catch (error) {
        throw new NutritionRequestError(error instanceof Error ? error.message : "Recipe cover path is invalid.");
      }
      return nutritionJson({ recipe: await updateRecipePresentation(context.supabase, context.user.id, recipeId, {
        favorite: typeof body.favorite === "boolean" ? body.favorite : undefined,
        coverPath,
      }) });
    }
    throw new NutritionRequestError("Unsupported Recipe update operation.");
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.operation !== "duplicate") throw new NutritionRequestError("Unsupported Recipe command.");
    return nutritionJson(await duplicatePublishedRecipeAtomically(context.supabase, context.user.id, recipeId), { status: 201 });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { recipeId } = await params;
    return nutritionJson(await softDeleteRecipe(context.supabase, recipeId));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
