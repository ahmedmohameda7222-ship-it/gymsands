import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { canonicalizeSavedMealItems } from "@/services/nutrition-v1/server/saved-meal-write-authority";
import { createSavedMeal, type SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

function bodyObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NutritionRequestError("Saved Meal payload must be an object.");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new NutritionRequestError(`${label} is required.`);
  return text;
}

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const deleted = new URL(request.url).searchParams.get("deleted") === "true";
    let query = context.supabase
      .from("nutrition_saved_meals")
      .select("id,name,note,is_favorite,deleted_at,purge_after,created_at,updated_at")
      .eq("user_id", context.user.id);
    query = deleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
    const result = await query.order(deleted ? "deleted_at" : "updated_at", { ascending: false }).limit(100);
    if (result.error) throw new Error(`Saved Meals could not be loaded. ${result.error.message ?? "Database request failed."}`);
    return nutritionJson({ savedMeals: result.data ?? [] });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = bodyObject(await request.json().catch(() => ({})));
    const operationId = requiredText(body.operationId, "Operation ID");
    if (typeof body.name !== "string") throw new NutritionRequestError("Saved Meal name is required.");
    if (!Array.isArray(body.items)) throw new NutritionRequestError("Saved Meal items are required.");
    const items = await canonicalizeSavedMealItems(context.supabase, context.user.id, body.items as SavedMealItemInput[]);
    const savedMeal = await createSavedMeal(context.supabase, context.user.id, {
      operationId,
      name: body.name,
      note: typeof body.note === "string" ? body.note : null,
      isFavorite: body.isFavorite === true,
      items,
    });
    return nutritionJson({ savedMeal }, { status: 201 });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
