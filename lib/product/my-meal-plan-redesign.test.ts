import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("My Meal Plan redesign contracts", () => {
  it("keeps Day, Week, and Shopping as the only workspace tabs", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    expect(client).toContain('<TabsTrigger value="day">');
    expect(client).toContain('<TabsTrigger value="week">');
    expect(client).toContain('<TabsTrigger value="shopping">');
    expect(client).not.toContain('value="preferences"');
    expect(client).not.toContain("MealPlanCalendar");
  });

  it("uses date-aware targets and latest-request-wins resource state", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    expect(client).toContain("getEatTargetForDate(user.id, selectedDate)");
    expect(client).toContain("requestIds.current.day");
    expect(client).toContain("requestIds.current.week");
    expect(client).toContain("requestIds.current.target");
    expect(client).not.toContain("window.innerWidth");
  });

  it("routes completion and completed correction through atomic RPCs", () => {
    const service = source("services/database/meal-plan.ts");
    expect(service).toContain('.rpc("complete_meal_plan_item"');
    expect(service).toContain('.rpc("correct_completed_meal_plan_item"');
    expect(service).toContain('item.status === "skipped"');
    expect(service).not.toContain("crypto.randomUUID()");
  });

  it("locks, owns, and atomically links completed meals in the migration", () => {
    const migration = source("supabase/migrations/20260713153000_meal_plan_atomic_execution.sql");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("for update");
    expect(migration).toContain("user_meal_plan_items_unique_food_log");
    expect(migration).toContain("user_grocery_items_unique_meal_source");
    expect(migration).toContain("user_meal_plan_items_execution_state_check");
    expect(migration).toContain("grant execute on function public.complete_meal_plan_item(uuid) to authenticated");
    expect(migration).toContain("revoke all on function public.complete_meal_plan_item(uuid) from public, anon");
  });

  it("keeps Food Preferences saved while making the action dirty-state aware", () => {
    const form = source("components/meals/my-meal-plan/food-preferences-form.tsx");
    expect(form).toContain("JSON.stringify(form) !== JSON.stringify(saved)");
    expect(form).toContain("disabled={!dirty || saving}");
    expect(form).toContain("preferred_cuisines");
    expect(form).toContain("disliked_foods");
    expect(form).toContain("meal_prep_days");
    expect(form).toContain("kitchen_equipment");
    expect(form).toContain("grocery_style_preference");
  });
});
