import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Eat meal-log redesign contracts", () => {
  it("uses a focused Eat route with URL-backed day and week state", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(source("app/(private)/calories/page.tsx")).toContain("<EatPage />");
    expect(route).toContain("parseEatView(rawView)");
    expect(route).toContain("parseEatDate(rawDate, today)");
    expect(route).toContain('view === "day"');
    expect(route).toContain('view === "week"');
    expect(route).not.toContain('"targets"');
    expect(route).not.toContain('"tools"');
  });

  it("keeps Add Food permanent and opens the existing shared ChatGPT surface with typed Eat context", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(route).toContain(
      'openPrompts({ source: "eat", mode: "home", selectedDate })',
    );
    expect(route).toContain('source: "eat-planned-meal"');
    expect(route).toContain('promptId: "estimate-meal-photo"');
    expect(route).toContain("<EatAddFoodSurface");
    expect(
      source("components/meals/eat-add-food-surface.tsx").match(/<Dialog /g)
        ?.length,
    ).toBe(1);
    expect(source("components/meals/eat-add-food-surface.tsx")).toContain(
      'layout="responsive-drawer"',
    );
  });

  it("uses the canonical OpenAI Blossom in the Eat header and planned-meal action", () => {
    const route = source("components/meals/eat-page.tsx");
    const day = source("components/meals/eat-day-sections.tsx");
    expect(route).toContain("OpenAiBlossom");
    expect(day).toContain("OpenAiBlossom");
    expect(day).toContain('ert("adjustWithChatGpt")');
    expect(day).not.toContain("<Sparkles");
  });

  it("renders grouped editable food logs with an unchanged Other fallback", () => {
    const log = source("components/meals/eat-food-log.tsx");
    const model = source("lib/eat/eat-model.ts");
    expect(log).toContain("EAT_MEAL_GROUPS.map");
    expect(log).toContain("updateEatFoodLog");
    expect(log).toContain("deleteEatFoodLog");
    expect(model).toContain('return "Other"');
    expect(model).toContain(
      '["Breakfast", "Lunch", "Dinner", "Snack", "Other"]',
    );
  });

  it("keeps progress truthful and water separate", () => {
    const day = source("components/meals/eat-day-sections.tsx");
    const model = source("lib/eat/eat-model.ts");
    expect(day).toContain("EatNutritionProgress");
    expect(day).toContain("CompactHydration");
    expect(model).toContain(
      'if (consumed === null) return "unavailable"',
    );
    expect(model).toContain(
      'if (target === null || target <= 0) return "no-target"',
    );
    expect(model).toContain(
      'if (ratio <= 1 + tolerance) return "near"',
    );
  });

  it("uses stored servings only when no conversion metadata exists", () => {
    const model = source("lib/eat/eat-model.ts");
    const addFood = source("components/meals/eat-add-food-surface.tsx");
    expect(model).toContain('id: "stored"');
    expect(addFood).toContain("supportedServingOptions(food)");
    expect(addFood).not.toContain(
      'serving_size: `${food.serving_size}',
    );
  });

  it("uses one date-backed target selector and one editor without the estimator or duplicate cards", () => {
    const page = source(
      "app/(private)/settings/nutrition-targets/page.tsx",
    );
    const targets = source(
      "components/meals/nutrition-target-settings.tsx",
    );
    expect(page).toContain("parseEatDate(rawDate, today)");
    expect(page).toContain("router.replace");
    expect(targets).toContain(
      "const choices: NutritionTargetAssignment[]",
    );
    expect(targets).toContain('role="radiogroup"');
    expect(targets).toContain("<TargetField");
    expect(targets).not.toContain("estimateTdee");
    expect(targets).not.toContain("Estimate Targets");
    expect(targets).not.toContain("getOnboarding");
    expect(targets).not.toContain("getProgressEntries");
    expect(targets).not.toContain("profiles.map");
  });

  it("persists per-date target assignments through an authenticated atomic RPC", () => {
    const migration = source(
      "supabase/migrations/20260712195000_nutrition_target_date_overrides.sql",
    );
    const service = source(
      "services/database/nutrition-target-assignments.ts",
    );
    expect(migration).toContain(
      "create table public.user_nutrition_target_date_overrides",
    );
    expect(migration).toContain("unique (user_id, target_date)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "create or replace function public.apply_nutrition_target_changes",
    );
    expect(service).toContain('.rpc("apply_nutrition_target_changes"');
    expect(service).toContain("getNutritionTargetDateOverride");
    expect(service).toContain("NutritionTargetApplyConsistencyError");
  });

  it("uses one server-first verified batch path for legacy target assignments", () => {
    const service = source(
      "services/database/nutrition-target-assignments.ts",
    );
    const batch = service
      .split(
        "export async function migrateLegacyNutritionTargetOverridesForDates",
      )[1]
      .split(
        "export async function migrateLegacyNutritionTargetOverride(userId",
      )[0];
    const wrapper = service
      .split(
        "export async function migrateLegacyNutritionTargetOverride(userId",
      )[1]
      .split("export type ApplyNutritionTargetChangesInput")[0];
    expect(batch.indexOf("getNutritionTargetDateOverrides")).toBeLessThan(
      batch.indexOf("window.localStorage.getItem"),
    );
    expect(batch).toContain(".upsert(candidates");
    expect(batch.match(/getNutritionTargetDateOverrides/g)?.length).toBe(2);
    expect(batch.indexOf("const verified =")).toBeLessThan(
      batch.indexOf("window.localStorage.removeItem"),
    );
    expect(batch).toContain("row.user_id !== userId");
    expect(wrapper).toContain(
      "migrateLegacyNutritionTargetOverridesForDates(userId, [date])",
    );
  });

  it("protects unapplied target changes with a tokenized history sentinel", () => {
    const guard = source("lib/hooks/use-unsaved-changes-guard.tsx");
    const sentinel = source("lib/hooks/unsaved-history-sentinel.ts");
    const targets = source(
      "components/meals/nutrition-target-settings.tsx",
    );
    expect(targets).toContain("useUnsavedChangesGuard");
    expect(guard).toContain("bindUnsavedBeforeUnload");
    expect(guard).toContain('window.addEventListener("popstate"');
    expect(guard).toContain(
      'document.addEventListener("click", captureLinks, true)',
    );
    expect(guard).toContain("applyAndContinue");
    expect(guard).toContain("discardAndContinue");
    expect(sentinel).toContain("UNSAVED_HISTORY_TOKEN_KEY");
    expect(sentinel).toContain("replaceState");
    expect(sentinel).not.toContain("pushState");
    expect(sentinel).not.toContain("go(-2)");
  });

  it("keeps default Return to Eat date-aware while preserving only safe custom returns", () => {
    const page = source(
      "app/(private)/settings/nutrition-targets/page.tsx",
    );
    const targets = source(
      "components/meals/nutrition-target-settings.tsx",
    );
    const model = source("lib/eat/nutrition-target-return.ts");
    expect(page).toContain("parseNutritionTargetsReturnDestination");
    expect(targets).toContain(
      "resolveNutritionTargetsReturnHref(returnDestination, selectedDate)",
    );
    expect(targets).toContain(
      "buildNutritionTargetsDateHref(date, returnDestination)",
    );
    expect(model).toContain('kind: "default-eat"');
    expect(model).toContain('kind: "custom"');
    expect(model).toContain('value.startsWith("//")');
    expect(model).toContain('value.includes("\\\\")');
  });

  it("keeps verified Eat overrides and Today on the approved pure target precedence", () => {
    const eatPage = source("components/meals/eat-page.tsx");
    const eatTargets = source("services/database/eat-targets.ts");
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const projection = source(
      "services/dashboard/today-projection-server.ts",
    );
    const activeTarget = source("services/nutrition/active-target.ts");

    expect(eatPage).toContain("getEatTargetForDate");
    expect(eatTargets).toContain(
      "migrateLegacyNutritionTargetOverridesForDates(userId, dates)",
    );
    expect(eatTargets).toContain("resolveEatTargetForDate");
    expect(activeTarget).toContain("export function resolveEatTargetForDate");
    expect(projection).toContain("resolveActiveNutritionTarget");
    expect(projection).toContain(
      "user_nutrition_target_date_overrides",
    );
    expect(dashboard).toContain(
      "subscribeToTodayNutritionTargetChanges",
    );
    expect(dashboard).toContain("getTodayProjection");
    expect(dashboard).not.toContain("getTodayNutritionTargetData");
    expect(dashboard).not.toContain("getEatTargetForDate");
    expect(dashboard).not.toContain("getActiveTargetOverride");
    expect(dashboard).not.toContain("localStorage");
    expect(projection).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(activeTarget).not.toContain("getActiveTargetOverride");
  });

  it("keeps target administration outside Eat and removes DOM cleanup", () => {
    expect(
      existsSync("app/(private)/settings/nutrition-targets/page.tsx"),
    ).toBe(true);
    expect(source("components/meals/eat-day-sections.tsx")).toContain(
      "/settings/nutrition-targets",
    );
    expect(source("app/(private)/settings/page.tsx")).toContain(
      'href: "/settings/nutrition-targets"',
    );
    expect(existsSync("components/meals/nutrition-copy-cleanup.tsx")).toBe(
      false,
    );
    expect(source("app/(private)/calories/layout.tsx")).not.toContain(
      "MutationObserver",
    );
  });

  it("removes obsolete Eat administration and analytics components", () => {
    [
      "components/meals/food-log-list.tsx",
      "components/meals/recent-food-strip.tsx",
      "components/meals/nutrition-target-profiles.tsx",
      "components/meals/calories-page-sections.tsx",
      "components/meals/api-food-tools.tsx",
    ].forEach((path) => expect(existsSync(path)).toBe(false));
  });

  it("uses ownership-scoped mutations and duplicate protection", () => {
    const service = source("services/database/eat.ts");
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain("foodLogDuplicateKey");
    expect(service).toContain("Copied from ${sourceDate}:${log.id}");
    expect(service).toContain('.eq("status", "planned")');
  });

  it("compensates and verifies linked edits through one canonical service", () => {
    const service = source("services/database/eat.ts");
    const edit = service
      .split("export async function updateEatFoodLog")[1]
      .split("export async function deleteEatFoodLog")[0];
    expect(edit).toContain("const originalLog = await readFoodLog");
    expect(edit).toContain("const originalLinked = await readLinkedMeal");
    expect(edit).toContain("restoreLinkedEdit");
    expect(edit).toContain("terminalValuesMatch");
    expect(edit).toContain("EatLinkedEditConsistencyError");
    expect(edit).not.toContain("status:");
    expect(edit).not.toContain("completed_at:");
  });

  it("reloads server state after a critical linked-edit failure", () => {
    const foodLog = source("components/meals/eat-food-log.tsx");
    expect(foodLog).toContain("isEatLinkedEditConsistencyError");
    expect(foodLog).toContain("getEatFoodLogs(userId, editing.log_date)");
    expect(foodLog).toContain(
      "getEatMealPlanItems(userId, editing.log_date)",
    );
  });

  it("prevents terminal linked-log deletion before mutating data", () => {
    const service = source("services/database/eat.ts");
    const deletion = service
      .split("export async function deleteEatFoodLog")[1]
      .split("export async function logRepeatFood")[0];
    expect(deletion.indexOf("if (linked.data)")).toBeLessThan(
      deletion.indexOf('.from("food_logs").delete()'),
    );
    expect(deletion).toContain("completed meal states are permanent");
    expect(deletion).not.toContain('status: "planned"');
  });

  it("completes adjusted planned meals without reverting terminal states", () => {
    const service = source("services/database/eat.ts");
    const completion = service.split(
      "export async function completeMealPlanItemWithDraft",
    )[1];
    expect(completion).toContain('status: "done"');
    expect(completion).toContain('.eq("status", "planned")');
    expect(completion).toContain('from("food_logs").delete()');
    expect(completion).not.toContain('update({ status: "planned"');
  });

  it("initializes repeat logging from the visible suggested meal", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(route).toContain(
      "const initialSuggestedMeal = suggestMealType",
    );
    expect(route).toContain("useState<MealType>(initialSuggestedMeal)");
    expect(route).toContain(
      "if (!addFoodOpen) setAddFoodMeal(suggestedMeal)",
    );
  });

  it("keeps the dedicated Food Hub builder free of date-unsafe plan writes", () => {
    const hub = source("app/(private)/calories/food-hub/page.tsx");
    expect(hub).toContain("CustomNutritionManager");
    expect(hub).not.toContain("FoodBrowser");
    expect(hub).toContain("returnHref");
  });

  it("resolves Week targets independently after verified batch migration", () => {
    const route = source("components/meals/eat-page.tsx");
    const targets = source("services/database/eat-targets.ts");
    const week = source("components/meals/eat-week-view.tsx");
    expect(route).toMatch(
      /getEatWeekTargets\(\s*userId,\s*selectedDate,?\s*\)/,
    );
    expect(targets).toContain(
      "migrateLegacyNutritionTargetOverridesForDates(userId, dates)",
    );
    expect(targets).toContain("resolveEatTargetForDate");
    expect(week).toContain("targetsByDate");
    expect(week).toContain("getEatTargetForDate");
  });
});
