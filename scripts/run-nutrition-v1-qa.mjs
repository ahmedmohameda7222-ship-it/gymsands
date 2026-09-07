import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECIPE_VERSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECIPE_DRAFT_ID = "abababab-abab-4bab-8bab-abababababab";
const COOKING_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTION_ONE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ACTION_TWO_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MOCK_AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";
const MEAL_PLAN_QA_WEEK_START = "2026-08-24";

export const NUTRITION_V1_QA_VIEWPORTS = Object.freeze([
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
]);

const viewportByName = Object.fromEntries(NUTRITION_V1_QA_VIEWPORTS.map((viewport) => [viewport.name, viewport]));
function scenario(name, route, viewport = "390x844", options = {}) {
  return Object.freeze({ name, route, viewport: viewportByName[viewport], direction: "ltr", language: "en", largeText: false, offline: false, ...options });
}

export const NUTRITION_V1_QA_SCENARIOS = Object.freeze([
  scenario("diary-empty", "/calories"),
  scenario("diary-logs-only", "/calories"),
  scenario("diary-plan-only", "/calories"),
  scenario("diary-plan-actual-matching", "/calories"),
  scenario("diary-plan-actual-different", "/calories"),
  scenario("diary-over-target", "/calories"),
  scenario("diary-missing-target", "/calories"),
  scenario("diary-incomplete-nutrition", "/calories"),
  scenario("diary-offline-pending-sync", "/calories", "430x932", { offline: true }),
  scenario("diary-failed-sync", "/calories"),
  scenario("diary-loading", "/calories"),
  scenario("diary-partial-service-failure", "/calories"),
  scenario("diary-future-date", "/calories?date=2026-08-29"),
  scenario("diary-historical-date", "/calories?date=2026-08-20"),
  scenario("diary-many-foods", "/calories", "430x932"),
  scenario("diary-other-logs", "/calories"),
  scenario("diary-plan-deviation-chatgpt", "/calories"),
  scenario("diary-logging-session-plate", "/calories", "430x932", { interaction: "open-logging-session" }),

  scenario("meal-plan-populated-week", "/my-meal-plan"),
  scenario("meal-plan-add-workspace-keyboard", "/my-meal-plan", "430x932", { interaction: "open-plan-add" }),
  scenario("meal-plan-tablet", "/my-meal-plan", "768x1024"),
  scenario("meal-plan-rtl-large-text", "/my-meal-plan", "430x932", { direction: "rtl", language: "ar", largeText: true }),
  scenario("shopping-list-three-states", "/my-meal-plan/shopping", "390x844"),
  scenario("meal-plan-skip-review-remove", "/my-meal-plan", "390x844"),
  scenario("meal-plan-chatgpt-review-stale", "/my-meal-plan", "1024x768"),
  scenario("meal-plan-offline-conflict-partial-estimated", `/my-meal-plan?date=2026-08-26&week=${MEAL_PLAN_QA_WEEK_START}`, "430x932", { offline: true }),

  scenario("food-library-mobile-default-recent", "/calories/food-hub"),
  scenario("food-library-mobile-new-user", "/calories/food-hub"),
  scenario("food-library-mobile-search-verified-unverified", "/calories/food-hub", "390x844", { interaction: "food-search" }),
  scenario("food-library-mobile-search-high-protein-low-carb", "/calories/food-hub", "390x844", { interaction: "food-filters" }),
  scenario("food-library-mobile-no-results-removable-filters", "/calories/food-hub", "390x844", { interaction: "food-no-results" }),
  scenario("food-library-mobile-filter-sheet-live", "/calories/food-hub", "430x932", { interaction: "food-filters" }),
  scenario("food-library-mobile-nutrition-info", "/calories/food-hub", "390x844", { interaction: "food-nutrition-info" }),
  scenario("food-library-mobile-detail-serving-recalculation", "/calories/food-hub", "430x932", { interaction: "food-serving-recalculation" }),
  scenario("food-library-mobile-detail-personal-correction", "/calories/food-hub", "430x932", { interaction: "food-personal-correction" }),
  scenario("food-library-mobile-add-to-serving-quantity-destinations", "/calories/food-hub", "430x932", { interaction: "food-add-to" }),
  scenario("food-library-mobile-create-custom-food-fast-core", "/calories/food-hub", "430x932", { interaction: "food-create-custom" }),
  scenario("food-library-mobile-duplicate-suggestion", "/calories/food-hub", "390x844", { interaction: "food-duplicate-suggestion" }),
  scenario("food-library-mobile-custom-food-edit-delete", "/calories/food-hub", "390x844", { interaction: "food-custom-edit-delete" }),
  scenario("food-library-mobile-offline-cached", "/calories/food-hub", "430x932", { offline: true }),
  scenario("food-library-mobile-barcode-fallback", "/calories/food-hub", "390x844", { interaction: "food-barcode-fallback" }),
  scenario("food-library-tablet-adaptive-density", "/calories/food-hub", "768x1024"),
  scenario("food-library-desktop-bounded-layout", "/calories/food-hub", "1280x800"),
  scenario("food-library-desktop-detail-panel-route", "/calories/food-hub", "1440x900", { interaction: "food-detail" }),
  scenario("food-library-desktop-nutrition-info-hover-pinned", "/calories/food-hub", "1280x800", { interaction: "food-nutrition-info" }),
  scenario("food-library-rtl-mixed-brand", "/calories/food-hub", "430x932", { direction: "rtl", language: "ar" }),
  scenario("food-library-long-branded-name", "/calories/food-hub", "390x844"),
  scenario("food-library-large-text", "/calories/food-hub", "430x932", { largeText: true }),

  scenario("recipes-mobile-home-populated", "/my-recipes"),
  scenario("recipes-mobile-home-empty", "/my-recipes"),
  scenario("recipes-mobile-all-search", "/my-recipes", "390x844", { interaction: "recipe-search" }),
  scenario("recipes-mobile-active-filters", "/my-recipes", "430x932", { interaction: "recipe-filters" }),
  scenario("recipes-mobile-no-results", "/my-recipes", "390x844", { interaction: "recipe-no-results" }),
  scenario("recipes-mobile-editor", `/my-recipes/${RECIPE_ID}/edit`, "430x932"),
  scenario("recipes-mobile-add-ingredient-search", `/my-recipes/${RECIPE_ID}/edit`, "430x932", { interaction: "open-recipe-add-ingredient" }),
  scenario("recipes-mobile-detail", `/my-recipes/${RECIPE_ID}`, "390x844"),
  scenario("recipes-mobile-before-you-start", `/my-recipes/${RECIPE_ID}/cook`, "390x844"),
  scenario("recipes-mobile-cooking-normal", `/my-recipes/${RECIPE_ID}/cook`, "390x844", { cookingState: "normal", interaction: "resume-cooking" }),
  scenario("recipes-mobile-cooking-attention", `/my-recipes/${RECIPE_ID}/cook`, "430x932", { cookingState: "attention", interaction: "resume-cooking" }),
  scenario("recipes-mobile-cooking-parallel-timers", `/my-recipes/${RECIPE_ID}/cook`, "430x932", { cookingState: "parallel", interaction: "resume-cooking" }),
  scenario("recipes-mobile-cooking-resume-start-over", `/my-recipes/${RECIPE_ID}/cook`, "390x844", { cookingState: "resume" }),
  scenario("recipes-mobile-cooking-complete", `/my-recipes/${RECIPE_ID}/cook`, "390x844", { cookingState: "complete", interaction: "resume-cooking" }),
  scenario("recipes-mobile-offline-partial-failure", `/my-recipes/${RECIPE_ID}/cook`, "430x932", { cookingState: "normal", interaction: "resume-cooking", offline: true }),
  scenario("recipes-mobile-autosave-failure", `/my-recipes/${RECIPE_ID}/edit`, "430x932", { interaction: "trigger-recipe-autosave-failure", recipeAutosaveStatus: 503 }),
  scenario("recipes-desktop-home", "/my-recipes", "1280x800"),
  scenario("recipes-desktop-detail", `/my-recipes/${RECIPE_ID}`, "1440x900"),
  scenario("recipes-desktop-cooking", `/my-recipes/${RECIPE_ID}/cook`, "1440x900", { cookingState: "normal", interaction: "resume-cooking" }),
  scenario("recipes-rtl-home-mobile", "/my-recipes", "390x844", { direction: "rtl", language: "ar" }),
  scenario("recipes-rtl-cooking-mobile", `/my-recipes/${RECIPE_ID}/cook`, "390x844", { direction: "rtl", language: "ar", cookingState: "normal", interaction: "resume-cooking" }),
  scenario("recipes-large-text-cooking", `/my-recipes/${RECIPE_ID}/cook`, "430x932", { largeText: true, cookingState: "normal", interaction: "resume-cooking" }),
  scenario("recipes-long-name-action", `/my-recipes/${RECIPE_ID}`, "390x844"),
  scenario("recipes-recently-deleted", "/my-recipes", "1024x768"),
]);

export function nutritionV1ScreenshotName(item) {
  const viewport = item.viewport?.name ?? "unknown";
  const language = ["en", "de", "ar"].includes(item.language) ? item.language : "en";
  return `${item.name}__${viewport}__${item.direction === "rtl" ? "rtl" : "ltr"}__${language}__${item.largeText ? "large" : "normal"}.png`;
}

export function renderedTextContains(body, expected) {
  const normalizedBody = String(body ?? "").normalize("NFKC").toUpperCase();
  const normalizedExpected = String(expected ?? "").normalize("NFKC").toUpperCase();
  return normalizedExpected.length > 0 && normalizedBody.includes(normalizedExpected);
}

function sanitizedText(value, limit = 1200) {
  return String(value ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .slice(0, limit);
}

function nutrition(caloriesKcal = 620, proteinG = 41, carbsG = 72, fatG = 18) {
  return { caloriesKcal, proteinG, carbsG, fatG };
}

function diaryProjection(item, date) {
  const actual = nutrition();
  const target = nutrition(2200, 160, 240, 70);
  const makeLog = (id, mealType, foodName, values = nutrition(320, 26, 34, 9)) => ({ id, mealType, foodName, servingLabel: "1 serving", quantity: 1, nutrition: values, notes: null, foodItemId: null, userFoodItemId: null, createdAt: null });
  const planned = (name = "Chicken rice bowl", frozen = {}) => ({ id: "00000000-0000-4000-8000-000000000104", mealType: "Lunch", name, status: "planned", sourceType: "food", frozenSnapshot: { name, ...frozen } });
  let logs = [makeLog("00000000-0000-4000-8000-000000000101", "Breakfast", "Greek yogurt with berries")];
  let plans = [planned()];
  let actualValues = actual;
  let targetData = { available: true, effective_from: date, effective_to: null, values: { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 70, water_ml: 2500 }, source: "rendered_qa_fixture", source_evidence: { authority: "rendered_qa" }, reason: "effective_target" };
  let hydration = { status: "ready", data: { logs: [{ id: "00000000-0000-4000-8000-000000000103", amountMl: 750, createdAt: null }], totalMl: 750 } };
  if (item.name === "diary-empty") { logs = []; plans = []; actualValues = nutrition(0, 0, 0, 0); }
  if (item.name === "diary-logs-only") plans = [];
  if (item.name === "diary-plan-only") { logs = []; actualValues = nutrition(0, 0, 0, 0); }
  if (item.name === "diary-plan-actual-matching") { logs = [makeLog("00000000-0000-4000-8000-000000000105", "Lunch", "Chicken rice bowl", nutrition(540, 48, 63, 12))]; plans = [planned("Chicken rice bowl", { nutrition: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 } })]; actualValues = nutrition(540, 48, 63, 12); }
  if (item.name === "diary-plan-actual-different" || item.name === "diary-plan-deviation-chatgpt") { logs = [makeLog("00000000-0000-4000-8000-000000000106", "Lunch", "Falafel wrap", nutrition(670, 24, 81, 26))]; plans = [planned("Chicken rice bowl", { nutrition: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 }, deviation: true })]; actualValues = nutrition(670, 24, 81, 26); }
  if (item.name === "diary-over-target") actualValues = nutrition(2380, 172, 275, 82);
  if (item.name === "diary-missing-target") targetData = { available: false, effective_from: null, effective_to: null, values: null, source: null, source_evidence: null, reason: "missing_target" };
  if (item.name === "diary-incomplete-nutrition") { logs = [makeLog("00000000-0000-4000-8000-000000000107", "Breakfast", "Imported food", { caloriesKcal: 310, proteinG: null, carbsG: 44, fatG: null })]; actualValues = { caloriesKcal: 310, proteinG: null, carbsG: 44, fatG: null }; }
  if (item.name === "diary-many-foods") logs = Array.from({ length: 12 }, (_, index) => makeLog(`00000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`, index % 2 ? "Lunch" : "Breakfast", `Food ${index + 1}`, nutrition(120 + index * 10, 8 + index, 12 + index, 4 + index)));
  if (item.name === "diary-other-logs") logs = [makeLog("00000000-0000-4000-8000-000000000108", "Other", "Electrolyte drink", nutrition(45, 0, 11, 0))];
  if (item.name === "diary-partial-service-failure") hydration = { status: "unavailable", reason: "hydration_service_unavailable" };
  const targetPosition = targetData.available ? target : { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const remaining = {
    caloriesKcal: targetPosition.caloriesKcal === null || actualValues.caloriesKcal === null ? null : targetPosition.caloriesKcal - actualValues.caloriesKcal,
    proteinG: targetPosition.proteinG === null || actualValues.proteinG === null ? null : targetPosition.proteinG - actualValues.proteinG,
    carbsG: targetPosition.carbsG === null || actualValues.carbsG === null ? null : targetPosition.carbsG - actualValues.carbsG,
    fatG: targetPosition.fatG === null || actualValues.fatG === null ? null : targetPosition.fatG - actualValues.fatG,
  };
  return { date, position: { actual: actualValues, target: targetPosition, remaining }, domains: { actual: { status: "ready", data: { nutrition: actualValues, logs } }, target: { status: "ready", data: targetData }, hydration, planned: { status: "ready", data: plans }, savedMeals: { status: "ready", data: [] } } };
}

function foodFixtures(item) {
  if (item.name.includes("new-user") || item.name.includes("no-results")) return [];
  const long = item.name.includes("long-branded-name");
  return [
    { id: "11111111-1111-4111-8111-111111111111", source: "catalog", name: long ? "Extra Long International Greek Style Strained Yogurt with Vanilla Bean and Mixed Forest Berries" : "Greek yogurt", brand: long ? "Molkerei Internationale Handelsgesellschaft" : "Plaivra Foods", category: "Dairy", cuisine: null, servingLabel: "170 g", verified: true, favorite: true, recentAt: "2026-08-26T06:00:00.000Z", frequency: 8, locale: item.language, aliases: [{ locale: "en", value: "yogurt" }], nutrition: { calories: 130, protein_g: 18, carbs_g: 8, fat_g: 2, saturated_fat_g: 1, fiber_g: 0, sugars_g: 6, sodium_mg: 70, basis_amount: 170, basis_unit: "g" }, tags: [], nutritionLabels: ["high-protein", "low-carb"], usingPersonalValues: item.name.includes("personal-correction") },
    { id: "22222222-2222-4222-8222-222222222222", source: "my_food", name: item.language === "ar" ? "وعاء شوفان Homemade" : "Homemade oat bowl", brand: null, category: "Breakfast", cuisine: null, servingLabel: "1 bowl", verified: false, favorite: false, recentAt: "2026-08-25T07:00:00.000Z", frequency: 3, locale: item.language, aliases: [{ locale: "en", value: "oats" }], nutrition: { calories: 410, protein_g: 19, carbs_g: 58, fat_g: 12, saturated_fat_g: 2, fiber_g: 9, sugars_g: 11, sodium_mg: 180, basis_amount: 1, basis_unit: "g" }, tags: [], usingPersonalValues: false },
  ];
}

function mealPlanOfflineEvidenceOccurrences(item, occurrence) {
  if (item.name !== "meal-plan-offline-conflict-partial-estimated") return [occurrence];
  const partial = { ...occurrence, frozen_name: "Imported lunch · partial nutrition", frozen_snapshot: { ...occurrence.frozen_snapshot, nutrition: { calories: 430, protein_g: null, carbs_g: 52, fat_g: 14 } } };
  const estimated = { ...occurrence, id: "33333333-3333-4333-8333-333333333337", meal_slot_key: "Snacks", source_type: "placeholder", source_id: null, resolved_serving_label: "1 estimate", frozen_name: "Restaurant snack estimate", frozen_snapshot: { estimatedNutrition: { calories: 360, protein_g: 18, carbs_g: 44, fat_g: 12 }, estimated: true } };
  return [partial, estimated];
}

function mealPlanOfflineQueueFixture(item) {
  if (item.name !== "meal-plan-offline-conflict-partial-estimated") return null;
  const base = { weekId: "44444444-4444-4444-8444-444444444444", baseRevision: 3, payload: { weekStartDate: MEAL_PLAN_QA_WEEK_START, mutation: { upsertOccurrences: [] }, baseSnapshot: null } };
  return [
    { ...base, operationId: "qa-meal-plan-queued", target: { kind: "occurrence", id: "33333333-3333-4333-8333-333333333333", field: "frozen_name" }, status: "queued" },
    { ...base, operationId: "qa-meal-plan-attention", target: { kind: "week_override", id: MEAL_PLAN_QA_WEEK_START, field: "customSlots" }, status: "needs_attention", lastError: "QA fixture validation needs review." },
    { ...base, operationId: "qa-meal-plan-conflict", target: { kind: "meal_slot", id: "2026-08-26:Dinner" }, status: "conflict", lastError: "QA fixture concurrent edit conflict." },
  ];
}

function mealPlanFixture(item, date = "2026-08-26") {
  const occurrence = { id: "33333333-3333-4333-8333-333333333333", week_id: "44444444-4444-4444-8444-444444444444", user_id: MOCK_AUTH_USER_ID, plan_date: date, meal_slot_key: "Lunch", position: 0, source_type: "food", source_id: "11111111-1111-4111-8111-111111111111", source_version_id: null, resolved_quantity: 1, resolved_serving_label: "1 bowl", frozen_name: item.language === "ar" ? "وعاء أرز بالدجاج" : "Chicken rice bowl", frozen_snapshot: { nutrition: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 }, shoppingIngredients: [{ foodId: "55555555-5555-4555-8555-555555555555", name: item.language === "ar" ? "صدر دجاج" : "Chicken breast", quantity: 400, unit: "g", qualifier: null }] }, status: item.name.includes("skip") ? "skipped" : "planned", completed_at: null, actual_log_group_id: null };
  const weekOverride = item.name === "shopping-list-three-states" ? { shopping: { states: {}, derivedEdits: {}, manualItems: [{ id: "shopping-purchased", name: "Sparkling water", quantity: 2, unit: "bottles", state: "Purchased", notes: "" }, { id: "shopping-dont-need", name: "Napkins", quantity: 1, unit: "pack", state: "Don't need", notes: "Already at home" }] } } : {};
  return { week: { id: occurrence.week_id, user_id: occurrence.user_id, week_start_date: MEAL_PLAN_QA_WEEK_START, revision: 3, week_override_json: weekOverride }, occurrences: mealPlanOfflineEvidenceOccurrences(item, occurrence), target: { available: true, effective_from: MEAL_PLAN_QA_WEEK_START, effective_to: null, values: { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 70, water_ml: 2500 }, source: "rendered_qa_fixture", source_evidence: { authority: "rendered_qa" }, reason: "effective_target" }, pendingChangeRequests: item.name.includes("chatgpt") ? [{ id: "66666666-6666-4666-8666-666666666666", base_revision: 2, proposal_json: { summary: "Move lunch later" }, state: item.name.includes("stale") ? "stale" : "pending" }] : [], shoppingNeeds: [{ foodId: "55555555-5555-4555-8555-555555555555", name: item.language === "ar" ? "صدر دجاج" : "Chicken breast", quantity: 400, unit: "g", qualifier: null, sourceOccurrenceIds: [occurrence.id] }] };
}

function recipeRows(item) {
  if (item.name === "recipes-mobile-home-empty") return [];
  return [
    { recipeId: RECIPE_ID, latestVersionId: RECIPE_VERSION_ID, name: item.language === "ar" ? "وعاء دجاج Chicken bowl" : item.name === "recipes-long-name-action" ? "Roasted Mediterranean Vegetable and Lemon Herb Chicken Grain Bowl with Toasted Seeds" : "Chicken bowl", status: "published", favorite: true, totalTimeMinutes: 35, cuisine: "Mediterranean", lastUsedAt: "2026-08-26T06:30:00.000Z", nutritionPerServing: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 } },
    { recipeId: "77777777-7777-4777-8777-777777777777", latestVersionId: null, name: "Working Draft soup", status: "draft", favorite: false, totalTimeMinutes: null, cuisine: null, lastUsedAt: null, nutritionPerServing: null },
  ];
}

function recipeDetail(item) {
  const long = item.name === "recipes-long-name-action";
  const name = item.language === "ar" ? "وعاء دجاج Chicken bowl" : long ? "Roasted Mediterranean Vegetable and Lemon Herb Chicken Grain Bowl with Toasted Seeds" : "Chicken bowl";
  return {
    root: { id: RECIPE_ID, name, is_favorite: true, cover_path: null },
    draft: { id: RECIPE_DRAFT_ID, revision: 1, name, servings: 4, total_time_minutes: 35, notes: "Working Draft notes.", draft_metadata: { cuisine: "Mediterranean" } },
    latestVersion: { id: RECIPE_VERSION_ID, version_number: 4, name, servings: 4, total_time_minutes: 35, notes: "Serve immediately.", metadata: {} },
    hasWorkingDraft: true,
    ingredients: [{ id: "88888888-8888-4888-8888-888888888888", ingredient_name: "Chicken breast", quantity: 400, unit: "g", food_id: "55555555-5555-4555-8555-555555555555", frozen_nutrition: { calories: 660, protein_g: 124, carbs_g: 0, fat_g: 14 }, verified: true }],
    instructions: [{ id: ACTION_ONE_ID, instruction: "Prepare the confirmed ingredients.", duration_seconds: 300, heat_or_temperature: null, doneness_or_result_cue: null, prep_ahead_cue: null }, { id: ACTION_TWO_ID, instruction: long ? "Cook the chicken until the user-confirmed doneness cue is reached, then rest it before slicing across the grain." : "Cook the chicken and rest before slicing.", duration_seconds: 600, heat_or_temperature: null, doneness_or_result_cue: "User-confirmed doneness cue", prep_ahead_cue: null }],
    equipment: [{ id: "99999999-9999-4999-8999-999999999999", name: "Pan", quantity: 1, note: null }],
    nutritionPerServing: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 },
    cuisine: "Mediterranean",
  };
}

function cookingFixture(item) {
  const now = "2026-08-26T06:00:00.000Z";
  const complete = item.cookingState === "complete";
  const timerStatus = item.cookingState === "attention" || complete ? "completed" : "running";
  const timers = item.cookingState === "parallel" ? [
    { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", actionId: ACTION_TWO_ID, actionStateId: "34343434-3434-4434-8434-343434343434", name: "Sauce", durationSeconds: 3600, status: "running", startedAt: now, targetAt: "2026-08-26T23:00:00.000Z", pausedAt: null, pausedRemainingSeconds: null, completedAt: null, cancelledAt: null },
    { id: "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2", actionId: ACTION_TWO_ID, actionStateId: "34343434-3434-4434-8434-343434343434", name: "Rest", durationSeconds: 900, status: "paused", startedAt: now, targetAt: "2026-08-26T23:10:00.000Z", pausedAt: "2026-08-26T06:05:00.000Z", pausedRemainingSeconds: 600, completedAt: null, cancelledAt: null },
  ] : [{ id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", actionId: ACTION_TWO_ID, actionStateId: "34343434-3434-4434-8434-343434343434", name: "Rest", durationSeconds: 600, status: timerStatus, startedAt: now, targetAt: timerStatus === "completed" ? "2026-08-26T06:05:00.000Z" : "2026-08-26T23:00:00.000Z", pausedAt: null, pausedRemainingSeconds: null, completedAt: timerStatus === "completed" ? "2026-08-26T06:05:00.000Z" : null, cancelledAt: null }];
  return { schemaVersion: 1, sessionId: COOKING_SESSION_ID, recipeId: RECIPE_ID, recipeVersionId: RECIPE_VERSION_ID, frozenRecipeSnapshot: { schemaVersion: 1, recipe: { id: RECIPE_VERSION_ID, recipe_id: RECIPE_ID, version_number: 4, name: item.language === "ar" ? "وعاء دجاج Chicken bowl" : "Chicken bowl", servings: 4 }, ingredients: [{ id: "ingredient-one", name: "Chicken breast", quantity: 400, unit: "g" }], actions: [{ id: ACTION_ONE_ID, position: 0, instruction: "Prepare the confirmed ingredients.", dependency_action_ids: [] }, { id: ACTION_TWO_ID, position: 1, instruction: "Cook the chicken and rest before slicing.", dependency_action_ids: [ACTION_ONE_ID], can_run_in_background: true, doneness_or_result_cue: "User-confirmed doneness cue" }], equipment: [{ id: "equipment-one", name: "Pan", quantity: 1 }] }, servingScale: 1, status: complete ? "completed" : "active", stateRevision: 4, currentActionKey: complete ? null : ACTION_TWO_ID, actionStates: [{ id: "12121212-1212-4212-8212-121212121212", actionKey: ACTION_ONE_ID, state: "completed", stateRevision: 2, activatedAt: now, completedAt: "2026-08-26T06:02:00.000Z", deferredAt: null, skippedAt: null }, { id: "34343434-3434-4434-8434-343434343434", actionKey: ACTION_TWO_ID, state: complete ? "completed" : "active", stateRevision: 4, activatedAt: "2026-08-26T06:03:00.000Z", completedAt: complete ? "2026-08-26T06:10:00.000Z" : null, deferredAt: null, skippedAt: null }], timers, pendingMutations: item.offline ? [{ operationId: "qa-pending-1", type: "action_state", payload: { actionKey: ACTION_TWO_ID, state: "active" }, createdAt: "2026-08-26T06:03:00.000Z" }] : [], startedAt: now, lastActiveAt: "2026-08-26T06:10:00.000Z", completedAt: complete ? "2026-08-26T06:10:00.000Z" : null, endedAt: null };
}

async function fulfillJson(route, body, status = 200, fixture = "nutrition-v1") {
  await route.fulfill({ status, contentType: "application/json", headers: { "x-plaivra-qa-fixture": fixture }, body: JSON.stringify(body) });
}

async function createContext(browser, item) {
  const browserLocale = item.language === "ar" ? "ar-EG" : item.language === "de" ? "de-DE" : "en-GB";
  const context = await browser.newContext({ viewport: { width: item.viewport.width, height: item.viewport.height }, reducedMotion: "reduce", colorScheme: "light", locale: browserLocale });
  const mealPlanQueue = mealPlanOfflineQueueFixture(item);
  await context.addInitScript(({ direction, language, largeText, offline, recipeId, cooking, mealPlanQueue, mockAuthUserId, mealPlanWeekStart }) => {
    try { localStorage.setItem("plaivra.language.v1", language); } catch { /* origin may not be available yet */ }
    const applyDocumentPreferences = () => {
      if (!document.documentElement) return false;
      document.documentElement.dir = direction;
      document.documentElement.lang = language;
      if (largeText) document.documentElement.style.fontSize = "125%";
      return true;
    };
    if (!applyDocumentPreferences()) document.addEventListener("DOMContentLoaded", applyDocumentPreferences, { once: true });
    if (offline) Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    if (mealPlanQueue) {
      try { localStorage.setItem(`plaivra:nutrition-v1:meal-plan:queue:${mockAuthUserId}:${mealPlanWeekStart}`, JSON.stringify(mealPlanQueue)); } catch { /* origin not available yet */ }
    }
    if (cooking) {
      try { localStorage.setItem(`plaivra:nutrition:cooking:${mockAuthUserId}:${recipeId}:active`, JSON.stringify(cooking)); } catch { /* origin not available yet */ }
    }
  }, { direction: item.direction, language: item.language, largeText: item.largeText, offline: item.offline, recipeId: RECIPE_ID, cooking: item.route.includes("/cook") ? cookingFixture(item) : null, mealPlanQueue, mockAuthUserId: MOCK_AUTH_USER_ID, mealPlanWeekStart: MEAL_PLAN_QA_WEEK_START });

  await context.route("**/api/billing/entitlements", (route) => fulfillJson(route, { entitlements: [] }, 200, "empty-entitlements-v1"));
  await context.route("**/api/food/open-food-facts**", async (route) => {
    if (item.name === "food-library-mobile-barcode-fallback") {
      await fulfillJson(route, { error: "Rendered QA barcode provider unavailable" }, 503, `nutrition-${item.name}`);
      return;
    }
    await fulfillJson(route, { food: { name: "Barcode yogurt", barcode: "4006381333931" } }, 200, `nutrition-${item.name}`);
  });
  await context.route("**/api/nutrition/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    if (pathname.endsWith("/diary")) {
      if (item.name === "diary-loading") await new Promise((resolve) => setTimeout(resolve, 1200));
      await fulfillJson(route, diaryProjection(item, url.searchParams.get("date") || "2026-08-26"), 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.endsWith("/log") && method !== "GET") {
      await fulfillJson(route, item.name === "diary-failed-sync" ? { error: "Rendered QA sync rejection" } : { ok: true }, item.name === "diary-failed-sync" ? 503 : 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.endsWith("/foods") && method === "POST") {
      let body = {};
      try { body = route.request().postDataJSON(); } catch { body = {}; }
      if (item.name === "food-library-mobile-duplicate-suggestion" && body.operation === "custom_food_create") {
        await fulfillJson(route, { food: null, duplicate: { id: "11111111-1111-4111-8111-111111111111", source: "catalog", food_name: "Greek yogurt", serving_size: "170 g" } }, 200, `nutrition-${item.name}`);
        return;
      }
      await fulfillJson(route, { food: { id: "22222222-2222-4222-8222-222222222229" }, duplicate: null, deleted: body.operation === "custom_food_delete", ok: true }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.endsWith("/foods")) {
      await fulfillJson(route, { items: foodFixtures(item), nextCursor: null }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.includes("/meal-plan/week")) {
      await fulfillJson(route, mealPlanFixture(item, url.searchParams.get("date") || "2026-08-26"), 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.includes("/meal-plan")) {
      await fulfillJson(route, { ok: true, revision: 4 }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname === "/api/nutrition/v1/recipes" && method === "GET" && url.searchParams.get("deleted") === "true") {
      await fulfillJson(route, { recipes: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: item.language === "ar" ? "شوربة عدس" : "Deleted lentil soup", cover_path: null, deleted_at: "2026-08-20T08:00:00.000Z", purge_after: "2026-09-19T08:00:00.000Z" }] }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname === "/api/nutrition/v1/recipes" && method === "GET") {
      await fulfillJson(route, { recipes: recipeRows(item) }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname === "/api/nutrition/v1/recipes" && method === "POST") {
      await fulfillJson(route, { recipeId: RECIPE_ID }, 201, `nutrition-${item.name}`);
      return;
    }
    if (pathname === `/api/nutrition/v1/recipes/${RECIPE_ID}` && method === "PATCH" && item.recipeAutosaveStatus === 503) {
      await fulfillJson(route, { error: "Rendered QA autosave failure" }, 503, `nutrition-${item.name}`);
      return;
    }
    if (pathname === `/api/nutrition/v1/recipes/${RECIPE_ID}` && method === "GET") {
      await fulfillJson(route, { recipe: recipeDetail(item) }, 200, `nutrition-${item.name}`);
      return;
    }
    if (pathname.startsWith(`/api/nutrition/v1/recipes/${RECIPE_ID}`)) {
      await fulfillJson(route, { recipe: recipeDetail(item), recipeId: RECIPE_ID, ok: true }, 200, `nutrition-${item.name}`);
      return;
    }
    await fulfillJson(route, { ok: true }, 200, `nutrition-${item.name}`);
  });
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    let body = [];
    if (method !== "GET" && method !== "HEAD") {
      try { body = route.request().postDataJSON(); } catch { body = {}; }
    }
    await route.fulfill({ status: method === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0", "x-plaivra-qa-fixture": "empty-v1" }, body: method === "HEAD" ? "" : JSON.stringify(method === "GET" ? [] : body ?? {}) });
  });
  return context;
}

async function clickFirst(page, patterns) {
  for (const pattern of patterns) {
    const candidate = page.getByRole("button", { name: pattern }).first();
    if (await candidate.count()) { await candidate.click(); return true; }
  }
  return false;
}

async function openFoodDetail(page, name = /greek yogurt/i) {
  const row = page.getByRole("button", { name }).first();
  if (await row.count()) { await row.click(); await page.waitForTimeout(120); return true; }
  return false;
}

async function prepareScenario(page, item) {
  if (item.offline) await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  switch (item.interaction) {
    case "open-logging-session":
      await clickFirst(page, [/add food/i, /log food/i, /add/i]);
      break;
    case "open-plan-add":
      await clickFirst(page, [/add food/i, /add/i, /plus/i]);
      break;
    case "food-search": {
      const input = page.getByPlaceholder(/search/i).first();
      if (await input.count()) await input.fill("yogurt");
      break;
    }
    case "food-no-results": {
      const input = page.getByPlaceholder(/search/i).first();
      if (await input.count()) await input.fill("definitely-no-match");
      break;
    }
    case "food-filters":
      await clickFirst(page, [/filters/i, /filter/i]);
      break;
    case "food-detail":
      await openFoodDetail(page);
      break;
    case "food-nutrition-info":
      await clickFirst(page, [/filters/i]);
      await page.waitForTimeout(80);
      await clickFirst(page, [/nutrition info/i, /about nutrition/i, /info/i]);
      break;
    case "food-add-to":
      await clickFirst(page, [/add greek yogurt/i, /add/i]);
      break;
    case "food-serving-recalculation":
      if (await openFoodDetail(page)) await clickFirst(page, [/increase quantity/i]);
      break;
    case "food-personal-correction":
      if (await openFoodDetail(page)) await clickFirst(page, [/correct for me/i]);
      break;
    case "food-create-custom":
      await clickFirst(page, [/create food/i]);
      break;
    case "food-duplicate-suggestion": {
      await clickFirst(page, [/create food/i]);
      const name = page.getByLabel(/food name/i).first();
      const calories = page.getByLabel(/^calories$/i).first();
      if (await name.count()) await name.fill("Greek yogurt");
      if (await calories.count()) await calories.fill("130");
      await clickFirst(page, [/save food/i]);
      await page.waitForTimeout(160);
      break;
    }
    case "food-custom-edit-delete":
      if (await openFoodDetail(page, /homemade oat bowl/i)) {
        await clickFirst(page, [/edit food/i]);
        await page.waitForTimeout(80);
        await clickFirst(page, [/delete food/i]);
      }
      break;
    case "food-barcode-fallback": {
      await clickFirst(page, [/scan/i]);
      const input = page.getByRole("textbox", { name: /barcode/i }).first();
      if (await input.count()) await input.fill("4006381333931");
      await clickFirst(page, [/lookup/i]);
      await page.waitForTimeout(160);
      break;
    }
    case "recipe-search": {
      const input = page.getByPlaceholder("Search recipes");
      if (await input.count()) await input.fill("Chicken");
      break;
    }
    case "recipe-no-results": {
      const input = page.getByPlaceholder("Search recipes");
      if (await input.count()) await input.fill("no-recipe-match");
      break;
    }
    case "recipe-filters":
      await clickFirst(page, [/filters/i]);
      break;
    case "open-recipe-add-ingredient": {
      const candidate = page.getByRole("link", { name: /add ingredient/i }).first();
      if (await candidate.count()) { await candidate.click(); await page.waitForLoadState("networkidle"); }
      break;
    }
    case "trigger-recipe-autosave-failure": {
      const input = page.getByLabel(/recipe name/i).first();
      if (await input.count()) await input.fill("Chicken bowl QA edit");
      await page.waitForTimeout(900);
      break;
    }
    case "resume-cooking":
      await clickFirst(page, [/resume/i, /استئناف/]);
      break;
    default:
      break;
  }
  await page.waitForTimeout(180);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const interactive = [...document.querySelectorAll("button, input, select, textarea, [role='button'], a[href]")].filter(visible);
    const unnamedInteractiveElements = interactive.filter((element) => {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.getAttribute("placeholder") || element.getAttribute("value") || ("labels" in element && element.labels?.length ? "associated-label" : "");
      return !String(label || "").trim();
    }).length;
    const targetAuditedInteractive = interactive.filter((element) => {
      if (element.classList.contains("sr-only") && document.activeElement !== element) return false;
      return true;
    });
    const compact = targetAuditedInteractive.flatMap((element) => {
      const target = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) && element.labels?.[0] ? element.labels[0] : element;
      const rect = target.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44 ? [{ tag: element.tagName.toLowerCase(), text: String(element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 80), width: Math.round(rect.width), height: Math.round(rect.height) }] : [];
    });
    return { horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), unnamedInteractiveElements, compactInteractiveTargets: compact.length, compactTargetDetails: compact.slice(0, 16), interactiveElements: interactive.length, h1: document.querySelector("h1")?.textContent?.trim() || null, direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction, htmlLanguage: document.documentElement.lang || null, bodyText: String(document.body?.innerText || "").slice(0, 12000) };
  });
}

function requiredEvidence(item) {
  if (item.name === "recipes-mobile-editor") return ["Recipe editor", "Basics", "Add ingredient"];
  if (item.name === "recipes-mobile-add-ingredient-search") return ["Food Library", "Search foods"];
  if (item.name === "recipes-mobile-autosave-failure") return ["Not saved"];
  if (item.name === "recipes-mobile-cooking-complete") return ["Cooking complete", "Add to Diary", "Add to Meal Plan", "Save as Meal", "Close"];
  if (item.name === "food-library-mobile-create-custom-food-fast-core") return ["Create Food", "Nutrition is for", "Calories", "Protein", "Carbohydrates", "Fat"];
  if (item.name === "food-library-mobile-duplicate-suggestion") return ["Possible duplicate", "Use Existing", "Correct for me", "Create Separately"];
  if (item.name === "food-library-mobile-custom-food-edit-delete") return ["Delete Food", "Historical frozen nutrition remains unchanged"];
  if (item.name === "food-library-mobile-detail-serving-recalculation") return ["1.25", "162.5 kcal"];
  if (item.name === "food-library-mobile-detail-personal-correction") return ["Personal correction"];
  if (item.name === "food-library-mobile-add-to-serving-quantity-destinations") return ["Serving", "Quantity", "Diary", "Meal Plan", "Saved Meal", "Recipe"];
  if (item.name === "food-library-mobile-barcode-fallback") return ["Barcode", "Barcode lookup failed", "Search remains available"];
  return [];
}

function localizedAssertions(item, metrics) {
  const failures = [];
  const body = metrics.bodyText || "";
  if (/Please sign in before using (?:Meal Plan|My Recipes)\./i.test(body)) failures.push("rendered authenticated state fell back to sign-in error");
  if (item.name === "shopping-list-three-states") for (const text of ["Needed", "Purchased", "Don't need"]) if (!body.includes(text)) failures.push(`missing Shopping state evidence: ${text}`);
  if (item.name === "meal-plan-offline-conflict-partial-estimated") for (const text of ["Waiting to sync", "Needs attention", "Conflict", "Partial", "Estimated"]) if (!body.includes(text)) failures.push(`missing offline Meal Plan evidence: ${text}`);
  for (const text of requiredEvidence(item)) if (!renderedTextContains(body, text)) failures.push(`missing rendered state evidence: ${text}`);
  if (item.language !== "ar") return failures;
  if (metrics.htmlLanguage !== "ar") failures.push(`expected html lang ar, received ${metrics.htmlLanguage || "empty"}`);
  if (metrics.direction !== "rtl") failures.push(`expected RTL direction, received ${metrics.direction || "empty"}`);
  const required = item.name === "meal-plan-rtl-large-text" ? ["خطة الوجبات", "بروتين", "كربوهيدرات", "دهون"] : item.name === "food-library-rtl-mixed-brand" ? ["مكتبة الأطعمة", "بروتين", "كربوهيدرات", "دهون", "غني بالبروتين", "قليل الكربوهيدرات"] : item.name === "recipes-rtl-home-mobile" ? ["وصفاتي", "المحذوفة مؤخرًا"] : item.name === "recipes-rtl-cooking-mobile" ? ["الآن", "تم"] : [];
  for (const text of required) if (!body.includes(text)) failures.push(`missing localized Arabic evidence: ${text}`);
  if (item.name === "food-library-rtl-mixed-brand" && /\bP\s+\d|\bC\s+\d|\bF\s+\d/.test(body)) failures.push("Arabic Food Library still exposes Latin P/C/F macro abbreviations");
  if (item.name === "food-library-rtl-mixed-brand" && /\bHIGH PROTEIN\b|\bLOW CARB\b/i.test(body)) failures.push("Arabic Food Library still exposes English objective tags");
  return failures;
}

async function checkFocusVisible(page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    try { if (active.matches(":focus-visible")) return true; } catch { /* browser fallback */ }
    const style = getComputedStyle(active);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
}

export async function runNutritionV1Qa(options = {}) {
  const baseUrl = options.baseUrl || process.env.QA_BASE_URL || "http://localhost:3000";
  const evidenceDir = path.resolve(options.evidenceDir || process.env.QA_EVIDENCE_DIR || path.join(process.cwd(), "quality-reports", "rendered-qa-evidence", "nutrition-v1"));
  const QA_HEAD_SHA = options.headSha || process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || null;
  const QA_SERVER_MODE = options.serverMode || process.env.QA_SERVER_MODE || "production";
  const workflowRunId = options.workflowRunId || process.env.QA_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null;
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const item of NUTRITION_V1_QA_SCENARIOS) {
      const context = await createContext(browser, item);
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(sanitizedText(error.stack || error.message)));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        const expectedAutosaveFailure = item.recipeAutosaveStatus === 503 && /Failed to load resource.*503/i.test(text);
        const expectedBarcodeFailure = item.name === "food-library-mobile-barcode-fallback" && /Failed to load resource.*503/i.test(text);
        if (!expectedAutosaveFailure && !expectedBarcodeFailure && !/favicon|Failed to load resource.*404/i.test(text)) consoleErrors.push(sanitizedText(text, 800));
      });
      let response = null;
      let navigationError = null;
      try {
        response = await page.goto(`${baseUrl}${item.route}`, { waitUntil: item.name === "diary-loading" ? "domcontentloaded" : "networkidle", timeout: 30_000 });
        if (item.name === "diary-loading") await page.waitForTimeout(120); else await page.waitForTimeout(520);
        await prepareScenario(page, item);
      } catch (error) {
        navigationError = sanitizedText(error instanceof Error ? error.message : String(error));
      }
      const metrics = await collectMetrics(page);
      const localeFailures = localizedAssertions(item, metrics);
      const focusVisible = await checkFocusVisible(page);
      const screenshot = nutritionV1ScreenshotName(item);
      await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
      const failures = [];
      if (navigationError) failures.push(`navigation: ${navigationError}`);
      if (response && response.status() !== 200) failures.push(`status ${response.status()}`);
      if (metrics.horizontalOverflowPx > 1) failures.push(`horizontal overflow ${metrics.horizontalOverflowPx}px`);
      if (metrics.unnamedInteractiveElements > 0) failures.push(`${metrics.unnamedInteractiveElements} unnamed interactive elements`);
      if (metrics.compactInteractiveTargets > 0) failures.push(`${metrics.compactInteractiveTargets} interactive targets below 44px`);
      if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);
      if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
      if (metrics.interactiveElements > 0 && !focusVisible) failures.push("keyboard focus is not visibly styled");
      failures.push(...localeFailures);
      const { bodyText: _bodyText, ...reportMetrics } = metrics;
      results.push({ name: item.name, route: item.route, viewport: item.viewport.name, requestedDirection: item.direction, language: item.language, largeText: item.largeText, offline: item.offline, screenshot, status: response?.status() ?? null, focusVisible, localizedAssertions: { failures: localeFailures, passed: localeFailures.length === 0 }, pageErrors, consoleErrors, ...reportMetrics, failures, passed: failures.length === 0 });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.passed);
  const report = { generatedAt: new Date().toISOString(), QA_HEAD_SHA, QA_SERVER_MODE, workflowRunId, baseUrl, evidenceDir, viewports: NUTRITION_V1_QA_VIEWPORTS, scenarios: NUTRITION_V1_QA_SCENARIOS.map((item) => ({ name: item.name, route: item.route, viewport: item.viewport.name, direction: item.direction, language: item.language, largeText: item.largeText, offline: item.offline })), checks: { horizontalOverflowPx: true, compactInteractiveTargets: true, unnamedInteractiveElements: true, pageErrors: true, consoleErrors: true, focusVisible: true, localizedAssertions: true, screenshots: true }, summary: { observations: results.length, failures: failed.length, passed: failed.length === 0 }, failures: failed, observations: results };
  await writeFile(path.join(evidenceDir, "nutrition-v1-qa-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Nutrition V1 QA: ${report.summary.observations} scenarios, ${report.summary.failures} failures.`);
  if (options.throwOnFailure !== false && !report.summary.passed) throw new Error(`Nutrition V1 rendered QA failed ${failed.length} scenario(s).`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNutritionV1Qa().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}