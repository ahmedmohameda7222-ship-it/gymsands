import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveFoodHandoff } from "@/services/nutrition-v1/server/food-handoff";
import { getMealPlanWeek, mutateMealPlanWeek } from "@/services/nutrition-v1/server/meal-plan";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";
import { autosaveRecipeDraft, createPreseededRecipeDraft } from "@/services/nutrition-v1/server/recipes";
import { getRecipeWorkspace } from "@/services/nutrition-v1/server/recipe-workspace";
import { createSavedMeal } from "@/services/nutrition-v1/server/saved-meals";
import { logDiaryMeal } from "@/services/nutrition-v1/server/diary";

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NutritionRequestError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new NutritionRequestError(`${label} is required.`);
  return result;
}

async function resolveSource(supabase: Parameters<typeof resolveFoodHandoff>[0], userId: string, raw: Record<string, unknown>) {
  if (raw.type === "food") {
    const source = raw.source;
    if (source !== "catalog" && source !== "my_food") throw new NutritionRequestError("Food source is invalid.");
    return { kind: "food" as const, value: await resolveFoodHandoff(supabase, userId, {
      foodId: text(raw.id, "Food"),
      source,
      quantity: Number(raw.quantity),
      serving: text(raw.serving, "Serving"),
    }) };
  }
  if (raw.type === "recipe") {
    return { kind: "recipe" as const, value: await resolveRecipeHandoff(
      supabase,
      userId,
      text(raw.id, "Recipe"),
      text(raw.versionId, "Recipe version"),
    ) };
  }
  throw new NutritionRequestError("Unsupported handoff source.");
}

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = object(await request.json().catch(() => ({})), "Handoff command");
    const destination = text(body.destination, "Destination");
    const source = await resolveSource(context.supabase, context.user.id, object(body.source, "Handoff source"));

    if (destination === "diary") {
      const operationId = text(body.operationId, "Operation ID");
      const date = text(body.date, "Diary date");
      const meal = text(body.meal, "Diary meal");
      if (source.kind === "food") {
        const result = await logDiaryMeal(context.supabase, {
          operationId,
          date,
          meal,
          source: { type: "food", id: source.value.foodId, frozenSnapshot: source.value.frozenSourceSnapshot },
          items: [source.value.diaryItem],
        });
        return nutritionJson({ destination, result });
      }
      const result = await logDiaryMeal(context.supabase, {
        operationId,
        date,
        meal,
        source: { type: "recipe", id: source.value.recipeId, versionId: source.value.recipeVersionId, frozenSnapshot: source.value.frozenSourceSnapshot },
        items: [source.value.diaryItem],
      });
      return nutritionJson({ destination, result });
    }

    if (destination === "meal_plan") {
      const operationId = text(body.operationId, "Operation ID");
      const planDate = text(body.planDate, "Plan date");
      const mealSlot = text(body.mealSlot, "Meal slot");
      const weekStartDate = text(body.weekStartDate, "Week start");
      const week = await getMealPlanWeek(context.supabase, context.user.id, weekStartDate);
      const position = week.occurrences.filter((item) => item.plan_date === planDate && item.meal_slot_key === mealSlot).length;
      const occurrence = source.kind === "food"
        ? {
            id: crypto.randomUUID(), planDate, mealSlotKey: mealSlot, position,
            sourceType: "food" as const, sourceId: source.value.foodId, sourceVersionId: null,
            resolvedQuantity: source.value.quantity, resolvedServingLabel: source.value.serving,
            frozenName: source.value.name,
            frozenSnapshot: {
              ...source.value.frozenSourceSnapshot,
              shoppingIngredients: [{ foodId: source.value.foodId, name: source.value.name, quantity: source.value.quantity, unit: source.value.serving, qualifier: null }],
            },
            status: "planned" as const,
          }
        : {
            id: crypto.randomUUID(), planDate, mealSlotKey: mealSlot, position,
            sourceType: "recipe" as const, sourceId: source.value.recipeId, sourceVersionId: source.value.recipeVersionId,
            resolvedQuantity: 1, resolvedServingLabel: "1 serving", frozenName: source.value.name,
            frozenSnapshot: { ...source.value.frozenSourceSnapshot, shoppingIngredients: source.value.shoppingIngredients },
            status: "planned" as const,
          };
      const result = await mutateMealPlanWeek(context.supabase, context.user.id, {
        weekId: week.week?.id ?? null,
        weekStartDate,
        baseRevision: week.week?.revision ?? 0,
        operationId,
        mutation: { upsertOccurrences: [occurrence] },
      });
      return nutritionJson({ destination, result });
    }

    if (destination === "saved_meal") {
      const name = text(body.name, "Saved Meal name");
      const savedMeal = await createSavedMeal(context.supabase, context.user.id, {
        name,
        note: typeof body.note === "string" ? body.note : null,
        items: [source.value.savedMealItem],
      });
      return nutritionJson({ destination, savedMeal }, { status: 201 });
    }

    if (destination === "recipe") {
      if (source.kind !== "food") throw new NutritionRequestError("Only Food can be handed into Recipe ingredient authoring.");
      const targetRecipeId = typeof body.targetRecipeId === "string" && body.targetRecipeId.trim() ? body.targetRecipeId.trim() : null;
      if (!targetRecipeId) {
        const operationId = text(body.operationId, "Operation ID");
        const created = await createPreseededRecipeDraft(context.supabase, context.user.id, {
          operationId,
          ingredient: source.value.recipeIngredient,
        });
        return nutritionJson({ destination, recipeId: created.recipeId, draftId: created.draftId });
      }

      const workspace = await getRecipeWorkspace(context.supabase, context.user.id, targetRecipeId);
      if (!workspace.draft) throw new NutritionRequestError("Choose a Recipe with a Working Draft or start a new Recipe.");
      const recipeId = targetRecipeId;
      const draft = workspace.draft as unknown as Record<string, unknown>;
      const ingredients = workspace.ingredients as unknown as Array<Record<string, unknown>>;
      const instructions = workspace.instructions as unknown as Array<Record<string, unknown>>;
      const equipment = workspace.equipment as unknown as Array<Record<string, unknown>>;
      const expectedRevision = Number(draft.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new NutritionRequestError("Recipe Working Draft revision is unavailable.");
      const savedDraft = await autosaveRecipeDraft(context.supabase, context.user.id, recipeId, {
        name: typeof draft.name === "string" ? draft.name : null,
        servings: typeof draft.servings === "number" ? draft.servings : draft.servings == null ? null : Number(draft.servings),
        total_cooked_weight_g: draft.total_cooked_weight_g == null ? null : Number(draft.total_cooked_weight_g),
        total_time_minutes: draft.total_time_minutes == null ? null : Number(draft.total_time_minutes),
        notes: typeof draft.notes === "string" ? draft.notes : null,
        draft_metadata: object(draft.draft_metadata ?? {}, "Recipe draft metadata"),
        ingredients: [...ingredients.map((item) => ({
          id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
          food_id: typeof item.food_id === "string" ? item.food_id : null,
          ingredient_name: String(item.ingredient_name ?? ""),
          quantity: item.quantity == null ? null : Number(item.quantity),
          unit: typeof item.unit === "string" ? item.unit : null,
          frozen_nutrition: item.frozen_nutrition && typeof item.frozen_nutrition === "object" ? item.frozen_nutrition as Record<string, unknown> : null,
        })), { id: crypto.randomUUID(), ...source.value.recipeIngredient }],
        instructions: instructions.map((item) => ({
          id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
          instruction: String(item.instruction ?? ""),
          ingredient_refs: Array.isArray(item.ingredient_refs) ? item.ingredient_refs : [],
          equipment_refs: Array.isArray(item.equipment_refs) ? item.equipment_refs : [],
          duration_seconds: item.duration_seconds == null ? null : Number(item.duration_seconds),
          heat_or_temperature: typeof item.heat_or_temperature === "string" ? item.heat_or_temperature : null,
          doneness_or_result_cue: typeof item.doneness_or_result_cue === "string" ? item.doneness_or_result_cue : null,
          prep_ahead_cue: typeof item.prep_ahead_cue === "string" ? item.prep_ahead_cue : null,
          track_key: typeof item.track_key === "string" ? item.track_key : null,
          dependency_action_ids: Array.isArray(item.dependency_action_ids) ? item.dependency_action_ids.map(String) : [],
          can_run_in_background: item.can_run_in_background === true,
          metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {},
        })),
        equipment: equipment.map((item) => ({
          id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
          name: String(item.name ?? ""),
          quantity: item.quantity == null ? null : Number(item.quantity),
          note: typeof item.note === "string" ? item.note : null,
        })),
      }, expectedRevision);
      return nutritionJson({ destination, recipeId, draftId: savedDraft.id });
    }

    throw new NutritionRequestError("Unsupported Add To destination.");
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}