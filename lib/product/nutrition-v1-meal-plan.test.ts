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

  it("uses a localized week range and seven-day selection strip without Day Week Shopping peer tabs", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const strip = source("components/nutrition/meal-plan/week-strip.tsx");
    expect(page).toContain("WeekStrip");
    expect(page).toContain("PlannedNutritionSummary");
    expect(page).toContain("MealSlotSection");
    expect(page).not.toContain("TabsTrigger");
    expect(page).not.toMatch(/Day\s*\|\s*Week\s*\|\s*Shopping/);
    expect(strip).toContain("useNutritionV1Translation");
    expect(strip).toContain('aria-current={selected ? "date" : undefined}');
    expect(strip).toContain('nt("today")');
  });

  it("opens one localized search-first Add workspace with Recent Favorites More and secondary Barcode access", () => {
    const add = source("components/nutrition/meal-plan/add-to-plan-workspace.tsx");
    expect(add).toContain("useNutritionV1Translation");
    expect(add).toContain('nt("searchFoodsRecipesMeals")');
    expect(add).toContain('nt("recent")');
    expect(add).toContain('nt("favorites")');
    expect(add).toContain('nt("more")');
    expect(add).toContain('nt("barcode")');
    expect(add).toContain("normalizeProductBarcode");
    expect(add).toContain('nt("addPlaceholder")');
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

  it("keeps plan-to-actual explicit and exposes localized structured pending ChatGPT changes without chat UI", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const pending = source("components/nutrition/meal-plan/pending-change-review.tsx");
    expect(page).toContain('const markEatenLabel = "Mark eaten"');
    expect(page).toContain('const logWithChangesLabel = "Log with changes"');
    expect(pending).toContain("useNutritionV1Translation");
    expect(pending).toContain('nt("approveAll")');
    expect(pending).toContain('nt("cancel")');
    expect(pending).toContain('nt("staleProposal")');
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

  it("wires the platform-neutral offline queue into durable web cache and distinct visible sync states", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(page).toContain("deserializeMealPlanQueue");
    expect(page).toContain("serializeMealPlanQueue");
    expect(page).toContain("localStorage");
    expect(page).toContain("Saving");
    expect(page).toContain("Saved");
    expect(page).toContain("Waiting to sync");
    expect(page).toContain("Needs attention");
    expect(page).toContain("Conflict");
    expect(page).toContain("navigator.onLine");
    expect(page).toMatch(/!navigator\.onLine[\s\S]{0,220}queueState/);
  });

  it("distinguishes Complete, Partial, and Estimated planned nutrition without treating unknown values as zero", () => {
    const summary = source("components/nutrition/meal-plan/planned-nutrition-summary.tsx");
    expect(summary).toContain("estimatedNutrition");
    expect(summary).toContain('"Complete"');
    expect(summary).toContain('"Partial"');
    expect(summary).toContain('"Estimated"');
    expect(summary).toContain("incomplete");
    expect(summary).toMatch(/difference[\s\S]{0,180}incomplete/);
    expect(summary).not.toMatch(/numberOrNull\([^)]*\)\s*\?\?\s*0/);
  });

  it("protects Shopping manual quantity notes state and offers explicit carry-forward", () => {
    const shopping = source("components/nutrition/meal-plan/shopping-list.tsx");
    const dictionary = source("lib/i18n/nutrition-v1.ts");
    expect(shopping).toContain("useNutritionV1Translation");
    expect(shopping).toContain('nt("manualQuantity")');
    expect(dictionary).toContain('manualQuantity: "Manual quantity"');
    expect(shopping).toContain("notes");
    expect(shopping).toContain('nt("carryUnchecked")');
  });

  it("derives week start from locale with an optional owner-scoped override and preserves explicit historical starts", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const correction = source("supabase/migrations/20260825120350_nutrition_v1_meal_plan_week_start_authority.sql");
    const verification = source("supabase/verification/nutrition-v1-meal-plan-week-start.sql");
    expect(page).toContain("localeWeekStartDay");
    expect(page).toContain("weekStartOverrideKey");
    expect(page).toContain('nt("weekStarts")');
    expect(page).not.toContain("function monday(");
    expect(correction).toContain("drop constraint");
    expect(correction).toContain("isodow");
    expect(verification).toContain("still restricted to a fixed weekday");
  });

  it("offers bounded meal day and week copy operations that create new occurrence identities", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(page).toContain("copyPlannedOccurrences");
    expect(page).toContain("Copy day");
    expect(page).toContain('nt("copyWeek")');
    expect(page).toContain("crypto.randomUUID");
    expect(page).not.toContain("recurrenceRule");
  });

  it("keeps reminders off by default and requests notification permission only from an explicit user action", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    expect(page).toContain("Reminder off");
    expect(page).toContain("Enable reminder");
    expect(page).toContain("Notification.requestPermission");
    expect(page).toContain("reminderEnabled");
    expect(page).toContain("plannedTime");
    expect(page).toContain("cancelMealReminder");
    expect(page).not.toContain("useEffect(() => { void enableMealReminder");
  });

  it("lets a skipped source be reviewed and removed from Shopping without changing Shopping on Skip itself", () => {
    const page = source("components/nutrition/meal-plan/meal-plan-page.tsx");
    const shopping = source("components/nutrition/meal-plan/shopping-list.tsx");
    expect(page).toContain("Review & Remove");
    expect(page).toContain("shoppingExcludedOccurrenceIds");
    expect(shopping).toContain("shoppingExcludedOccurrenceIds");
    expect(shopping).toContain("sourceOccurrenceIds");
  });

  it("keeps the legacy grocery panel explicitly compatibility-only while canonical Shopping owns Nutrition V1", () => {
    const grocery = source("components/meals/grocery-list-panel.tsx");
    expect(grocery).toContain("Legacy Grocery compatibility surface");
    expect(grocery).toContain("Nutrition V1 Shopping lives at /my-meal-plan/shopping");
  });
});
