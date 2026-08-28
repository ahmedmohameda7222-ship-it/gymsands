import { createHash } from "node:crypto";
import type { McpContext } from "@/lib/mcp/auth";
import { asObject, getArray, getOptionalString, getString, type JsonObject } from "@/lib/mcp/schemas";
import { fail, ok, type McpToolResult } from "@/lib/mcp/tool-helpers";
import { resolveFoodHandoff, type ResolvedFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";
import { listFoodLibrary, normalizeFoodSearchText } from "@/services/nutrition-v1/server/food-library";
import { createSavedMeal } from "@/services/nutrition-v1/server/saved-meals";

function positive(value: unknown) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("quantity must be greater than 0.");
  return parsed;
}

function stableSavedMealOperationId(ctx: McpContext, input: JsonObject) {
  const idempotencyKey = getString(input, "idempotency_key").trim();
  const hex = createHash("sha256")
    .update(`${ctx.userId}:${ctx.connectionId}:create_custom_meal:${idempotencyKey}`)
    .digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function resolveCanonicalFood(ctx: McpContext, item: JsonObject) {
  const foodName = getString(item, "food_name").trim();
  const requestedServing = getOptionalString(item, "serving_hint")?.trim() || null;
  const normalizedName = normalizeFoodSearchText(foodName);
  const page = await listFoodLibrary(ctx.supabase, ctx.userId, {
    query: foodName,
    locale: "en",
    limit: 20,
  });
  let exact = page.items.filter((candidate) => normalizeFoodSearchText(candidate.name) === normalizedName);
  if (requestedServing) exact = exact.filter((candidate) => candidate.servingLabel.trim() === requestedServing);
  if (exact.length !== 1) {
    throw new Error(
      exact.length === 0
        ? `No unique canonical Food matches “${foodName}”${requestedServing ? ` with serving “${requestedServing}”` : ""}. Search Foods first and use an exact canonical Food name/serving.`
        : `Food “${foodName}” is ambiguous. Search Foods first and use a unique canonical Food name/serving.`,
    );
  }
  const selected = exact[0]!;
  return resolveFoodHandoff(ctx.supabase, ctx.userId, {
    foodId: selected.id,
    source: selected.source,
    quantity: positive(item.quantity),
    serving: selected.servingLabel,
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
    const resolved: ResolvedFoodHandoff[] = [];
    for (const item of items) resolved.push(await resolveCanonicalFood(ctx, item));
    const savedMeal = await createSavedMeal(ctx.supabase, ctx.userId, {
      operationId: stableSavedMealOperationId(ctx, input),
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