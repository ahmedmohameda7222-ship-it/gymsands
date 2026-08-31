import type { McpContext } from "@/lib/mcp/auth";
import {
  asObject,
  cleanDate,
  cleanMealType,
  getArray,
  getNumber,
  getOptionalString,
  getString,
  type JsonObject,
} from "@/lib/mcp/schemas";
import { fail, ok, type McpToolResult } from "@/lib/mcp/tool-helpers";
import { sumFoodLogs } from "@/services/nutrition/calculations";
import { searchCatalogFoodsByName } from "@/services/nutrition-v1/server/food-catalog";
import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";

type FoodCandidate = {
  id: string;
  source: "global" | "user";
  food_name: string;
  serving_size: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function sumCanonicalFoodMcpTotals(rows: Array<Record<string, unknown>>) {
  return sumFoodLogs(rows.map((row) => ({
    calories: nullableNumber(row.calories),
    protein_g: nullableNumber(row.protein_g),
    carbs_g: nullableNumber(row.carbs_g),
    fat_g: nullableNumber(row.fat_g),
  })));
}

function normalizeFood(row: Record<string, unknown>, source: "global" | "user"): FoodCandidate {
  return {
    id: String(row.id),
    source,
    food_name: String(row.food_name ?? ""),
    serving_size: String(row.serving_size ?? ""),
    calories: nullableNumber(row.calories),
    protein_g: nullableNumber(row.protein_g),
    carbs_g: nullableNumber(row.carbs_g),
    fat_g: nullableNumber(row.fat_g),
  };
}

async function findFood(
  ctx: McpContext,
  query: string,
  limit = 5,
): Promise<{ exact?: FoodCandidate; candidates: FoodCandidate[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("food_name is required.");

  const [globalFoods, userFoods] = await Promise.all([
    searchCatalogFoodsByName(ctx.supabase, cleanQuery, limit),
    ctx.supabase
      .from("user_food_items")
      .select("id,food_name,serving_size,calories,protein_g,carbs_g,fat_g")
      .eq("user_id", ctx.userId)
      .ilike("food_name", `%${cleanQuery}%`)
      .limit(limit),
  ]);

  if (userFoods.error) throw new Error(userFoods.error.message);

  const candidates = [
    ...((userFoods.data ?? []) as Array<Record<string, unknown>>).map((food) => normalizeFood(food, "user")),
    ...globalFoods.map((food) => normalizeFood(food, "global")),
  ].slice(0, limit);

  const exact = candidates.find((food) => food.food_name.toLowerCase() === cleanQuery.toLowerCase())
    ?? (candidates.length === 1 ? candidates[0] : undefined);
  return { exact, candidates };
}

function rowFromHandoff(
  ctx: McpContext,
  date: string,
  mealType: string,
  notes: string | null,
  handoff: Awaited<ReturnType<typeof resolveFoodHandoff>>,
) {
  return {
    user_id: ctx.userId,
    log_date: date,
    meal_type: mealType,
    food_item_id: handoff.diaryItem.foodItemId,
    user_food_item_id: handoff.diaryItem.userFoodItemId,
    food_name: handoff.diaryItem.foodName,
    serving_size: handoff.diaryItem.servingLabel,
    quantity: handoff.diaryItem.quantity,
    calories: handoff.diaryItem.nutrition.caloriesKcal,
    protein_g: handoff.diaryItem.nutrition.proteinG,
    carbs_g: handoff.diaryItem.nutrition.carbsG,
    fat_g: handoff.diaryItem.nutrition.fatG,
    notes,
  };
}

export async function executeCanonicalFoodMcpTool(
  ctx: McpContext,
  toolName: string,
  rawInput: unknown,
): Promise<McpToolResult | null> {
  if (toolName !== "search_foods" && toolName !== "add_food_log") return null;
  const input = asObject(rawInput);

  try {
    if (toolName === "search_foods") {
      const { candidates } = await findFood(
        ctx,
        getString(input, "query"),
        Math.min(25, Math.max(1, getNumber(input, "limit", 10))),
      );
      return ok({ ok: true, foods: candidates });
    }

    const mealType = cleanMealType(input.meal_type);
    const date = cleanDate(input.date);
    const items = getArray<JsonObject>(input, "items");
    if (!items.length) return fail("missing_required_input", "items is required.");

    const rows: Array<Record<string, unknown>> = [];
    const ambiguous: Array<Record<string, unknown>> = [];
    for (const item of items) {
      const match = await findFood(ctx, getString(item, "food_name"), 5);
      if (!match.exact) {
        ambiguous.push({ requested: item, candidates: match.candidates });
        continue;
      }

      const handoff = await resolveFoodHandoff(ctx.supabase, ctx.userId, {
        foodId: match.exact.id,
        source: match.exact.source === "global" ? "catalog" : "my_food",
        quantity: getNumber(item, "quantity", 1),
        serving: match.exact.serving_size,
      });
      rows.push(rowFromHandoff(
        ctx,
        date,
        mealType,
        getOptionalString(input, "notes") ?? getOptionalString(item, "serving_hint") ?? null,
        handoff,
      ));
    }

    if (ambiguous.length) {
      return fail("ambiguous_food", "Some foods are ambiguous. Ask the user to choose a candidate.", { ambiguous_items: ambiguous });
    }

    const { data, error } = await ctx.supabase.from("food_logs").insert(rows).select("*");
    if (error) throw new Error(error.message);
    return ok({ ok: true, saved_items: data ?? [], totals: sumCanonicalFoodMcpTotals((data ?? []) as Array<Record<string, unknown>>) });
  } catch (error) {
    console.error(`Plaivra MCP tool execution failed for ${toolName}:`, error instanceof Error ? error.message : "Unknown error");
    return fail("tool_execution_failed", "Plaivra could not complete this tool. No change should be assumed; retry or review the affected record in Plaivra.");
  }
}