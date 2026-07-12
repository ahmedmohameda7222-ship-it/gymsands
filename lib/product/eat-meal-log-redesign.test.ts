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
    expect(route).toContain('openPrompts({ source: "eat", mode: "home", selectedDate })');
    expect(route).toContain('source: "eat-planned-meal"');
    expect(route).toContain('promptId: "estimate-meal-photo"');
    expect(route).toContain("<EatAddFoodSurface");
    expect(source("components/meals/eat-add-food-surface.tsx").match(/<Dialog /g)?.length).toBe(1);
    expect(source("components/meals/eat-add-food-surface.tsx")).toContain('layout="responsive-drawer"');
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
    expect(model).toContain('["Breakfast", "Lunch", "Dinner", "Snack", "Other"]');
  });

  it("keeps progress truthful and water separate", () => {
    const day = source("components/meals/eat-day-sections.tsx");
    const model = source("lib/eat/eat-model.ts");
    expect(day).toContain("EatNutritionProgress");
    expect(day).toContain("CompactHydration");
    expect(model).toContain('if (consumed === null) return "unavailable"');
    expect(model).toContain('if (target === null || target <= 0) return "no-target"');
    expect(model).toContain('if (ratio <= 1 + tolerance) return "near"');
  });

  it("uses stored servings only when no conversion metadata exists", () => {
    const model = source("lib/eat/eat-model.ts");
    const addFood = source("components/meals/eat-add-food-surface.tsx");
    expect(model).toContain('id: "stored"');
    expect(addFood).toContain("supportedServingOptions(food)");
    expect(addFood).not.toContain('serving_size: `${food.serving_size}');
  });

  it("uses one date-backed target selector and one editor without the estimator or duplicate cards", () => {
    const page = source("app/(private)/settings/nutrition-targets/page.tsx");
    const targets = source("components/meals/nutrition-target-settings.tsx");
    expect(page).toContain("parseEatDate(rawDate, today)");
    expect(page).toContain("router.replace");
    expect(targets).toContain("const choices: NutritionTargetAssignment[]");
    expect(targets).toContain('role="radiogroup"');
    expect(targets).toContain("<TargetField");
    expect(targets).not.toContain("estimateTdee");
    expect(targets).not.toContain("Estimate Targets");
    expect(targets).not.toContain("getOnboarding");
    expect(targets).not.toContain("getProgressEntries");
    expect(targets).not.toContain("profiles.map");
  });

  it("persists per-date target assignments through an authenticated atomic RPC", () => {
    const migration = source("supabase/migrations/20260712195000_nutrition_target_date_overrides.sql");
    const service = source("services/database/nutrition-target-assignments.ts");
    expect(migration).toContain("create table public.user_nutrition_target_date_overrides");
    expect(migration).toContain("unique (user_id, target_date)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("create or replace function public.apply_nutrition_target_changes");
    expect(service).toContain('.rpc("apply_nutrition_target_changes"');
    expect(service).toContain("getNutritionTargetDateOverride");
    expect(service).toContain("NutritionTargetApplyConsistencyError");
  });

  it("uses server-first legacy localStorage migration and removes the local key only after verification", () => {
    const service = source("services/database/nutrition-target-assignments.ts");
    const migration = service.split("export async function migrateLegacyNutritionTargetOverride")[1].split("export type ApplyNutritionTargetChangesInput")[0];
    expect(migration.indexOf("getNutritionTargetDateOverride")).toBeLessThan(migration.indexOf("window.localStorage.getItem"));
    expect(migration.indexOf("const verified = await getNutritionTargetDateOverride")).toBeLessThan(migration.indexOf("window.localStorage.removeItem"));
    expect(migration).not.toContain("setItem");
  });

  it("protects unapplied target changes through one reusable guard", () => {
    const guard = source("lib/hooks/use-unsaved-changes-guard.tsx");
    const targets = source("components/meals/nutrition-target-settings.tsx");
    expect(targets).toContain("useUnsavedChangesGuard");
    expect(guard).toContain('window.addEventListener("beforeunload"');
    expect(guard).toContain('window.addEventListener("popstate"');
    expect(guard).toContain('document.addEventListener("click", captureLinks, true)');
    expect(guard).toContain("applyAndContinue");
    expect(guard).toContain("discardAndContinue");
    expect(guard).toContain("setPending(null)");
    expect(guard).toContain("removeEventListener");
  });

  it("keeps target administration outside Eat and removes DOM cleanup", () => {
    expect(existsSync("app/(private)/settings/nutrition-targets/page.tsx")).toBe(true);
    expect(source("components/meals/eat-day-sections.tsx")).toContain("/settings/nutrition-targets");
    expect(source("app/(private)/settings/page.tsx")).toContain('href: "/settings/nutrition-targets"');
    expect(existsSync("components/meals/nutrition-copy-cleanup.tsx")).toBe(false);
    expect(source("app/(private)/calories/layout.tsx")).not.toContain("MutationObserver");
  });

  it("removes obsolete Eat administration and analytics components", () => {
    ["components/meals/food-log-list.tsx", "components/meals/recent-food-strip.tsx", "components/meals/nutrition-target-profiles.tsx", "components/meals/calories-page-sections.tsx", "components/meals/api-food-tools.tsx"].forEach((path) => expect(existsSync(path)).toBe(false));
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
    const edit = service.split("export async function updateEatFoodLog")[1].split("export async function deleteEatFoodLog")[0];
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
    expect(foodLog).toContain("getEatMealPlanItems(userId, editing.log_date)");
  });

  it("prevents terminal linked-log deletion before mutating data", () => {
    const service = source("services/database/eat.ts");
    const deletion = service.split("export async function deleteEatFoodLog")[1].split("export async function logRepeatFood")[0];
    expect(deletion.indexOf("if (linked.data)")).toBeLessThan(deletion.indexOf('.from("food_logs").delete()'));
    expect(deletion).toContain("completed meal states are permanent");
    expect(deletion).not.toContain('status: "planned"');
  });

  it("completes adjusted planned meals without reverting terminal states", () => {
    const service = source("services/database/eat.ts");
    const completion = service.split("export async function completeMealPlanItemWithDraft")[1];
    expect(completion).toContain('status: "done"');
    expect(completion).toContain('.eq("status", "planned")');
    expect(completion).toContain('from("food_logs").delete()');
    expect(completion).not.toContain('update({ status: "planned"');
  });

  it("initializes repeat logging from the visible suggested meal", () => {
    const route = source("components/meals/eat-page.tsx");
    expect(route).toContain("const initialSuggestedMeal = suggestMealType");
    expect(route).toContain("useState<MealType>(initialSuggestedMeal)");
    expect(route).toContain("if (!addFoodOpen) setAddFoodMeal(suggestedMeal)");
  });

  it("keeps the dedicated Food Hub builder free of date-unsafe plan writes", () => {
    const hub = source("app/(private)/calories/food-hub/page.tsx");
    expect(hub).toContain("CustomNutritionManager");
    expect(hub).not.toContain("FoodBrowser");
    expect(hub).toContain("returnHref");
  });

  it("resolves Week targets independently for every date from server assignments", () => {
    const route = source("components/meals/eat-page.tsx");
    const targets = source("services/database/eat-targets.ts");
    const week = source("components/meals/eat-week-view.tsx");
    expect(route).toContain("getEatWeekTargets(userId, selectedDate)");
    expect(targets).toContain("getNutritionTargetDateOverrides");
    expect(targets).toContain("byDate.get(date)");
    expect(week).toContain("applyWeekTargets");
    expect(week).toContain("targetEligibleLoggedDays");
  });

  it("uses centralized display and reverse-conversion helpers in the remaining target editor", () => {
    const units = source("lib/eat/eat-units.ts");
    const draft = source("lib/eat/nutrition-target-draft.ts");
    const foodLog = source("components/meals/eat-food-log.tsx");
    expect(units).toContain("eatEnergyInputToKcal");
    expect(units).toContain("eatLiquidInputToMl");
    expect(draft).toContain("eatEnergyInputToKcal");
    expect(draft).toContain("eatLiquidInputToMl");
    expect(draft).not.toContain("eatWeightInputToKg");
    expect(draft).not.toContain("eatHeightInputToCm");
    expect(foodLog).toContain("eatEnergyInputToKcal");
  });

  it("uses one navigation system for Day and Week and keeps per-day analytics intact", () => {
    const route = source("components/meals/eat-page.tsx");
    const week = source("components/meals/eat-week-view.tsx");
    expect(route).toContain('const navigationStep = view === "week" ? 7 : 1');
    expect(route).toContain('view === "week" ? et("previousWeek") : et("previousDay")');
    expect(week).not.toContain("onMoveWeek");
    expect(week).not.toContain("ArrowLeft");
    expect(week).toContain("buildWeekAnalytics(days)");
    expect(week).toContain('ert("macroContributionLogged")');
  });

  it("hides the Repeat native scrollbar without disabling horizontal or keyboard navigation", () => {
    const day = source("components/meals/eat-day-sections.tsx");
    expect(day).toContain("overflow-x-auto");
    expect(day).toContain("[scrollbar-width:none]");
    expect(day).toContain("[&::-webkit-scrollbar]:hidden");
    expect(day).toContain("tabIndex={0}");
    expect(day).toContain("scrollBy");
    expect(day).toContain('ert("previousItems")');
    expect(day).toContain('ert("nextItems")');
  });

  it("keeps Eat prompt homes route-specific and meal context minimized", () => {
    const provider = source("components/ai/quick-chatgpt-provider.tsx");
    const surface = source("components/ai/quick-chatgpt-surface.tsx");
    const context = source("lib/ai/planned-meal-context.ts");
    expect(provider).toContain("getEatRuntimeHome");
    expect(provider).toContain("getMealAdjustmentRuntimePrompts");
    const eatBranch = surface.indexOf('if (props.source === "eat")');
    const recommended = surface.indexOf("eatHome.recommended", eatBranch);
    const nutrition = surface.indexOf("eatHome.nutrition", eatBranch);
    const browseAll = surface.indexOf('<BrowseAllButton props={props} label={copy.browseAll} />', eatBranch);
    expect(eatBranch).toBeGreaterThanOrEqual(0);
    expect(recommended).toBeGreaterThanOrEqual(eatBranch);
    expect(recommended).toBeLessThan(nutrition);
    expect(nutrition).toBeLessThan(browseAll);
    expect(context).not.toContain("userId:");
    expect(context).not.toContain("mealId:");
    expect(context).not.toContain("foodLogId:");
  });

  it("keeps Arabic direction and mirrored directional icons", () => {
    const route = source("components/meals/eat-page.tsx");
    const targets = source("components/meals/nutrition-target-settings.tsx");
    expect(route).toContain("dir={dir}");
    expect(targets).toContain("dir={dir}");
    expect(route).toContain("rtl:rotate-180");
    expect(targets).toContain("rtl:rotate-180");
  });

  it("keeps mobile navigation order and prioritizes food on Eat", () => {
    const nav = source("components/layout/mobile-floating-nav.tsx");
    expect(nav.indexOf('label={tt("today")}')).toBeLessThan(nav.indexOf('label={tt("train")}'));
    expect(nav.indexOf('label={tt("train")}')).toBeLessThan(nav.indexOf('label={tt("eat")}'));
    expect(nav).toContain('section === "meal" ? 0');
    expect(nav).toContain('section === "water" ? 1');
  });

  it("records the new migration as pending without applying production changes", () => {
    const ledger = source("supabase/migration-ledger.json");
    expect(ledger).toContain("20260712195000_nutrition_target_date_overrides.sql");
    expect(ledger).toContain('"state": "pending"');
  });
});
