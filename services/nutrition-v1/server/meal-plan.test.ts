import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyMealPlanChangeRequest,
  completeMealPlanOccurrence,
  copyPlannedOccurrences,
  deriveShoppingNeeds,
  getMealPlanWeek,
  mutateMealPlanWeek,
  normalizeOccurrenceForMutation,
} from "@/services/nutrition-v1/server/meal-plan";

const userId = "11111111-1111-4111-8111-111111111111";
const weekId = "22222222-2222-4222-8222-222222222222";
const occurrenceId = "33333333-3333-4333-8333-333333333333";
const recipeId = "44444444-4444-4444-8444-444444444444";
const recipeVersionId = "55555555-5555-4555-8555-555555555555";
const savedMealId = "66666666-6666-4666-8666-666666666666";
const requestId = "77777777-7777-4777-8777-777777777777";
const operationId = "88888888-8888-4888-8888-888888888888";

function chainResult(data: unknown) {
  const terminal = { maybeSingle: vi.fn(async () => ({ data, error: null })) };
  const eq2 = { eq: vi.fn(() => terminal), maybeSingle: terminal.maybeSingle };
  const eq1 = { eq: vi.fn(() => eq2), maybeSingle: terminal.maybeSingle };
  return { select: vi.fn(() => eq1) };
}

describe("Nutrition V1 week authority", () => {
  it("keeps empty week navigation read-only and does not create a row", async () => {
    const weeks = chainResult(null);
    const from = vi.fn((table: string) => {
      if (table === "nutrition_meal_plan_weeks") return weeks;
      throw new Error(`unexpected table ${table}`);
    });
    const client = { from, rpc: vi.fn() } as unknown as SupabaseClient;

    const projection = await getMealPlanWeek(client, userId, "2026-08-24");

    expect(projection.week).toBeNull();
    expect(projection.occurrences).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect((weeks as any).insert).toBeUndefined();
  });

  it("creates a week only for the first meaningful mutation and advances through the atomic revision RPC", async () => {
    const insertSingle = vi.fn(async () => ({ data: { id: weekId, revision: 0 }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const from = vi.fn((table: string) => {
      if (table === "nutrition_meal_plan_weeks") return { insert };
      throw new Error(`unexpected table ${table}`);
    });
    const rpc = vi.fn(async () => ({ data: { weekId, revision: 1 }, error: null }));
    const client = { from, rpc } as unknown as SupabaseClient;

    const result = await mutateMealPlanWeek(client, userId, {
      weekId: null,
      weekStartDate: "2026-08-24",
      baseRevision: 0,
      operationId,
      mutation: {
        upsertOccurrences: [{
          planDate: "2026-08-24",
          mealSlotKey: "Post-workout",
          sourceType: "placeholder",
          frozenName: "Restaurant meal",
          frozenSnapshot: { name: "Restaurant meal" },
        }],
      },
    });

    expect(insert).toHaveBeenCalledWith({ user_id: userId, week_start_date: "2026-08-24" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mutate_nutrition_meal_plan_week", {
      p_week_id: weekId,
      p_base_revision: 0,
      p_mutation: expect.objectContaining({
        operationId,
        upsertOccurrences: expect.any(Array),
      }),
    });
    expect(result.revision).toBe(1);
  });

  it("preserves custom slot identity and version-specific Recipe snapshots", () => {
    const occurrence = normalizeOccurrenceForMutation({
      id: occurrenceId,
      planDate: "2026-08-24",
      mealSlotKey: "Post-workout",
      position: 1,
      sourceType: "recipe",
      sourceId: recipeId,
      sourceVersionId: recipeVersionId,
      resolvedQuantity: 1.5,
      resolvedServingLabel: "1.5 servings",
      frozenName: "Protein bowl",
      frozenSnapshot: {
        recipe_id: recipeId,
        recipe_version_id: recipeVersionId,
        resolved_serving_quantity: 1.5,
        resolved_serving_label: "1.5 servings",
        frozen_recipe_name: "Protein bowl",
        frozen_nutrition: { calories: 610, protein_g: 46, carbs_g: 72, fat_g: 15, fiber_g: null },
        shoppingIngredients: [{ foodId: "chicken", name: "Chicken", quantity: 300, unit: "g" }],
      },
    });

    expect(occurrence.mealSlotKey).toBe("Post-workout");
    expect(occurrence.sourceId).toBe(recipeId);
    expect(occurrence.sourceVersionId).toBe(recipeVersionId);
    expect(occurrence.frozenSnapshot).toMatchObject({
      recipe_id: recipeId,
      recipe_version_id: recipeVersionId,
      resolved_serving_quantity: 1.5,
    });
  });

  it("requires a complete frozen Saved Meal bundle and keeps it source-specific", () => {
    expect(normalizeOccurrenceForMutation({
      planDate: "2026-08-25",
      mealSlotKey: "Lunch",
      sourceType: "saved_meal",
      sourceId: savedMealId,
      frozenName: "Office lunch",
      frozenSnapshot: {
        saved_meal_id: savedMealId,
        frozen_name: "Office lunch",
        items: [{ kind: "food", food_id: "rice", frozen_name: "Rice", resolved_quantity: 1, resolved_serving_label: "200 g", frozen_nutrition: { calories: 260, protein_g: 5, carbs_g: 56, fat_g: 1, fiber_g: null } }],
      },
    })).toMatchObject({ sourceType: "saved_meal", sourceId: savedMealId, sourceVersionId: null });

    expect(() => normalizeOccurrenceForMutation({
      planDate: "2026-08-25",
      mealSlotKey: "Lunch",
      sourceType: "saved_meal",
      sourceId: savedMealId,
      frozenName: "Broken meal",
      frozenSnapshot: { saved_meal_id: savedMealId, frozen_name: "Broken meal" },
    })).toThrow(/items/i);
  });

  it("keeps Placeholder intent unverified and source-free", () => {
    const placeholder = normalizeOccurrenceForMutation({
      planDate: "2026-08-26",
      mealSlotKey: "Dinner",
      sourceType: "placeholder",
      frozenName: "Dinner out",
      frozenSnapshot: { name: "Dinner out", note: "Unknown restaurant" },
    });
    expect(placeholder).toMatchObject({ sourceId: null, sourceVersionId: null, frozenName: "Dinner out" });

    expect(() => normalizeOccurrenceForMutation({
      planDate: "2026-08-26",
      mealSlotKey: "Dinner",
      sourceType: "placeholder",
      sourceId: recipeId,
      frozenName: "Dinner out",
      frozenSnapshot: { name: "Dinner out" },
    })).toThrow(/source/i);
  });

  it("copies and repeats intent with fresh identities while preserving frozen source truth", () => {
    const ids = [
      "90000000-0000-4000-8000-000000000001",
      "90000000-0000-4000-8000-000000000002",
    ];
    let index = 0;
    const copies = copyPlannedOccurrences([
      {
        id: occurrenceId,
        planDate: "2026-08-24",
        mealSlotKey: "Lunch",
        position: 0,
        sourceType: "recipe" as const,
        sourceId: recipeId,
        sourceVersionId: recipeVersionId,
        resolvedQuantity: 1,
        resolvedServingLabel: "1 serving",
        frozenName: "Protein bowl",
        frozenSnapshot: { recipe_id: recipeId, recipe_version_id: recipeVersionId, frozen_nutrition: { calories: 600 } },
        status: "completed" as const,
      },
    ], ["2026-08-26", "2026-08-28"], () => ids[index++]!);

    expect(copies.map((item) => item.id)).toEqual(ids);
    expect(copies.map((item) => item.planDate)).toEqual(["2026-08-26", "2026-08-28"]);
    expect(copies.every((item) => item.status === "planned")).toBe(true);
    expect(copies.every((item) => item.sourceVersionId === recipeVersionId)).toBe(true);
    expect(copies.every((item) => item.frozenSnapshot.recipe_id === recipeId)).toBe(true);
  });
});

describe("Nutrition V1 Meal Plan execution and Shopping boundaries", () => {
  it("bridges plan to actual truth through the one atomic completion RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { occurrence: { id: occurrenceId, status: "completed" }, alreadyCompleted: false }, error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    await completeMealPlanOccurrence(client, {
      occurrenceId,
      operationId,
      executionSnapshot: null,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_nutrition_planned_occurrence", {
      p_occurrence_id: occurrenceId,
      p_operation_id: operationId,
      p_execution_snapshot: null,
    });
  });

  it("derives Shopping from frozen contributions, merges only safe identity/unit matches, and ignores Placeholder intent", () => {
    const needs = deriveShoppingNeeds([
      {
        id: "a", sourceType: "recipe", frozenSnapshot: {
          shoppingIngredients: [
            { foodId: "chicken", name: "Chicken breast", quantity: 300, unit: "g", qualifier: "raw" },
            { foodId: "rice", name: "Rice", quantity: 200, unit: "g" },
          ],
        },
      },
      {
        id: "b", sourceType: "saved_meal", frozenSnapshot: {
          shoppingIngredients: [
            { foodId: "chicken", name: "Chicken breast", quantity: 250, unit: "g", qualifier: "raw" },
            { foodId: "chicken", name: "Chicken breast", quantity: 1, unit: "piece", qualifier: "cooked" },
          ],
        },
      },
      { id: "c", sourceType: "placeholder", frozenSnapshot: { name: "Restaurant meal" } },
    ] as any);

    expect(needs).toEqual(expect.arrayContaining([
      expect.objectContaining({ foodId: "chicken", quantity: 550, unit: "g", qualifier: "raw", sourceOccurrenceIds: ["a", "b"] }),
      expect.objectContaining({ foodId: "chicken", quantity: 1, unit: "piece", qualifier: "cooked", sourceOccurrenceIds: ["b"] }),
      expect.objectContaining({ foodId: "rice", quantity: 200, unit: "g" }),
    ]));
    expect(needs).toHaveLength(3);
  });

  it("surfaces a stale ChatGPT proposal without issuing a second mutation path", async () => {
    const rpc = vi.fn(async () => ({ data: { state: "stale", revision: 7 }, error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await applyMealPlanChangeRequest(client, requestId);

    expect(result).toEqual({ state: "stale", revision: 7 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_nutrition_meal_plan_change_request", { p_request_id: requestId });
  });
});
