import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodLog, MealPlanItem } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const logId = "22222222-2222-4222-8222-222222222222";
const mealId = "33333333-3333-4333-8333-333333333333";

type Operation = { table: string; kind: "select" | "update"; filters: Array<[string, unknown]>; payload?: Record<string, unknown> };

type FakeState = {
  foodLog: FoodLog | null;
  linkedMeal: MealPlanItem | null;
  operations: Operation[];
  foodUpdateCalls: number;
  mealUpdateCalls: number;
  failFoodUpdates: Set<number>;
  failMealUpdates: Set<number>;
  skipMealApply: Set<number>;
};

const { state, supabase } = vi.hoisted(() => {
  const state: FakeState = {
    foodLog: null,
    linkedMeal: null,
    operations: [],
    foodUpdateCalls: 0,
    mealUpdateCalls: 0,
    failFoodUpdates: new Set(),
    failMealUpdates: new Set(),
    skipMealApply: new Set()
  };

  function matches(row: Record<string, unknown> | null, filters: Array<[string, unknown]>) {
    return Boolean(row) && filters.every(([key, value]) => row?.[key] === value);
  }

  function query(table: string) {
    let kind: "select" | "update" = "select";
    let payload: Record<string, unknown> | undefined;
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select() { return builder; },
      update(next: Record<string, unknown>) { kind = "update"; payload = next; return builder; },
      eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
      async maybeSingle() { return execute(false); },
      async single() { return execute(true); }
    };

    async function execute(requireSingle: boolean) {
      state.operations.push({ table, kind, filters: [...filters], payload });
      if (kind === "select") {
        const row = table === "food_logs" ? state.foodLog : state.linkedMeal;
        const data = matches(row as unknown as Record<string, unknown> | null, filters) ? structuredClone(row) : null;
        return requireSingle && !data ? { data: null, error: { message: "not found" } } : { data, error: null };
      }

      if (table === "food_logs") {
        state.foodUpdateCalls += 1;
        if (state.failFoodUpdates.has(state.foodUpdateCalls)) return { data: null, error: { message: `food update ${state.foodUpdateCalls} failed` } };
        if (matches(state.foodLog as unknown as Record<string, unknown> | null, filters) && state.foodLog) state.foodLog = { ...state.foodLog, ...payload } as FoodLog;
        return { data: structuredClone(state.foodLog), error: null };
      }

      state.mealUpdateCalls += 1;
      if (state.failMealUpdates.has(state.mealUpdateCalls)) return { data: null, error: { message: `meal update ${state.mealUpdateCalls} failed` } };
      if (!state.skipMealApply.has(state.mealUpdateCalls) && matches(state.linkedMeal as unknown as Record<string, unknown> | null, filters) && state.linkedMeal) state.linkedMeal = { ...state.linkedMeal, ...payload } as MealPlanItem;
      return { data: structuredClone(state.linkedMeal), error: null };
    }
    return builder;
  }

  return { state, supabase: { from: vi.fn(query) } };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/lib/utils", () => ({ isUuid: () => true }));
vi.mock("@/services/database/nutrition", () => ({ getCalorieTargets: vi.fn() }));
vi.mock("@/services/database/execution-layer", () => ({ getNutritionTargetProfiles: vi.fn() }));
vi.mock("@/services/database/workout-plans", () => ({ getDefaultUserWorkoutPlan: vi.fn() }));

const originalLog = (): FoodLog => ({
  id: logId,
  user_id: userId,
  food_item_id: null,
  user_food_item_id: null,
  log_date: "2026-07-12",
  meal_type: "Lunch",
  food_name: "Original meal",
  serving_size: "1 bowl",
  quantity: 1,
  calories: 500,
  protein_g: 30,
  carbs_g: 50,
  fat_g: 15,
  notes: "original"
});

const originalMeal = (): MealPlanItem => ({
  id: mealId,
  user_id: userId,
  plan_date: "2026-07-12",
  meal_type: "Lunch",
  food_item_id: null,
  user_food_item_id: null,
  food_name: "Original meal",
  serving_size: "1 bowl",
  quantity: 1,
  calories: 500,
  protein_g: 30,
  carbs_g: 50,
  fat_g: 15,
  status: "done",
  food_log_id: logId,
  completed_at: "2026-07-12T12:00:00Z",
  notes: "original",
  created_at: "2026-07-12T10:00:00Z",
  updated_at: "2026-07-12T12:00:00Z"
});

const patch = {
  foodName: "Updated meal",
  servingSize: "2 bowls",
  quantity: 2,
  mealType: "Dinner" as const,
  calories: 900,
  proteinG: 55,
  carbsG: 80,
  fatG: 25,
  notes: "updated"
};

beforeEach(() => {
  state.foodLog = originalLog();
  state.linkedMeal = originalMeal();
  state.operations = [];
  state.foodUpdateCalls = 0;
  state.mealUpdateCalls = 0;
  state.failFoodUpdates.clear();
  state.failMealUpdates.clear();
  state.skipMealApply.clear();
  vi.clearAllMocks();
});

describe("updateEatFoodLog consistency", () => {
  it("updates an ordinary unlinked log", async () => {
    state.linkedMeal = null;
    const { updateEatFoodLog } = await import("@/services/database/eat");
    const result = await updateEatFoodLog(userId, logId, patch);
    expect(result.linkedMeal).toBeNull();
    expect(result.log).toMatchObject({ food_name: "Updated meal", calories: 900, meal_type: "Dinner" });
  });

  it("updates both linked records while preserving terminal fields", async () => {
    const { updateEatFoodLog } = await import("@/services/database/eat");
    const result = await updateEatFoodLog(userId, logId, patch);
    expect(result.log).toMatchObject({ food_name: "Updated meal", calories: 900 });
    expect(result.linkedMeal).toMatchObject({ food_name: "Updated meal", calories: 900, status: "done", food_log_id: logId, completed_at: "2026-07-12T12:00:00Z" });
    expect(state.foodLog?.food_name).toBe(state.linkedMeal?.food_name);
  });

  it("stops before the linked write when the first write fails", async () => {
    state.failFoodUpdates.add(1);
    const { updateEatFoodLog } = await import("@/services/database/eat");
    await expect(updateEatFoodLog(userId, logId, patch)).rejects.toThrow("food update 1 failed");
    expect(state.mealUpdateCalls).toBe(0);
    expect(state.foodLog).toEqual(originalLog());
    expect(state.linkedMeal).toEqual(originalMeal());
  });

  it("restores the first row when the linked write fails", async () => {
    state.failMealUpdates.add(1);
    const { updateEatFoodLog } = await import("@/services/database/eat");
    await expect(updateEatFoodLog(userId, logId, patch)).rejects.toThrow("restored");
    expect(state.foodLog).toEqual(originalLog());
    expect(state.linkedMeal).toEqual(originalMeal());
    expect(state.foodUpdateCalls).toBe(2);
    expect(state.mealUpdateCalls).toBe(2);
  });

  it("returns a distinct critical error when compensation fails", async () => {
    state.failMealUpdates.add(1);
    state.failFoodUpdates.add(2);
    const { EAT_LINKED_EDIT_CRITICAL_CODE, updateEatFoodLog } = await import("@/services/database/eat");
    await expect(updateEatFoodLog(userId, logId, patch)).rejects.toMatchObject({ code: EAT_LINKED_EDIT_CRITICAL_CODE, requiresReload: true });
  });

  it("does not return success when the linked row does not match", async () => {
    state.skipMealApply.add(1);
    const { updateEatFoodLog } = await import("@/services/database/eat");
    await expect(updateEatFoodLog(userId, logId, patch)).rejects.toThrow("restored");
    expect(state.foodLog).toEqual(originalLog());
    expect(state.linkedMeal).toEqual(originalMeal());
  });

  it("ownership-scopes every read, write, restore, and verification operation", async () => {
    state.failMealUpdates.add(1);
    const { updateEatFoodLog } = await import("@/services/database/eat");
    await expect(updateEatFoodLog(userId, logId, patch)).rejects.toThrow();
    expect(state.operations.length).toBeGreaterThan(5);
    expect(state.operations.every((operation) => operation.filters.some(([key, value]) => key === "user_id" && value === userId))).toBe(true);
  });
});
