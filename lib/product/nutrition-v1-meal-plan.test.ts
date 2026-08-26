import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Nutrition V1 Meal Plan product contract", () => {
  it("makes the canonical route render the week-first Nutrition workspace instead of the legacy tab client", () => {
    const route = source("app/(private)/my-meal-plan/page.tsx");
    expect(route).toContain('from "@/components/nutrition/meal-plan/meal-plan-page"');
    expect(route).toContain("<MealPlanPage");
    expect(route).not.toContain("MyMealPlanBuilder");
  });

  it("uses a week range and seven-day selection strip without Day Week Shopping peer tabs", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const strip = source("components/nutrition/meal-plan/week-strip.tsx");
    expect(page).toContain("WeekStrip");
    expect(page).toContain("PlannedNutritionSummary");
    expect(page).toContain("MealSlotSection");
    expect(page).not.toContain("TabsTrigger");
    expect(page).not.toMatch(/Day\s*\|\s*Week\s*\|\s*Shopping/);
    expect(strip).toContain('aria-current={selected ? "date" : undefined}');
    expect(strip).toContain("Today");
  });

  it("opens one search-first Add workspace with explicit Recent and Favorites instead of a method picker", () => {
    const add = source("components/nutrition/meal-plan/add-to-plan-workspace.tsx");
    expect(add).toContain('placeholder="Search foods, recipes, meals…"');
    expect(add).toContain("Recent");
    expect(add).toContain("Favorites");
    expect(add).toContain("Add Placeholder");
    expect(add).toContain("selectedItems");
    expect(add).not.toContain("chooseMethod");
    expect(add).not.toContain("method picker");
  });

  it("keeps Shopping as a nested route tied to the active week", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const shoppingRoute = source("app/(private)/my-meal-plan/shopping/page.tsx");
    const shopping = source("components/nutrition/meal-plan/shopping-list.tsx");
    expect(page).toContain("/my-meal-plan/shopping");
    expect(shoppingRoute).toContain("<ShoppingList");
    expect(shopping).toContain("Needed");
    expect(shopping).toContain("Purchased");
    expect(shopping).toContain("Don't need");
    expect(shopping).toContain("sourceOccurrenceIds");
  });

  it("keeps plan-to-actual explicit and exposes structured pending ChatGPT changes without chat UI", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const pending = source("components/nutrition/meal-plan/pending-change-review.tsx");
    expect(page).toContain("Mark eaten");
    expect(page).toContain("Log with changes");
    expect(pending).toContain("Approve all");
    expect(pending).toContain("Cancel");
    expect(pending).toContain("stale");
    expect(pending).not.toContain("chat bubble");
    expect(pending).not.toContain("typing");
  });

  it("uses authenticated canonical week API authority and never accepts owner identity from the browser payload", () => {
    const route = source("app/api/nutrition/v1/meal-plan/week/route.ts");
    expect(route).toContain("requireNutritionUser(request)");
    expect(route).toContain("getMealPlanWeek");
    expect(route).toContain("mutateMealPlanWeek");
    expect(route).toContain("completeMealPlanOccurrence");
    expect(route).toContain("applyMealPlanChangeRequest");
    expect(route).not.toMatch(/body\.userId|body\.user_id/);
  });

  it("provides explicit non-drag planning and execution actions for each planned occurrence", () => {
    const slot = source("components/nutrition/meal-plan/meal-slot-section.tsx");
    expect(slot).toContain("Skip");
    expect(slot).toContain("Edit");
    expect(slot).toContain("Move");
    expect(slot).toContain("Copy");
    expect(slot).toContain("Log with changes");
  });

  it("persists empty custom slots independently of whether they already contain an item", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(page).toContain("customSlots");
    expect(page).toContain("Add meal slot");
    expect(page).toContain("weekOverride");
  });

  it("wires the platform-neutral offline queue into durable web cache and visible sync states", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(page).toContain("deserializeMealPlanQueue");
    expect(page).toContain("serializeMealPlanQueue");
    expect(page).toContain("localStorage");
    expect(page).toContain("Waiting to sync");
    expect(page).toContain("Needs attention");
  });

  it("protects Shopping manual quantity notes state and offers explicit carry-forward", () => {
    const shopping = source("components/nutrition/meal-plan/shopping-list.tsx");
    expect(shopping).toContain("manual quantity");
    expect(shopping).toContain("notes");
    expect(shopping).toContain("Carry unchecked items to next week");
  });
});
