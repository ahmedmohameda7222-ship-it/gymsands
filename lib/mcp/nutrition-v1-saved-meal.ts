import type { McpContext } from "@/lib/mcp/auth";
import { deriveMcpMutationOperationId } from "@/lib/mcp/idempotency";
import { asObject, getArray, getOptionalString, getString, type JsonObject } from "@/lib/mcp/schemas";
import { fail, ok, type McpToolResult } from "@/lib/mcp/tool-helpers";
import {
  resolveCatalogNewUseSelectionForMcp,
  resolveFoodHandoffForMcp,
  type ResolvedFoodHandoff,
} from "@/services/nutrition-v1/server/food-handoff";
import { listFoodLibraryForMcp, normalizeFoodSearchText } from "@/services/nutrition-v1/server/food-library";
import { createSavedMeal } from "@/services/nutrition-v1/server/saved-meals";

function positive(value: unknown) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("quantity must be greater than 0.");
  return parsed;
}

async function resolveCanonicalFood(ctx: McpContext, item: JsonObject) {
  const foodName = getString(item, "food_name").trim();
  const requestedServing = getOptionalString(item, "serving_hint")?.trim() || null;
  const requestedServingOptionId = getOptionalString(item, "serving_option_id")?.trim() || null;
  const normalizedName = normalizeFoodSearchText(foodName);
  const page = await listFoodLibraryForMcp(ctx.supabase, ctx.connectionId, {
    query: foodName,
    locale: "en",
    limit: 20,
  });
  const exact = page.items.filter((candidate) => normalizeFoodSearchText(candidate.name) === normalizedName);
  if (exact.length !== 1) {
    throw new Error(
      exact.length === 0
        ? `No unique canonical Food matches “${foodName}”. Search Foods first and use an exact canonical Food name.`
        : `Food “${foodName}” is ambiguous. Search Foods first and use a unique canonical Food name.`,
    );
  }
  const selected = exact[0]!;
  const quantity = positive(item.quantity);

  if (selected.source === "catalog") {
    if (!selected.locale?.trim()) {
      throw new Error(`Canonical Food “${foodName}” is missing its exact selected Name locale. Search Foods again before creating a Saved Meal.`);
    }

    // Owner Personal Override authority is derived again in the database
    // from the verified MCP connection; global generation reads remain service authority.
    const selection = await resolveCatalogNewUseSelectionForMcp(
      ctx.supabase,
      ctx.connectionId,
      ctx.userId,
      {
        foodId: selected.id,
        displayName: selected.name,
        languageTag: selected.locale,
      },
    );
    const choices = selection.servingChoices;
    if (choices.length === 0) {
      throw new Error(`Canonical Food “${foodName}” has no authoritative serving available yet.`);
    }

    let servingChoice: (typeof choices)[number] | null = null;
    if (requestedServingOptionId) {
      if (!requestedServing) {
        throw new Error("serving_option_id must be paired with the exact serving_hint label.");
      }
      const matches = choices.filter((choice) => (
        choice.servingOptionId === requestedServingOptionId
        && choice.label === requestedServing
      ));
      if (matches.length !== 1) {
        throw new Error("The serving_option_id and serving_hint do not match one exact effective authoritative serving choice.");
      }
      servingChoice = matches[0]!;
    } else if (requestedServing) {
      const matches = choices.filter((choice) => choice.label === requestedServing);
      if (matches.length === 0) {
        throw new Error("The serving_hint does not match an effective authoritative serving choice.");
      }
      if (matches.length > 1) {
        throw new Error("Multiple authoritative servings share this label. Retry with serving_option_id plus the same serving_hint.");
      }
      servingChoice = matches[0]!;
    } else if (choices.length === 1) {
      servingChoice = choices[0]!;
    } else {
      throw new Error("This Food has multiple authoritative serving choices. Choose one and retry with serving_hint and serving_option_id.");
    }

    return resolveFoodHandoffForMcp(ctx.supabase, ctx.connectionId, ctx.userId, {
      foodId: selected.id,
      source: "catalog",
      quantity,
      serving: servingChoice.label,
      servingOptionId: servingChoice.servingOptionId,
      displayName: selected.name,
      languageTag: selected.locale,
    });
  }

  if (requestedServingOptionId) {
    throw new Error("serving_option_id is only valid for Catalog Food serving choices.");
  }
  const personalServing = selected.servingLabel?.trim();
  if (!personalServing) {
    throw new Error(`Personal Food “${foodName}” has no serving.`);
  }
  if (requestedServing && requestedServing !== personalServing) {
    throw new Error("The serving_hint does not match the selected Personal Food serving.");
  }
  return resolveFoodHandoffForMcp(ctx.supabase, ctx.connectionId, ctx.userId, {
    foodId: selected.id,
    source: "my_food",
    quantity,
    serving: personalServing,
    displayName: undefined,
    languageTag: null,
  });
}

function publicSavedMealItem(item: ResolvedFoodHandoff) {
  return {
    ...(item.source === "catalog" ? { food_item_id: item.foodId } : { user_food_item_id: item.foodId }),
    food_name: item.name,
    serving_size: item.serving,
    quantity: item.quantity,
    ...(item.frozenNutrition.calories === null ? {} : { calories: item.frozenNutrition.calories }),
    ...(item.frozenNutrition.protein_g === null ? {} : { protein_g: item.frozenNutrition.protein_g }),
    ...(item.frozenNutrition.carbs_g === null ? {} : { carbs_g: item.frozenNutrition.carbs_g }),
    ...(item.frozenNutrition.fat_g === null ? {} : { fat_g: item.frozenNutrition.fat_g }),
    ...(item.frozenNutrition.fiber_g === null ? {} : { fiber_g: item.frozenNutrition.fiber_g }),
  };
}

export async function createCanonicalSavedMealFromMcp(
  ctx: McpContext,
  rawInput: unknown,
): Promise<McpToolResult> {
  const input = asObject(rawInput);
  const items = getArray<JsonObject>(input, "items");
  if (!items.length) return fail("missing_required_input", "Provide at least one custom meal item.");

  try {
    const operationId = deriveMcpMutationOperationId(ctx, "create_custom_meal", input);
    const resolved: ResolvedFoodHandoff[] = [];
    for (const item of items) resolved.push(await resolveCanonicalFood(ctx, item));
    const savedMeal = await createSavedMeal(ctx.supabase, ctx.userId, {
      operationId,
      name: getString(input, "meal_name"),
      note: getOptionalString(input, "notes") ?? null,
      isFavorite: Boolean(input.is_favorite),
      items: resolved.map((item) => item.savedMealItem),
    });
    return ok({
      ok: true,
      meal: {
        id: savedMeal.id,
        name: savedMeal.name,
        is_favorite: savedMeal.is_favorite === true,
      },
      items: resolved.map(publicSavedMealItem),
      saved_meal_id: savedMeal.id,
      saved_meal: savedMeal,
      item_count: resolved.length,
      authority: "nutrition_saved_meals",
    });
  } catch (error) {
    return fail(
      "canonical_food_required",
      error instanceof Error ? error.message : "Saved Meal could not be created from canonical Food authority.",
    );
  }
}