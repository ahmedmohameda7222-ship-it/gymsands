import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  completeDiaryPlannedOccurrence,
  deriveDiaryNutritionPosition,
  logDiaryMeal,
  type DiaryNutritionFacts,
  type LogMealCommand,
} from "@/services/nutrition-v1/server/diary";

const operationId = "11111111-1111-4111-8111-111111111111";
const recipeId = "22222222-2222-4222-8222-222222222222";
const recipeVersionId = "33333333-3333-4333-8333-333333333333";
const savedMealId = "44444444-4444-4444-8444-444444444444";
const occurrenceId = "55555555-5555-4555-8555-555555555555";

function facts(values: Partial<DiaryNutritionFacts>): DiaryNutritionFacts {
  return {
    caloriesKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    ...values,
  };
}

function fakeRpc(result: unknown = { group: { id: "group-1" }, alreadyLogged: false }) {
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Nutrition V1 Diary nutrition truth", () => {
  it("calculates remaining nutrition from actual intake only and keeps unknown actual facts unknown", () => {
    const position = deriveDiaryNutritionPosition(
      facts({ caloriesKcal: 500, proteinG: null, carbsG: 60, fatG: 20 }),
      { calories: 2000, protein_g: 150, carbs_g: 220, fat_g: 70, water_ml: 2500 },
    );

    expect(position.remaining).toEqual({
      caloriesKcal: 1500,
      proteinG: null,
      carbsG: 160,
      fatG: 50,
    });
    expect(position.actual.caloriesKcal).toBe(500);
  });

  it("does not fabricate remaining values when no historical target exists", () => {
    const position = deriveDiaryNutritionPosition(
      facts({ caloriesKcal: 500, proteinG: 45 }),
      null,
    );
    expect(position.remaining).toEqual(facts({}));
  });
});

describe("Nutrition V1 grouped Diary logging", () => {
  it("logs a version-specific Recipe serving through the one atomic grouped-log RPC", async () => {
    const db = fakeRpc();
    const command: LogMealCommand = {
      operationId,
      date: "2026-08-26",
      meal: "Lunch",
      source: {
        type: "recipe",
        id: recipeId,
        versionId: recipeVersionId,
        frozenSnapshot: {
          name: "Published Bowl",
          serving: { quantity: 1, label: "1 serving" },
          nutrition: facts({ caloriesKcal: 640, proteinG: 42 }),
        },
      },
      items: [{
        foodName: "Published Bowl",
        servingLabel: "1 serving",
        quantity: 1,
        nutrition: facts({ caloriesKcal: 640, proteinG: 42 }),
      }],
    };

    await logDiaryMeal(db.client, command);

    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("log_nutrition_group", expect.objectContaining({
      p_operation_id: operationId,
      p_log_date: "2026-08-26",
      p_meal_type: "Lunch",
      p_source_type: "recipe",
      p_source_id: recipeId,
      p_source_version_id: recipeVersionId,
      p_frozen_snapshot: command.source.frozenSnapshot,
      p_items: command.items,
    }));
    expect(JSON.stringify(db.rpc.mock.calls)).not.toMatch(/user_id|userId/);
  });

  it("preserves a Saved Meal frozen resolved bundle instead of re-reading mutable source facts", async () => {
    const db = fakeRpc();
    const frozenBundle = {
      name: "Office Lunch",
      items: [
        { name: "Rice", quantity: 1, servingLabel: "200g", nutrition: facts({ caloriesKcal: 260, carbsG: 56 }) },
        { name: "Chicken", quantity: 1, servingLabel: "150g", nutrition: facts({ caloriesKcal: 250, proteinG: 46 }) },
      ],
    };
    const command: LogMealCommand = {
      operationId,
      date: "2026-08-26",
      meal: "Lunch",
      source: { type: "saved_meal", id: savedMealId, frozenSnapshot: frozenBundle },
      items: frozenBundle.items.map((item) => ({
        foodName: item.name,
        servingLabel: item.servingLabel,
        quantity: item.quantity,
        nutrition: item.nutrition,
      })),
    };

    await logDiaryMeal(db.client, command);

    expect(db.rpc).toHaveBeenCalledWith("log_nutrition_group", expect.objectContaining({
      p_source_type: "saved_meal",
      p_source_id: savedMealId,
      p_source_version_id: null,
      p_frozen_snapshot: frozenBundle,
      p_items: command.items,
    }));
  });

  it("returns database idempotency evidence without issuing a second write path", async () => {
    const db = fakeRpc({ group: { id: "group-1" }, alreadyLogged: true });
    const result = await logDiaryMeal(db.client, {
      operationId,
      date: "2026-08-26",
      meal: "Snack",
      source: { type: "quick_add", frozenSnapshot: { name: "Quick Add" } },
      items: [{
        foodName: "Quick Add",
        servingLabel: "1 entry",
        quantity: 1,
        nutrition: facts({ caloriesKcal: 180 }),
      }],
    });

    expect(result.alreadyLogged).toBe(true);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps unknown macros null in the payload instead of coercing them to zero", async () => {
    const db = fakeRpc();
    await logDiaryMeal(db.client, {
      operationId,
      date: "2026-08-26",
      meal: "Snack",
      source: { type: "quick_add", frozenSnapshot: { name: "180 kcal" } },
      items: [{
        foodName: "180 kcal",
        servingLabel: "1 entry",
        quantity: 1,
        nutrition: facts({ caloriesKcal: 180 }),
      }],
    });

    const args = db.rpc.mock.calls[0]?.[1] as Record<string, any>;
    expect(args.p_items[0].nutrition).toEqual({
      caloriesKcal: 180,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });
  });

  it("links planned intent to actual truth through the existing atomic completion RPC", async () => {
    const db = fakeRpc({ occurrence: { id: occurrenceId, status: "completed_changed" }, alreadyCompleted: false });
    const executionSnapshot = {
      name: "Adjusted planned lunch",
      items: [{ foodName: "Rice", servingLabel: "250g", quantity: 1, nutrition: facts({ caloriesKcal: 325 }) }],
    };

    await completeDiaryPlannedOccurrence(db.client, {
      occurrenceId,
      operationId,
      executionSnapshot,
    });

    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("complete_nutrition_planned_occurrence", {
      p_occurrence_id: occurrenceId,
      p_operation_id: operationId,
      p_execution_snapshot: executionSnapshot,
    });
  });
});
