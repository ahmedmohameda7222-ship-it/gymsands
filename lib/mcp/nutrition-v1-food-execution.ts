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
import { listFoodLibrary, normalizeFoodSearchText, type FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";
import {
  resolveCatalogNewUseSelectionWithAuthorities,
  resolveFoodHandoff,
} from "@/services/nutrition-v1/server/food-handoff";

type FoodCandidate = {
  id: string;
  source: "global" | "user";
  food_name: string;
  locale: string | null;
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

function normalizeFood(row: FoodLibraryCandidate): FoodCandidate {
  return {
    id: row.id,
    source: row.source === "catalog" ? "global" : "user",
    food_name: row.name,
    locale: row.source === "catalog" ? row.locale : null,
    serving_size: row.servingLabel ?? "",
    calories: row.nutrition.calories,
    protein_g: row.nutrition.protein_g,
    carbs_g: row.nutrition.carbs_g,
    fat_g: row.nutrition.fat_g,
  };
}

async function findFood(
  ctx: McpContext,
  query: string,
  limit = 5,
): Promise<{ exact?: FoodCandidate; candidates: FoodCandidate[] }> {
  const cleanQuery = normalizeFoodSearchText(query);
  if (!cleanQuery) throw new Error("food_name is required.");

  const page = await listFoodLibrary(ctx.supabase, ctx.userId, {
    query: cleanQuery,
    locale: "en",
    marketScopeCode: null,
    limit,
    scope: "all",
  });
  const candidates = page.items.slice(0, limit).map(normalizeFood);
  const exact = candidates.find((food) => normalizeFoodSearchText(food.food_name) === cleanQuery)
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

      const quantity = getNumber(item, "quantity", 1);
      const servingHint = getOptionalString(item, "serving_hint")?.trim() || null;
      const servingOptionId = getOptionalString(item, "serving_option_id")?.trim() || null;
      let handoff: Awaited<ReturnType<typeof resolveFoodHandoff>>;

      if (match.exact.source === "global") {
        const languageTag = match.exact.locale;
        if (!languageTag) {
          return fail("invalid_food_identity", "The selected Catalog Food is missing its exact Name locale. Search again before logging.");
        }

        // PR A keeps the existing MCP single-client bridge intact. Task 14 / PR B
        // must still supply authenticated owner authority before deployment; this
        // call intentionally does not broaden service-role owner access.
        const selection = await resolveCatalogNewUseSelectionWithAuthorities(
          ctx.supabase,
          ctx.supabase,
          ctx.userId,
          {
            foodId: match.exact.id,
            displayName: match.exact.food_name,
            languageTag,
          },
        );
        const choices = selection.servingChoices;
        if (choices.length === 0) {
          return fail(
            "authoritative_serving_unavailable",
            "No authoritative serving is available yet. Ask the user to choose another Food or try again after serving authority is available.",
          );
        }

        let selectedServing = null as (typeof choices)[number] | null;
        if (servingOptionId) {
          if (!servingHint) {
            return fail(
              "invalid_serving_identity",
              "serving_option_id must be paired with the exact serving_hint label.",
              { requested: item, serving_choices: choices },
            );
          }
          const matches = choices.filter((choice) => (
            choice.servingOptionId === servingOptionId
            && choice.label === servingHint
          ));
          if (matches.length !== 1) {
            return fail(
              "invalid_serving_identity",
              "The serving_option_id and serving_hint do not match one exact effective authoritative serving choice.",
              { requested: item, serving_choices: choices },
            );
          }
          selectedServing = matches[0]!;
        } else if (servingHint) {
          const matches = choices.filter((choice) => choice.label === servingHint);
          if (matches.length === 0) {
            return fail(
              "invalid_serving_hint",
              "The serving_hint does not match an effective authoritative serving choice.",
              { requested: item, serving_choices: choices },
            );
          }
          if (matches.length > 1) {
            return fail(
              "ambiguous_serving",
              "Multiple authoritative servings share this label. Ask the user to choose one and retry with serving_option_id plus the same serving_hint.",
              { requested: item, serving_choices: matches },
            );
          }
          selectedServing = matches[0]!;
        } else if (choices.length === 1) {
          selectedServing = choices[0]!;
        } else {
          return fail(
            "ambiguous_serving",
            "This Food has multiple authoritative serving choices. Ask the user to choose one and retry with serving_hint and serving_option_id when provided.",
            { requested: item, serving_choices: choices },
          );
        }

        handoff = await resolveFoodHandoff(ctx.supabase, ctx.userId, {
          foodId: match.exact.id,
          source: "catalog",
          quantity,
          serving: selectedServing.label,
          servingOptionId: selectedServing.servingOptionId,
          displayName: match.exact.food_name,
          languageTag,
        });
      } else {
        if (servingOptionId) {
          return fail("invalid_serving_identity", "serving_option_id is only valid for Catalog Food serving choices.");
        }
        handoff = await resolveFoodHandoff(ctx.supabase, ctx.userId, {
          foodId: match.exact.id,
          source: "my_food",
          quantity,
          serving: match.exact.serving_size,
          displayName: undefined,
          languageTag: null,
        });
      }

      rows.push(rowFromHandoff(
        ctx,
        date,
        mealType,
        getOptionalString(input, "notes") ?? null,
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