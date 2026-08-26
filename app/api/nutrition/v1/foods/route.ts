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

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = await request.json().catch(() => ({})) as { foodId?: unknown; favorite?: unknown };
    if (typeof body.foodId !== "string" || typeof body.favorite !== "boolean") {
      return nutritionJson({ error: "foodId and favorite are required." }, { status: 400 });
    }
    return nutritionJson(await setFoodFavorite(context.supabase, context.user.id, body.foodId, body.favorite));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
