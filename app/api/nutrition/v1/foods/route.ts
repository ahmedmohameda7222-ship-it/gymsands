import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import {
  listFoodLibrary,
  setFoodFavorite,
  type FoodLibraryLocale,
  type FoodLibraryNumericFilter,
  type FoodLibraryPreset,
} from "@/services/nutrition-v1/server/food-library";
import {
  createUserFood,
  deleteUserFood,
  setFoodPersonalCorrection,
  updateUserFood,
  type PersonalCorrectionInput,
  type UserFoodWriteInput,
} from "@/services/nutrition-v1/server/user-foods";

function locale(value: string | null): FoodLibraryLocale {
  return value === "de" || value === "ar" ? value : "en";
}

function numberFilter(value: string | null, operator: "gte" | "lte"): FoodLibraryNumericFilter | undefined {
  if (value === null || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? { operator, value: number } : undefined;
}

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const url = new URL(request.url);
    const presets = url.searchParams.getAll("preset").filter((value): value is FoodLibraryPreset => value === "high-protein" || value === "low-carb");
    const scope = url.searchParams.get("scope");
    const page = await listFoodLibrary(context.supabase, context.user.id, {
      query: url.searchParams.get("q") ?? "",
      locale: locale(url.searchParams.get("locale")),
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit") || 20),
      category: url.searchParams.get("category"),
      cuisine: url.searchParams.get("cuisine"),
      scope: scope === "favorites" || scope === "recent" || scope === "my_food" ? scope : "all",
      presets,
      protein: numberFilter(url.searchParams.get("proteinMin"), "gte"),
      carbs: numberFilter(url.searchParams.get("carbsMax"), "lte"),
    });
    return nutritionJson(page);
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

type FoodMutationBody = {
  operation?: unknown;
  foodId?: unknown;
  favorite?: unknown;
  input?: unknown;
};

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = await request.json().catch(() => ({})) as FoodMutationBody;
    if (body.operation === "custom_food_create") {
      return nutritionJson(await createUserFood(context.supabase, context.user.id, (body.input ?? {}) as UserFoodWriteInput));
    }
    if (body.operation === "custom_food_update") {
      return nutritionJson(await updateUserFood(context.supabase, context.user.id, (body.input ?? {}) as UserFoodWriteInput));
    }
    if (body.operation === "custom_food_delete") {
      const input = (body.input ?? {}) as { foodId?: unknown };
      if (typeof input.foodId !== "string") return nutritionJson({ error: "foodId is required." }, { status: 400 });
      return nutritionJson(await deleteUserFood(context.supabase, context.user.id, input.foodId));
    }
    if (body.operation === "personal_correction") {
      return nutritionJson(await setFoodPersonalCorrection(context.supabase, context.user.id, (body.input ?? {}) as PersonalCorrectionInput));
    }
    if (typeof body.foodId !== "string" || typeof body.favorite !== "boolean") {
      return nutritionJson({ error: "foodId and favorite are required." }, { status: 400 });
    }
    return nutritionJson(await setFoodFavorite(context.supabase, context.user.id, body.foodId, body.favorite));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
