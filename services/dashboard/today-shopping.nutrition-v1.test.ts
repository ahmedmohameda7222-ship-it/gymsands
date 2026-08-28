import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { readTodayShoppingProjection } from "@/services/dashboard/today-projection-server";

const userId = "11111111-1111-4111-8111-111111111111";
const weekId = "22222222-2222-4222-8222-222222222222";
const occurrenceId = "33333333-3333-4333-8333-333333333333";
const foodId = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

class Query implements PromiseLike<unknown> {
  private equals = new Map<string, unknown>();
  private maximum: number | null = null;
  private single = false;

  constructor(
    private readonly table: string,
    private readonly rows: Row[],
    private readonly selectedTables: string[],
  ) {}

  select() {
    this.selectedTables.push(this.table);
    return this;
  }

  eq(column: string, value: unknown) {
    this.equals.set(column, value);
    return this;
  }

  lte() {
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.maximum = value;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return Promise.resolve(this.execute());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    let result = this.rows.filter((row) =>
      [...this.equals].every(([column, value]) => row[column] === value),
    );
    if (this.maximum !== null) result = result.slice(0, this.maximum);
    return { data: this.single ? result[0] ?? null : result, error: null };
  }
}

class FakeSupabase {
  selectedTables: string[] = [];

  private readonly data: Record<string, Row[]> = {
    nutrition_meal_plan_weeks: [{
      id: weekId,
      user_id: userId,
      week_start_date: "2026-08-01",
      revision: 7,
      week_override_json: {
        shopping: {
          states: {
            [`${foodId}|g|`]: "Purchased",
            "55555555-5555-4555-8555-555555555555|g|": "Don't need",
          },
          derivedEdits: {
            [`${foodId}|g|`]: { quantity: 750 },
          },
          manualItems: [
            { id: "manual-needed", name: "Limes", quantity: 3, unit: "pcs", state: "Needed" },
            { id: "manual-removed", name: "Salt", quantity: 1, unit: "pack", state: "Don't need" },
          ],
        },
      },
    }],
    nutrition_planned_occurrences: [{
      id: occurrenceId,
      week_id: weekId,
      user_id: userId,
      source_type: "recipe",
      frozen_snapshot: {
        shoppingIngredients: [
          { foodId, name: "Chicken", quantity: 500, unit: "g" },
          { foodId: "55555555-5555-4555-8555-555555555555", name: "Rice", quantity: 300, unit: "g" },
        ],
      },
      status: "planned",
    }],
    user_grocery_items: [{ id: "legacy-grocery-sentinel", user_id: userId }],
  };

  from(table: string) {
    if (table === "user_grocery_items") {
      throw new Error("Today Shopping must not read the retired grocery authority.");
    }
    return new Query(table, this.data[table] ?? [], this.selectedTables);
  }
}

describe("Today Shopping V1 projection", () => {
  it("projects the containing MealPlanWeek Shopping state and excludes Don't need items", async () => {
    const client = new FakeSupabase();
    const result = await readTodayShoppingProjection({
      supabase: client as unknown as SupabaseClient,
      userId,
      date: "2026-08-03",
      timezone: "Europe/Berlin",
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    expect(client.selectedTables).toEqual([
      "nutrition_meal_plan_weeks",
      "nutrition_planned_occurrences",
    ]);
    expect(result).toEqual({
      itemCount: 2,
      items: [
        {
          id: `derived:${foodId}|g|`,
          weekStart: "2026-08-01",
          itemName: "Chicken",
          quantity: 750,
          unit: "g",
          storeSection: "Other",
          checked: true,
          alreadyHave: false,
        },
        {
          id: "manual:manual-needed",
          weekStart: "2026-08-01",
          itemName: "Limes",
          quantity: 3,
          unit: "pcs",
          storeSection: "Other",
          checked: false,
          alreadyHave: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("legacy-grocery-sentinel");
    expect(JSON.stringify(result)).not.toContain("Rice");
    expect(JSON.stringify(result)).not.toContain("Salt");
  });
});
