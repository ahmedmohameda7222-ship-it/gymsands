import { NextResponse } from "next/server";

import { barcodeValidationMessage, normalizeProductBarcode } from "@/lib/barcodes";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { createSupabaseServerClient, jsonError, requireEligibleUser } from "@/lib/integrations/env";
import { lookupOpenFoodFactsBarcode, type NormalizedFood } from "@/lib/integrations/open-food-facts";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { resolveFoodBarcode } from "@/services/nutrition-v1/server/barcode-lookup";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";
import { resolveFoodHandoffWithAuthorities, type CatalogServingChoice } from "@/services/nutrition-v1/server/food-handoff";

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMealType(value: unknown) {
  const meal = String(value ?? "Breakfast");
  return ["Breakfast", "Lunch", "Snack", "Dinner"].includes(meal) ? meal : "Breakfast";
}

function providerFoodPayload(food: NormalizedFood, userId: string) {
  return {
    user_id: userId,
    food_name: food.name,
    serving_size: food.serving_size || "1 serving",
    calories: nullableNumber(food.calories),
    protein_g: nullableNumber(food.protein),
    carbs_g: nullableNumber(food.carbs),
    fat_g: nullableNumber(food.fat),
    category: "Packaged",
    cuisine: "Packaged foods",
    fiber_g: nullableNumber(food.fiber),
    sugar_g: nullableNumber(food.sugar),
    sodium_mg: nullableNumber(food.sodium),
    tags: ["barcode", "provider-suggestion", "open-food-facts"],
    notes: `Barcode: ${food.barcode ?? food.source_id ?? ""}${food.brand ? ` | Brand: ${food.brand}` : ""}`
  };
}

function scale(value: number | null, quantity: number) {
  return value === null ? null : Math.round(value * quantity * 10) / 10;
}

function providerScaledMacros(food: NormalizedFood, quantity: number) {
  return {
    calories: scale(nullableNumber(food.calories), quantity),
    protein_g: scale(nullableNumber(food.protein), quantity),
    carbs_g: scale(nullableNumber(food.carbs), quantity),
    fat_g: scale(nullableNumber(food.fat), quantity)
  };
}

function publicProviderFood(food: NormalizedFood) {
  return {
    source: "provider_suggestion" as const,
    name: food.name,
    brand: food.brand ?? null,
    barcode: food.barcode ?? food.source_id ?? null,
    servingSize: food.serving_size ?? null,
    calories: nullableNumber(food.calories),
    protein: nullableNumber(food.protein),
    carbs: nullableNumber(food.carbs),
    fat: nullableNumber(food.fat),
    verified: false
  };
}

function publicCatalogFood(food: FoodLibraryCandidate, servingChoices: CatalogServingChoice[]) {
  return {
    source: "catalog" as const,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    barcode: null,
    servingSize: servingChoices.length === 1 ? servingChoices[0]!.label : null,
    servingChoices,
    calories: food.nutrition.calories,
    protein: food.nutrition.protein_g,
    carbs: food.nutrition.carbs_g,
    fat: food.nutrition.fat_g,
    verified: food.verified,
    locale: food.locale
  };
}

async function resolveBarcodeRequest(
  context: Exclude<Awaited<ReturnType<typeof requireEligibleUser>>, NextResponse>,
  rawBarcode: string,
  languageTag: string,
) {
  const catalogSupabase = createSupabaseServerClient(null, true);
  const result = await resolveFoodBarcode(
    context.supabase,
    catalogSupabase,
    context.user.id,
    rawBarcode,
    languageTag,
    lookupOpenFoodFactsBarcode,
  );
  if (result.kind === "provider_suggestion") {
    await logExternalApi({
      userId: context.user.id,
      provider: "open_food_facts",
      endpoint: "product",
      status: "success",
      request: { barcode: result.barcode },
      responseStatus: 200
    });
  }
  return result;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "open-food-facts");
  if (limited) return limited;
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return context;

  const url = new URL(request.url);
  const rawBarcode = url.searchParams.get("barcode")?.trim() ?? "";
  const barcode = normalizeProductBarcode(rawBarcode);
  if (!barcode) return jsonError(barcodeValidationMessage(rawBarcode));
  const languageTag = url.searchParams.get("locale")?.trim() || "en";

  try {
    const resolved = await resolveBarcodeRequest(context, barcode, languageTag);
    return NextResponse.json({
      kind: resolved.kind,
      food: resolved.kind === "catalog"
        ? publicCatalogFood(resolved.food, resolved.selection.servingChoices)
        : publicProviderFood(resolved.food)
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Barcode lookup failed.", 400);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "open-food-facts-save");
  if (limited) return limited;
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const rawBarcode = String(body.barcode ?? "").trim();
  const barcode = normalizeProductBarcode(rawBarcode);
  if (!barcode) return jsonError(barcodeValidationMessage(rawBarcode));
  const saveToLibrary = body.saveToLibrary === true;
  const addToLog = Boolean(body.addToLog);
  const addToMealPlan = Boolean(body.addToMealPlan);
  const mealType = normalizeMealType(body.mealType);
  const quantity = Math.max(0.1, Number(body.quantity ?? 1) || 1);
  const date = String(body.date ?? todayIso()).slice(0, 10);
  const languageTag = typeof body.locale === "string" && body.locale.trim() ? body.locale.trim() : "en";

  try {
    const resolved = await resolveBarcodeRequest(context, barcode, languageTag);
    let libraryFood = null;
    let log = null;
    let mealPlanItem = null;

    if (resolved.kind === "catalog") {
      const choices = resolved.selection.servingChoices;
      if (choices.length === 0) {
        throw new Error("No authoritative serving is available yet.");
      }
      const requestedServing = typeof body.serving === "string" ? body.serving.trim() : "";
      const requestedServingOptionId = typeof body.servingOptionId === "string" && body.servingOptionId.trim()
        ? body.servingOptionId.trim()
        : null;
      let selectedServing: CatalogServingChoice;
      if (!requestedServing && requestedServingOptionId === null) {
        if (choices.length !== 1) {
          throw new Error("Choose an authoritative serving before logging this barcode Food.");
        }
        selectedServing = choices[0]!;
      } else {
        const matches = choices.filter((choice) => (
          choice.label === requestedServing
          && choice.servingOptionId === requestedServingOptionId
        ));
        if (matches.length !== 1) {
          throw new Error("The requested barcode serving is not an exact effective serving choice.");
        }
        selectedServing = matches[0]!;
      }

      const catalogSupabase = createSupabaseServerClient(null, true);
      const handoff = await resolveFoodHandoffWithAuthorities(context.supabase, catalogSupabase, context.user.id, {
        foodId: resolved.food.id,
        source: "catalog",
        quantity,
        serving: selectedServing.label,
        servingOptionId: selectedServing.servingOptionId,
        displayName: resolved.food.name,
        languageTag: resolved.food.locale,
      });

      if (addToLog) {
        const inserted = await context.supabase
          .from("food_logs")
          .insert({
            user_id: context.user.id,
            food_item_id: handoff.diaryItem.foodItemId,
            user_food_item_id: null,
            log_date: date,
            meal_type: mealType,
            food_name: handoff.diaryItem.foodName,
            serving_size: handoff.diaryItem.servingLabel,
            quantity: handoff.diaryItem.quantity,
            calories: handoff.diaryItem.nutrition.caloriesKcal,
            protein_g: handoff.diaryItem.nutrition.proteinG,
            carbs_g: handoff.diaryItem.nutrition.carbsG,
            fat_g: handoff.diaryItem.nutrition.fatG,
            notes: `Barcode: ${barcode}`
          })
          .select("*")
          .single();
        if (inserted.error) throw inserted.error;
        log = inserted.data;
      }

      if (addToMealPlan) {
        const inserted = await context.supabase
          .from("user_meal_plan_items")
          .insert({
            user_id: context.user.id,
            food_item_id: handoff.foodId,
            user_food_item_id: null,
            plan_date: date,
            meal_type: mealType,
            food_name: handoff.name,
            serving_size: handoff.serving,
            quantity: handoff.quantity,
            calories: handoff.frozenNutrition.calories,
            protein_g: handoff.frozenNutrition.protein_g,
            carbs_g: handoff.frozenNutrition.carbs_g,
            fat_g: handoff.frozenNutrition.fat_g,
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

      return NextResponse.json({
        kind: resolved.kind,
        food: publicCatalogFood(resolved.food, resolved.selection.servingChoices),
        libraryFood,
        log,
        mealPlanItem
      });
    }

    const food = resolved.food;
    const payload = providerFoodPayload(food, context.user.id);

    if (saveToLibrary) {
      const existing = await context.supabase
        .from("user_food_items")
        .select("*")
        .eq("user_id", context.user.id)
        .eq("food_name", payload.food_name)
        .eq("serving_size", payload.serving_size)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const saved = existing.data
        ? await context.supabase.from("user_food_items").update(payload).eq("id", existing.data.id).select("*").single()
        : await context.supabase.from("user_food_items").insert(payload).select("*").single();
      if (saved.error) throw saved.error;
      libraryFood = saved.data;
    }

    const macros = providerScaledMacros(food, quantity);
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
          notes: `Barcode provider suggestion: ${barcode}`
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      log = inserted.data;
    }

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
          notes: `Barcode provider suggestion: ${barcode}`
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      mealPlanItem = inserted.data;
    }

    await logExternalApi({
      userId: context.user.id,
      provider: "open_food_facts",
      endpoint: "product_save",
      status: "success",
      request: { barcode, saveToLibrary, addToLog, addToMealPlan },
      responseStatus: 200
    });
    return NextResponse.json({
      kind: resolved.kind,
      food: publicProviderFood(food),
      libraryFood,
      log,
      mealPlanItem
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Barcode food save failed.", 400);
  }
}
