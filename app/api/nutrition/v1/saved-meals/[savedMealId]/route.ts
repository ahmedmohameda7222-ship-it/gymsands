import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { canonicalizeSavedMealItems } from "@/services/nutrition-v1/server/saved-meal-write-authority";
import {
  resolveSavedMealBundleSnapshot,
  softDeleteSavedMeal,
  updateSavedMeal,
  type SavedMealItemInput,
} from "@/services/nutrition-v1/server/saved-meals";

function bodyObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NutritionRequestError("Saved Meal payload must be an object.");
  return value as Record<string, unknown>;
}

export async function GET(request: Request, { params }: { params: Promise<{ savedMealId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { savedMealId } = await params;
    const root = await context.supabase
      .from("nutrition_saved_meals")
      .select("id,name,note,is_favorite,deleted_at,purge_after,created_at,updated_at")
      .eq("id", savedMealId)
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (root.error) throw new Error(`Saved Meal could not be loaded. ${root.error.message ?? "Database request failed."}`);
    if (!root.data) throw new NutritionRequestError("Saved Meal was not found.", 404);
    if (root.data.deleted_at) return nutritionJson({ savedMeal: root.data, bundle: null });
    const bundle = await resolveSavedMealBundleSnapshot(context.supabase, context.user.id, savedMealId);
    return nutritionJson({ savedMeal: root.data, bundle });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ savedMealId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { savedMealId } = await params;
    const body = bodyObject(await request.json().catch(() => ({})));
    if (typeof body.name !== "string") throw new NutritionRequestError("Saved Meal name is required.");
    if (!Array.isArray(body.items)) throw new NutritionRequestError("Saved Meal items are required.");
    const items = await canonicalizeSavedMealItems(context.supabase, context.user.id, body.items as SavedMealItemInput[]);
    const savedMeal = await updateSavedMeal(context.supabase, context.user.id, savedMealId, {
      name: body.name,
      note: typeof body.note === "string" ? body.note : null,
      isFavorite: body.isFavorite === true,
      items,
    });
    return nutritionJson({ savedMeal });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ savedMealId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { savedMealId } = await params;
    return nutritionJson(await softDeleteSavedMeal(context.supabase, savedMealId));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
