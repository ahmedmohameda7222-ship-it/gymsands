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

  it("uses date-aware targets, one batched Week path, and latest-request-wins state", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    expect(client).toContain("getEatTargetForDate(user.id, selectedDate)");
    expect(client).toContain("getEatTargetsForDates(user.id, weekDays)");
    expect(client).not.toContain("Promise.all(weekDays.map");
    expect(client).toContain("requestIds.current.day");
    expect(client).toContain("requestIds.current.week");
    expect(client).toContain("requestIds.current.target");
    expect(client).not.toContain("window.innerWidth");
  });

  it("uses accessible stable disclosures and action menus instead of native details", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    const menu = source("components/ui/action-menu.tsx");
    const disclosure = source("components/ui/disclosure.tsx");
    expect(client).toContain("<Disclosure");
    expect(client).toContain("<ActionMenu");
    expect(client).not.toContain("<details");
    expect(menu).toContain('event.key !== "Escape"');
    expect(menu).toContain('role="menu"');
    expect(menu).toContain('role="menuitem"');
    expect(menu).toContain("triggerRef.current?.focus()");
    expect(disclosure).toContain("aria-expanded={open}");
    expect(disclosure).toContain("aria-controls={panelId}");
  });

  it("fully localizes corrected meal-plan actions and accessible labels", () => {
    const client = source("components/meals/my-meal-plan/my-meal-plan-page-client.tsx");
    const copy = source("lib/meals/meal-plan-copy.ts");
    const tags = source("components/ui/tag-input.tsx");
    expect(client).toContain("label={c.date}");
    expect(client).toContain("aria-label={c.closeNotice}");
    expect(copy).toContain('replaceDesc: "Ersetze');
    expect(copy).toContain('replaceDesc: "استبدل');
    expect(copy).toContain('date: "Datum"');
    expect(copy).toContain('date: "التاريخ"');
    expect(tags).toContain("addLabel = \"Add\"");
    expect(tags).toContain("removeLabel = \"Remove\"");
  });

  it("routes all live completion and linked correction consumers through atomic RPC services", () => {
    const planService = source("services/database/meal-plan.ts");
    const atomicEat = source("services/database/eat-meal-plan-atomic.ts");
    const eatPage = source("components/meals/eat-page.tsx");
    const eatLog = source("components/meals/eat-food-log.tsx");
    expect(planService).toContain('.rpc("complete_meal_plan_item"');
    expect(planService).toContain('.rpc("correct_completed_meal_plan_item"');
    expect(atomicEat).toContain('.rpc("complete_meal_plan_item_with_values"');
    expect(atomicEat).toContain('.rpc("correct_completed_meal_plan_item"');
    expect(eatPage).toContain("completeMealPlanItemWithDraftAtomic");
    expect(eatPage).not.toContain("completeMealPlanItemWithDraft,");
    expect(eatLog).toContain("updateEatFoodLogAtomic");
    expect(eatLog).not.toContain("updateEatFoodLog,");
  });

  it("locks, owns, grants, and atomically links completed meals in the migration", () => {
    const migration = source("supabase/migrations/20260713153000_meal_plan_atomic_execution.sql");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("for update");
    expect(migration).toContain("user_meal_plan_items_unique_food_log");
    expect(migration).toContain("user_grocery_items_unique_meal_source");
    expect(migration).toContain("user_meal_plan_items_execution_state_check");
    expect(migration).toContain("complete_meal_plan_item_with_values");
    expect(migration).toContain("grant execute on function public.complete_meal_plan_item(uuid) to authenticated");
    expect(migration).toContain("revoke all on function public.complete_meal_plan_item(uuid) from public, anon");
  });

  it("protects Food Preferences loading, editable-only payloads, and invalid numeric input", () => {
    const form = source("components/meals/my-meal-plan/food-preferences-form.tsx");
    const state = source("lib/meals/food-preferences-state.ts");
    const service = source("services/database/execution-layer.ts");
    expect(form).toContain('state.phase === "load-error"');
    expect(form).toContain("foodPreferencesCanSave(state)");
    expect(form).toContain("aria-describedby={error ? errorId : undefined}");
    expect(state).toContain('phase: "loaded-empty"');
    expect(state).toContain('phase: "load-error"');
    expect(service).toContain("mapNutritionPreferenceRowToInput");
    expect(service).not.toContain("return data as UserNutritionPreferenceProfile");
  });

  it("restores localized route-level unexpected-render protection", () => {
    const errorRoute = source("app/(private)/my-meal-plan/error.tsx");
    expect(errorRoute).toContain("<RouteError");
    expect(errorRoute).toContain("c.unexpectedTitle");
    expect(errorRoute).toContain("c.unexpectedDesc");
  });
});
