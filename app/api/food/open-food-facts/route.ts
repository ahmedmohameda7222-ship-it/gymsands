import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireUser } from "@/lib/integrations/env";
import { lookupOpenFoodFactsBarcode, type NormalizedFood } from "@/lib/integrations/open-food-facts";
import { rateLimit } from "@/lib/integrations/rate-limit";

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMealType(value: unknown) {
  const meal = String(value ?? "Breakfast");
  return ["Breakfast", "Lunch", "Snack", "Dinner"].includes(meal) ? meal : "Breakfast";
}

function foodPayload(food: NormalizedFood, userId: string) {
  return {
    user_id: userId,
    food_name: food.name,
    serving_size: food.serving_size || "1 serving",
    calories: numberValue(food.calories),
    protein_g: numberValue(food.protein),
    carbs_g: numberValue(food.carbs),
    fat_g: numberValue(food.fat),
    category: "Packaged",
    cuisine: "Packaged foods",
    fiber_g: food.fiber === null || food.fiber === undefined ? null : numberValue(food.fiber),
    sugar_g: food.sugar === null || food.sugar === undefined ? null : numberValue(food.sugar),
    sodium_mg: food.sodium === null || food.sodium === undefined ? null : numberValue(food.sodium),
    tags: ["barcode", "open-food-facts"],
    notes: `Barcode: ${food.barcode ?? food.source_id ?? ""}${food.brand ? ` | Brand: ${food.brand}` : ""}`
  };
}

function scaledMacros(food: NormalizedFood, quantity: number) {
  return {
    calories: Math.round(numberValue(food.calories) * quantity),
    protein_g: Math.round(numberValue(food.protein) * quantity * 10) / 10,
    carbs_g: Math.round(numberValue(food.carbs) * quantity * 10) / 10,
    fat_g: Math.round(numberValue(food.fat) * quantity * 10) / 10
  };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "open-food-facts");
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode) return jsonError("Barcode is required.");

  try {
    const food = await lookupOpenFoodFactsBarcode(barcode);
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product", status: "success", request: { barcode }, responseStatus: 200 });
    return NextResponse.json({ food });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product", status: "error", request: { barcode }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Open Food Facts lookup failed.", 400);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "open-food-facts-save");
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const barcode = String(body.barcode ?? "").trim();
  if (!barcode) return jsonError("Barcode is required.");
  const saveToLibrary = body.saveToLibrary !== false;
  const addToLog = Boolean(body.addToLog);
  const addToMealPlan = Boolean(body.addToMealPlan);
  const mealType = normalizeMealType(body.mealType);
  const quantity = Math.max(0.1, Number(body.quantity ?? 1) || 1);
  const date = String(body.date ?? todayIso()).slice(0, 10);

  try {
    const food = await lookupOpenFoodFactsBarcode(barcode);
    const payload = foodPayload(food, context.user.id);
    let libraryFood = null;

    if (saveToLibrary) {
      const existing = await context.supabase
        .from("user_food_items")
        .select("*")
        .eq("user_id", context.user.id)
        .eq("food_name", payload.food_name)
        .eq("serving_size", payload.serving_size)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const request = existing.data
        ? context.supabase.from("user_food_items").update(payload).eq("id", existing.data.id).select("*").single()
        : context.supabase.from("user_food_items").insert(payload).select("*").single();
      const savedFood = await request;
      if (savedFood.error) throw savedFood.error;
      libraryFood = savedFood.data;
    }

    const macros = scaledMacros(food, quantity);
    let log = null;
    if (addToLog) {
      const inserted = await context.supabase
        .from("food_logs")
        .insert({
          user_id: context.user.id,
          user_food_item_id: libraryFood?.id ?? null,
          food_item_id: null,
          log_date: date,
          meal_type: mealType,
          food_name: food.name,
          serving_size: food.serving_size || "1 serving",
          quantity,
          ...macros,
          notes: `Barcode: ${barcode}`
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      log = inserted.data;
    }

    let mealPlanItem = null;
    if (addToMealPlan) {
      const inserted = await context.supabase
        .from("user_meal_plan_items")
        .insert({
          user_id: context.user.id,
          user_food_item_id: libraryFood?.id ?? null,
          food_item_id: null,
          plan_date: date,
          meal_type: mealType,
          food_name: food.name,
          serving_size: food.serving_size || "1 serving",
          quantity,
          ...macros,
          status: "planned",
          food_log_id: null,
          completed_at: null,
          notes: `Barcode: ${barcode}`
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      mealPlanItem = inserted.data;
    }

    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product_save", status: "success", request: { barcode, saveToLibrary, addToLog, addToMealPlan }, responseStatus: 200 });
    return NextResponse.json({ food, libraryFood, log, mealPlanItem });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "open_food_facts", endpoint: "product_save", status: "error", request: { barcode }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Open Food Facts food save failed.", 400);
  }
}
