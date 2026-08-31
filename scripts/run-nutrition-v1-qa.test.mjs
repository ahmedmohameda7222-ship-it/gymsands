import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REQUIRED_VIEWPORTS = ["390x844", "430x932", "768x1024", "1024x768", "1280x800", "1440x900"];
const REQUIRED_SCENARIOS = [
  "diary-empty","diary-logs-only","diary-plan-only","diary-plan-actual-matching","diary-plan-actual-different","diary-over-target","diary-missing-target","diary-incomplete-nutrition","diary-offline-pending-sync","diary-failed-sync","diary-loading","diary-partial-service-failure","diary-future-date","diary-historical-date","diary-many-foods","diary-other-logs","diary-plan-deviation-chatgpt","diary-logging-session-plate",
  "meal-plan-populated-week","meal-plan-add-workspace-keyboard","meal-plan-tablet","meal-plan-rtl-large-text","shopping-list-three-states","meal-plan-skip-review-remove","meal-plan-chatgpt-review-stale","meal-plan-offline-conflict-partial-estimated",
  "food-library-mobile-default-recent","food-library-mobile-new-user","food-library-mobile-search-verified-unverified","food-library-mobile-search-high-protein-low-carb","food-library-mobile-no-results-removable-filters","food-library-mobile-filter-sheet-live","food-library-mobile-nutrition-info","food-library-mobile-detail-serving-recalculation","food-library-mobile-detail-personal-correction","food-library-mobile-add-to-serving-quantity-destinations","food-library-mobile-create-custom-food-fast-core","food-library-mobile-duplicate-suggestion","food-library-mobile-custom-food-edit-delete","food-library-mobile-offline-cached","food-library-mobile-barcode-fallback","food-library-tablet-adaptive-density","food-library-desktop-bounded-layout","food-library-desktop-detail-panel-route","food-library-desktop-nutrition-info-hover-pinned","food-library-rtl-mixed-brand","food-library-long-branded-name","food-library-large-text",
  "recipes-mobile-home-populated","recipes-mobile-home-empty","recipes-mobile-all-search","recipes-mobile-active-filters","recipes-mobile-no-results","recipes-mobile-editor","recipes-mobile-add-ingredient-search","recipes-mobile-detail","recipes-mobile-before-you-start","recipes-mobile-cooking-normal","recipes-mobile-cooking-attention","recipes-mobile-cooking-parallel-timers","recipes-mobile-cooking-resume-start-over","recipes-mobile-cooking-complete","recipes-mobile-offline-partial-failure","recipes-mobile-autosave-failure","recipes-desktop-home","recipes-desktop-detail","recipes-desktop-cooking","recipes-rtl-home-mobile","recipes-rtl-cooking-mobile","recipes-large-text-cooking","recipes-long-name-action","recipes-recently-deleted",
];

const REQUIRED_ARABIC_SCENARIOS = [
  "meal-plan-rtl-large-text",
  "food-library-rtl-mixed-brand",
  "recipes-rtl-home-mobile",
  "recipes-rtl-cooking-mobile",
];

test("Nutrition V1 rendered QA exports the complete approved scenario and viewport matrix", async () => {
  const qa = await import("./run-nutrition-v1-qa.mjs");
  assert.equal(Array.isArray(qa.NUTRITION_V1_QA_VIEWPORTS), true);
  assert.equal(Array.isArray(qa.NUTRITION_V1_QA_SCENARIOS), true);
  const viewportNames = new Set(qa.NUTRITION_V1_QA_VIEWPORTS.map((viewport) => viewport.name));
  for (const viewport of REQUIRED_VIEWPORTS) assert.equal(viewportNames.has(viewport), true, viewport);
  const scenarioNames = new Set(qa.NUTRITION_V1_QA_SCENARIOS.map((scenario) => scenario.name));
  for (const scenario of REQUIRED_SCENARIOS) assert.equal(scenarioNames.has(scenario), true, scenario);
  const routes = new Set(qa.NUTRITION_V1_QA_SCENARIOS.map((scenario) => scenario.route));
  for (const route of ["/calories","/my-meal-plan","/my-meal-plan/shopping","/calories/food-hub","/my-recipes"]) assert.equal(routes.has(route), true, route);
  assert.equal(qa.NUTRITION_V1_QA_SCENARIOS.some((scenario) => scenario.direction === "rtl"), true);
  assert.equal(qa.NUTRITION_V1_QA_SCENARIOS.some((scenario) => scenario.largeText === true), true);
  assert.equal(qa.NUTRITION_V1_QA_SCENARIOS.some((scenario) => scenario.offline === true), true);
});

test("offline Meal Plan conflict scenario stays pinned to the fixture date and fixture week", async () => {
  const qa = await import("./run-nutrition-v1-qa.mjs");
  const scenario = qa.NUTRITION_V1_QA_SCENARIOS.find((item) => item.name === "meal-plan-offline-conflict-partial-estimated");
  assert.ok(scenario, "meal-plan-offline-conflict-partial-estimated");
  const route = new URL(scenario.route, "https://qa.local");
  assert.equal(route.pathname, "/my-meal-plan");
  assert.equal(route.searchParams.get("date"), "2026-08-26");

  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  const fixtureWeekStart = source.match(/const MEAL_PLAN_QA_WEEK_START = "([^"]+)";/)?.[1];
  assert.ok(fixtureWeekStart, "MEAL_PLAN_QA_WEEK_START");
  assert.equal(route.searchParams.get("week"), fixtureWeekStart);
  assert.equal(scenario.offline, true);
  assert.notEqual(scenario.route, "/my-meal-plan");
});

test("approved RTL screenshot scenarios exercise the real Arabic product locale", async () => {
  const qa = await import("./run-nutrition-v1-qa.mjs");
  for (const name of REQUIRED_ARABIC_SCENARIOS) {
    const scenario = qa.NUTRITION_V1_QA_SCENARIOS.find((item) => item.name === name);
    assert.ok(scenario, name);
    assert.equal(scenario.direction, "rtl", `${name} direction`);
    assert.equal(scenario.language, "ar", `${name} language`);
  }
});

test("Shopping rendered evidence visibly seeds Needed, Purchased, and Don't need states", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /shopping-list-three-states/);
  assert.match(source, /state:\s*"Purchased"/);
  assert.match(source, /state:\s*"Don't need"/);
});

test("offline Meal Plan rendered evidence explicitly proves queued, attention, conflict, partial, and estimated truth", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /function mealPlanOfflineQueueFixture\(/);
  assert.match(source, /function mealPlanOfflineEvidenceOccurrences\(/);
  assert.match(source, /status:\s*"queued"/);
  assert.match(source, /status:\s*"needs_attention"/);
  assert.match(source, /status:\s*"conflict"/);
  assert.match(source, /estimatedNutrition/);
  assert.match(source, /plaivra:nutrition-v1:meal-plan:queue/);
  for (const label of ["Waiting to sync", "Needs attention", "Conflict", "Partial", "Estimated"]) {
    assert.equal(source.includes(label), true, label);
  }
});

test("Recipe editor QA fixtures contain a real working draft and drive editor, ingredient-search, and autosave-failure states", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /function recipeDetail\([\s\S]*?draft:\s*\{/);
  assert.match(source, /recipes-mobile-add-ingredient-search[\s\S]{0,260}open-recipe-add-ingredient/);
  assert.match(source, /recipes-mobile-autosave-failure[\s\S]{0,260}trigger-recipe-autosave-failure/);
  assert.match(source, /getByRole\("link",\s*\{\s*name:\s*\/add ingredient\/i/);
  assert.match(source, /recipes-mobile-autosave-failure[\s\S]{0,700}503/);
  for (const marker of ["Recipe editor", "Add ingredient", "Not saved"]) assert.equal(source.includes(marker), true, marker);
});

test("Cooking completion QA restores a completed session and asserts all approved post-cooking actions", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /const complete = item\.cookingState === "complete"/);
  assert.match(source, /status:\s*complete\s*\?\s*"completed"\s*:\s*"active"/);
  assert.match(source, /completedAt:\s*complete\s*\?\s*"[^"]+"\s*:\s*null/);
  for (const marker of ["Cooking complete", "Add to Diary", "Add to Meal Plan", "Save as Meal", "Close"]) {
    assert.equal(source.includes(marker), true, marker);
  }
});

test("rendered evidence matching tolerates CSS text transforms without masking missing content", async () => {
  const qa = await import("./run-nutrition-v1-qa.mjs");
  assert.equal(typeof qa.renderedTextContains, "function");
  assert.equal(
    qa.renderedTextContains("COOKING COMPLETE\nChicken bowl\nAdd to Diary", "Cooking complete"),
    true,
  );
  assert.equal(
    qa.renderedTextContains("COOKING COMPLETE\nChicken bowl\nAdd to Diary", "Save as Meal"),
    false,
  );
});

test("expected Recipe autosave 503 is bounded to the injected failure scenario instead of globally hiding console errors", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /item\.recipeAutosaveStatus\s*===\s*503/);
  assert.match(source, /Failed to load resource[\s\S]{0,160}503/);
  assert.match(source, /expectedAutosaveFailure/);
});

test("Food Library QA scenarios explicitly drive and assert Create, duplicate, edit-delete, serving, correction, and barcode states", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  for (const interaction of ["food-create-custom", "food-duplicate-suggestion", "food-custom-edit-delete", "food-serving-recalculation", "food-personal-correction", "food-barcode-fallback"]) {
    assert.equal(source.includes(interaction), true, interaction);
  }
  for (const marker of ["Create Food", "Possible duplicate", "Delete Food", "Correct for me", "Barcode", "Search remains available"]) {
    assert.equal(source.includes(marker), true, marker);
  }
});

test("barcode fallback interaction targets the Barcode textbox rather than the dialog accessible name", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /getByRole\("textbox",\s*\{\s*name:\s*\/barcode\/i\s*\}\)/);
  assert.doesNotMatch(source, /getByLabel\(\/barcode\/i\)/);
});

test("Playwright init fixture passes Node constants through the serializable argument boundary", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /addInitScript\(\(\{[^}]*mockAuthUserId[^}]*mealPlanWeekStart[^}]*\}\)\s*=>/s);
  assert.match(source, /mockAuthUserId:\s*MOCK_AUTH_USER_ID/);
  assert.match(source, /mealPlanWeekStart:\s*MEAL_PLAN_QA_WEEK_START/);
  assert.match(source, /queue:\$\{mockAuthUserId\}:\$\{mealPlanWeekStart\}/);
});

test("Nutrition V1 screenshot names are deterministic, portable, and collision resistant", async () => {
  const qa = await import("./run-nutrition-v1-qa.mjs");
  const scenario = qa.NUTRITION_V1_QA_SCENARIOS.find((item) => item.name === "recipes-rtl-cooking-mobile");
  assert.ok(scenario);
  const first = qa.nutritionV1ScreenshotName(scenario);
  assert.equal(first, qa.nutritionV1ScreenshotName({ ...scenario }));
  assert.match(first, /^[a-z0-9-]+__[0-9]+x[0-9]+__(?:ltr|rtl)__(?:en|de|ar)__(?:normal|large)\.png$/);
});

test("Nutrition V1 rendered QA captures runtime, layout, target, locale, focus, and evidence failures", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  for (const required of ["page.screenshot","horizontalOverflowPx","compactInteractiveTargets","unnamedInteractiveElements","pageErrors","consoleErrors","focusVisible","QA_HEAD_SHA","QA_SERVER_MODE","nutrition-v1-qa-results.json","plaivra.language.v1","document.documentElement.lang","localizedAssertions"]) assert.equal(source.includes(required), true, required);
});

test("Nutrition V1 QA applies locale preferences only after the document root exists", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /const applyDocumentPreferences = \(\) =>/);
  assert.match(source, /if \(!document\.documentElement\) return false/);
  assert.match(source, /DOMContentLoaded/);
});

test("Nutrition V1 touch-target audit excludes only currently clipped sr-only helpers", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /classList\.contains\("sr-only"\)/);
  assert.match(source, /document\.activeElement !== element/);
  assert.match(source, /const targetAuditedInteractive = interactive\.filter/);
});

test("canonical rendered QA invokes the bounded Nutrition V1 suite", async () => {
  const source = await readFile(new URL("./run-rendered-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /run-nutrition-v1-qa\.mjs/);
  assert.match(source, /nutrition-v1/);
});
