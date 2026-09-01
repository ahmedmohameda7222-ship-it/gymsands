import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomMeal } from "@/types";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mocks.insert,
    })),
  },
}));

import { logSavedMealToEat } from "@/services/database/eat-food-logging";

const userId = "11111111-1111-4111-8111-111111111111";

function meal(totals: CustomMeal["totals"]): CustomMeal {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: userId,
    meal_name: "Nullable meal",
    items: [{ food_item_id: "33333333-3333-4333-8333-333333333333", quantity: 1 }] as CustomMeal["items"],
    totals,
    notes: "keep me",
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  } as CustomMeal;
}

function configureInsert() {
  let payload: Record<string, unknown> | null = null;
  mocks.insert.mockImplementation((value: Record<string, unknown>) => {
    payload = value;
    return {
      select: () => ({
        single: async () => ({ data: { id: "log-id", ...value }, error: null }),
      }),
    };
  });
  return () => payload;
}

describe("Saved Meal -> Eat nullable logging", () => {
  beforeEach(() => {
    mocks.insert.mockReset();
  });

  it.each([1, 2])("preserves unknown protein at quantity %s", async (quantity) => {
    const inserted = configureInsert();
    await logSavedMealToEat({
      userId,
      meal: meal({ calories: 500, protein_g: null, carbs_g: 50, fat_g: 20 }),
      date: "2026-08-31",
      mealType: "Lunch",
      quantity,
    });
    expect(inserted()).toMatchObject({ protein_g: null });
  });

  it("scales known calories independently while protein remains unknown", async () => {
    const inserted = configureInsert();
    await logSavedMealToEat({
      userId,
      meal: meal({ calories: 500, protein_g: null, carbs_g: 50, fat_g: 20 }),
      date: "2026-08-31",
      mealType: "Lunch",
      quantity: 2,
    });
    expect(inserted()).toMatchObject({ calories: 1000, protein_g: null });
  });

  it("preserves a known zero", async () => {
    const inserted = configureInsert();
    await logSavedMealToEat({
      userId,
      meal: meal({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }),
      date: "2026-08-31",
      mealType: "Lunch",
      quantity: 2,
    });
    expect(inserted()).toMatchObject({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it("keeps fully-known scaling unchanged", async () => {
    const inserted = configureInsert();
    await logSavedMealToEat({
      userId,
      meal: meal({ calories: 500, protein_g: 30, carbs_g: 50, fat_g: 20 }),
      date: "2026-08-31",
      mealType: "Lunch",
      quantity: 1.5,
    });
    expect(inserted()).toMatchObject({ calories: 750, protein_g: 45, carbs_g: 75, fat_g: 30 });
  });

  it("rejects invalid persisted nutrition instead of silently inserting zero", async () => {
    configureInsert();
    const invalid = meal({ calories: 500, protein_g: Number.NaN, carbs_g: 50, fat_g: 20 });
    await expect(logSavedMealToEat({
      userId,
      meal: invalid,
      date: "2026-08-31",
      mealType: "Lunch",
      quantity: 1,
    })).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
