import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve(
  process.env.QA_TRAIN_EVIDENCE_DIR || path.join(process.cwd(), "quality-reports", "train-phase0b-phase1")
);
const activePlanId = "10000000-0000-4000-8000-000000000001";
const inactivePlanId = "10000000-0000-4000-8000-000000000002";
const archivedPlanId = "10000000-0000-4000-8000-000000000003";
const activeDayId = "10000000-0000-4000-8000-000000000011";
const catalogActivityId = "11111111-1111-4111-8111-111111111111";
const viewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];

const catalogActivities = Array.from({ length: 8 }, (_, index) => ({
  id: index === 0 ? catalogActivityId : `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  slug: index === 0 ? "barbell_squat" : `catalog_activity_${index + 1}`,
  name: index === 0 ? "Barbell squat with a deliberately long activity name for responsive verification" : `Catalog activity ${index + 1}`,
  shortDescription: index === 0 ? "A catalog-backed strength movement used for deterministic rendered verification." : null,
  instructions: [{ order: 1, text: "Brace, move with control, and stop if the movement feels painful." }],
  difficulty: index % 2 ? "beginner" : "intermediate",
  movementPattern: index % 2 ? "push" : "squat",
  version: 1,
  activityType: { id: "22222222-2222-4222-8222-222222222222", slug: "strength", name: "Strength" },
  metricSchema: null,
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [{ id: "33333333-3333-4333-8333-333333333333", slug: index % 2 ? "bodyweight" : "barbell", name: index % 2 ? "Bodyweight" : "Barbell", isRequired: true }],
  muscles: [{ id: "44444444-4444-4444-8444-444444444444", slug: index % 2 ? "chest" : "quadriceps", name: index % 2 ? "Chest" : "Quadriceps", role: "primary" }],
  trainingGoals: [],
  translations: {},
  guideUrl: index === 0 ? "https://example.com/catalog-guide" : null,
  videoUrl: index === 0 ? "https://example.com/catalog-video" : null,
  updatedAt: "2026-07-15T00:00:00.000Z"
}));

function catalogPayload(url, scenario) {
  const meta = { source: scenario === "fallback" ? "legacy" : "external", degraded: scenario === "fallback", catalogVersion: scenario === "fallback" ? "legacy" : "v1", locale: "en" };
  if (url.pathname.endsWith("/filters")) return { data: { sports: [], activityTypes: [catalogActivities[0].activityType], sessionTypes: [], sessionPhases: [], equipment: catalogActivities.slice(0, 2).map((item) => ({ id: item.equipment[0].id, slug: item.equipment[0].slug, name: item.equipment[0].name })), trainingGoals: [], difficulties: ["beginner", "intermediate"] }, meta };
  if (url.pathname.endsWith("/alternatives")) return { data: scenario === "empty" ? [] : [{ sourceActivityId: catalogActivityId, alternativeActivityId: catalogActivities[1].id, alternativeSlug: catalogActivities[1].slug, alternativeName: catalogActivities[1].name, reasonCode: "same_pattern", prescriptionTransfer: "partial", compatibilityScore: 0.8, priority: 1 }], meta };
  if (/\/activities\/[^/]+$/.test(url.pathname)) return { data: catalogActivities.find((item) => item.id === url.pathname.split("/").at(-1) || item.slug === url.pathname.split("/").at(-1)) ?? catalogActivities[0], meta };
  if (url.pathname.endsWith("/activities")) {
    const data = scenario === "empty" ? [] : catalogActivities;
    return { data, pagination: { limit: Number(url.searchParams.get("limit") || 30), offset: Number(url.searchParams.get("offset") || 0), returned: data.length, nextOffset: null }, meta };
  }
  if (url.pathname.endsWith("/sports")) return { data: [], meta };
  return { data: { sport: { id: "55555555-5555-4555-8555-555555555555", slug: "strength", name: "Strength" }, sessionTypes: [], sessionPhases: [] }, meta };
}

function intersects(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function openScenario({ viewport, scenario, language = "en", route, step = null, theme = "light", catalogScenario = "success", zoom = 1, openPicker = false, keyboardCheck = false, mobileKeyboard = false, variant = "default" }) {
  const renderedViewport = zoom === 1 ? viewport : { ...viewport, width: Math.max(160, Math.floor(viewport.width / zoom)), height: Math.max(284, Math.floor(viewport.height / zoom)) };
  const context = await browser.newContext({ viewport: renderedViewport, reducedMotion: "reduce", colorScheme: theme });
  await context.route("**/api/activity-catalog/**", async (requestRoute) => {
    const url = new URL(requestRoute.request().url());
    await requestRoute.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store", "x-plaivra-qa-fixture": catalogScenario }, body: JSON.stringify(catalogPayload(url, catalogScenario)) });
  });
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (requestRoute) => {
    const method = requestRoute.request().method();
    let body = {};
    if (method !== "GET" && method !== "HEAD") {
      try { body = requestRoute.request().postDataJSON(); } catch { body = {}; }
    }
    await requestRoute.fulfill({ status: method === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0", "x-plaivra-qa-fixture": "empty-user-data" }, body: method === "HEAD" ? "" : JSON.stringify(Array.isArray(body) ? body[0] ?? {} : method === "GET" ? [] : body) });
  });
  await context.addInitScript(({ scenarioValue, languageValue, variantValue }) => {
    localStorage.setItem("plaivra.qa.train-scenario", scenarioValue);
    localStorage.setItem("plaivra.language.v1", languageValue);
    localStorage.setItem("plaivra.qa.train-variant", variantValue);
  }, { scenarioValue: scenario, languageValue: language, variantValue: variant });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const isSessionRoute = route.startsWith("/workouts/session");
  await page.waitForSelector(isSessionRoute ? "main#main-content" : "[data-app-shell]", { timeout: 20_000 });
  // Next's development chrome is not application UI and can intercept
  // otherwise valid keyboard/pointer verification paths.
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((element) => element.remove()));
  if (scenario === "active" && !isSessionRoute) await page.waitForSelector("[data-active-workout-controller]", { timeout: 20_000 });
  if (step === 2) {
    await page.waitForSelector('[data-builder-step="details"]', { timeout: 20_000 });
    const continueButton = page.locator("[data-train-sticky-footer] button").last();
    if (step === 3) await continueButton.click();
    else {
      await continueButton.focus();
      await continueButton.press("Enter");
    }
    await page.waitForSelector('[data-builder-step="days"]', { timeout: 20_000 });
  }
  if (step === 3 || openPicker) {
    await page.waitForSelector('[data-builder-step="details"]', { timeout: 20_000 });
    const continueButton = page.locator("[data-train-sticky-footer] button").last();
    await continueButton.focus();
    await continueButton.press("Enter");
    await page.waitForSelector('[data-builder-step="days"]', { timeout: 20_000 });
    if (step === 3) {
      const dayButtons = page.locator("[data-builder-day-tabs] > button");
      const trainingDayCount = Math.max(1, (await dayButtons.count()) - 1);
      for (let dayIndex = 0; dayIndex < trainingDayCount; dayIndex += 1) {
        if (dayIndex > 0) {
          const dayButton = dayButtons.nth(dayIndex);
          await dayButton.click();
        }
        const addExercisesButton = page.getByRole("button", { name: /add exercises/i }).first();
        await addExercisesButton.click();
        await page.waitForSelector("[data-train-exercise-picker]", { timeout: 20_000 });
        const firstPickerCard = page.locator('[data-picker-results] article button[aria-pressed]').first();
        await firstPickerCard.click();
        const addSelectedButton = page.locator("[data-picker-footer] button").last();
        await addSelectedButton.click();
        await page.waitForSelector("[data-train-exercise-picker]", { state: "hidden", timeout: 20_000 });
      }
      const reviewButton = page.locator("[data-train-sticky-footer] button").last();
      await reviewButton.click();
      await page.waitForTimeout(100);
      if (!(await page.locator('[data-builder-step="review"]').count())) {
        const debugState = await page.evaluate(() => ({
          dayButtons: [...document.querySelectorAll("[data-builder-day-tabs] > button")].map((item) => item.textContent?.trim()),
          selectedExercises: document.querySelectorAll("[data-exercise-prescription]").length,
          alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim()),
          footerButtons: [...document.querySelectorAll("[data-train-sticky-footer] button")].map((item) => ({ text: item.textContent?.trim(), disabled: (item instanceof HTMLButtonElement) && item.disabled }))
        }));
        console.error("Builder review transition debug", JSON.stringify(debugState));
      }
      await page.waitForSelector('[data-builder-step="review"]', { timeout: 20_000 });
    } else {
      const addExercisesButton = page.getByRole("button", { name: /add exercises/i }).first();
      await addExercisesButton.focus();
      await addExercisesButton.press("Enter");
      await page.waitForSelector("[data-train-exercise-picker]", { timeout: 20_000 });
    }
  }
  let keyboard = { checked: false, focusVisible: null, tabSelectionChanged: null, pickerFocusReturned: null };
  if (keyboardCheck) {
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    const tab = page.locator('[role="tab"]').first();
    let tabSelectionChanged = null;
    if (await tab.count()) {
      await tab.focus();
      const before = await tab.getAttribute("aria-selected");
      await page.keyboard.press("ArrowRight");
      const after = await tab.getAttribute("aria-selected");
      tabSelectionChanged = before !== after || (await page.locator('[role="tab"][aria-selected="true"]').count()) === 1;
    }
    let pickerFocusReturned = null;
    if (openPicker) {
      await page.keyboard.press("Escape");
      await page.waitForSelector("[data-train-exercise-picker]", { state: "hidden", timeout: 10_000 });
      const addExercise = page.getByRole("button", { name: /add exercises/i }).first();
      pickerFocusReturned = await addExercise.evaluate((element) => element === document.activeElement);
      await addExercise.press("Enter");
      await page.waitForSelector("[data-train-exercise-picker]", { timeout: 10_000 });
    }
    keyboard = { checked: true, focusVisible, tabSelectionChanged, pickerFocusReturned };
  }
  let mobileKeyboardState = { checked: false, focused: false, visualViewport: null };
  if (mobileKeyboard) {
    const input = page.locator('input:not([type="hidden"]), textarea').filter({ visible: true }).first();
    if (await input.count()) {
      await input.focus();
      const keyboardViewport = { width: renderedViewport.width, height: Math.max(280, Math.floor(renderedViewport.height * 0.55)) };
      await page.setViewportSize(keyboardViewport);
      mobileKeyboardState = { checked: true, focused: await input.evaluate((element) => element === document.activeElement), visualViewport: `${keyboardViewport.width}x${keyboardViewport.height}` };
    } else {
      mobileKeyboardState = { checked: true, focused: false, visualViewport: null };
    }
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && value.width > 0 && value.height > 0;
    };
    const rect = (element) => {
      if (!visible(element)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const main = document.querySelector("#main-content");
    const controller = document.querySelector("[data-active-workout-controller]");
    const nav = document.querySelector("[data-mobile-floating-nav]");
    const footer = document.querySelector("[data-train-sticky-footer]");
    const restAction = document.querySelector("[data-rest-day-weekly-plan] a");
    const actions = main ? [...main.querySelectorAll("a,button")].filter((element) => visible(element) && !element.closest("[data-train-sticky-footer]")) : [];
    return {
      controller: rect(controller),
      nav: rect(nav),
      footer: rect(footer),
      lastMainAction: rect(actions.at(-1) ?? null),
      shellState: document.querySelector("[data-app-shell]")?.getAttribute("data-active-workout-controller-state") ?? null,
      restActionHref: restAction?.getAttribute("href") ?? null,
      direction: document.querySelector("[data-train-today-card]")?.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  });
  const item = {
    viewport: viewport.name,
    scenario,
    language,
    theme,
    catalogScenario,
    zoom,
    variant,
    mobileKeyboard,
    renderedViewport: `${renderedViewport.width}x${renderedViewport.height}`,
    openPicker,
    route,
    step,
    status: response?.status() ?? null,
    ...metrics,
    intersections: {
      controllerFooter: intersects(metrics.controller, metrics.footer),
      controllerNav: intersects(metrics.controller, metrics.nav),
      controllerLastMainAction: intersects(metrics.controller, metrics.lastMainAction),
      footerNav: intersects(metrics.footer, metrics.nav)
    },
    pageErrors,
    keyboard,
    mobileKeyboardState
  };
  const safeRoute = route.replaceAll("/", "-").replace(/^-/, "") || "root";
  const artifact = `${scenario}-${variant}-${catalogScenario}-${theme}-${language}-${viewport.name}-${safeRoute}${step ? `-step${step}` : ""}${openPicker ? "-picker" : ""}${mobileKeyboard ? "-mobile-keyboard" : ""}${zoom !== 1 ? `-zoom${zoom}` : ""}.png`;
  await page.screenshot({ path: path.join(outputDir, artifact), fullPage: true });
  item.artifact = artifact;
  await context.close();
  return item;
}

// Exercise the longest connected builder interaction first so a regression
// fails quickly instead of after the full screenshot matrix.
observations.push(await openScenario({ viewport: viewports[2], scenario: "scheduled", route: "/my-workout/plans/builder", step: 3 }));

for (const viewport of viewports) {
  for (const target of [
    { route: "/my-workout/plans" },
    { route: "/my-workout/plans/builder", step: 1 },
    { route: "/my-workout/plans/builder", step: 2 },
    { route: `/my-workout/plans/${activePlanId}` },
    { route: `/my-workout/plans/${activePlanId}/edit` },
    { route: "/workouts" },
    { route: `/workouts/${catalogActivityId}` },
    { route: "/workout-history" },
    { route: `/workouts/session/${catalogActivityId}` },
    { route: `/workouts/session/day/${activeDayId}` },
  ]) observations.push(await openScenario({ viewport, scenario: "active", ...target }));
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans/builder", openPicker: true }));
}
for (const viewport of viewports.filter((item) => ["320x568", "390x844", "768x1024", "1440x900"].includes(item.name))) {
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: "/my-workout/plans" }));
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: "/my-workout/plans/builder", step: 2 }));
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: `/my-workout/plans/${activePlanId}/edit` }));
}
for (const language of ["en", "de", "ar"]) {
  for (const viewport of viewports.filter((item) => ["390x844", "1440x900"].includes(item.name))) {
    observations.push(await openScenario({ viewport, scenario: "rest", language, route: "/my-workout/plans" }));
  }
}
for (const route of ["/my-workout/plans", "/my-workout/plans/builder", `/my-workout/plans/${activePlanId}/edit`]) {
  observations.push(await openScenario({ viewport: viewports[2], scenario: "active", language: "ar", route, step: route.endsWith("builder") ? 2 : null }));
}
for (const route of [
  "/my-workout/plans", `/my-workout/plans/${activePlanId}`, `/my-workout/plans/${activePlanId}/edit`,
  "/workouts", `/workouts/${catalogActivityId}`, "/workout-history", `/workouts/session/${catalogActivityId}`, `/workouts/session/day/${activeDayId}`,
]) {
  observations.push(await openScenario({ viewport: viewports[2], scenario: "active", language: "ar", route }));
  observations.push(await openScenario({ viewport: viewports[2], scenario: "active", theme: "dark", route }));
}
for (const target of [
  { route: "/my-workout/plans" },
  { route: "/my-workout/plans/builder", step: 2 },
  { route: `/my-workout/plans/${activePlanId}` },
  { route: `/my-workout/plans/${activePlanId}/edit` },
  { route: "/workouts" },
  { route: `/workouts/${catalogActivityId}` },
  { route: "/workout-history" },
  { route: `/workouts/session/${catalogActivityId}` },
  { route: `/workouts/session/day/${activeDayId}` },
  { route: "/my-workout/plans/builder", openPicker: true },
]) {
  observations.push(await openScenario({ viewport: viewports[6], scenario: "active", ...target, zoom: 2, keyboardCheck: true }));
}
for (const catalogScenario of ["fallback", "empty"]) {
  for (const route of ["/workouts", `/workouts/${catalogActivityId}`]) {
    observations.push(await openScenario({ viewport: viewports[2], scenario: "scheduled", route, catalogScenario }));
  }
}
observations.push(await openScenario({ viewport: viewports[2], scenario: "scheduled", route: `/my-workout/plans/${inactivePlanId}` }));
observations.push(await openScenario({ viewport: viewports[2], scenario: "scheduled", route: `/my-workout/plans/${archivedPlanId}` }));
for (const variant of ["one-day-one-exercise", "seven-day-many-exercises", "long-names"]) {
  for (const viewport of [viewports[2], viewports[7]]) {
    for (const route of ["/my-workout/plans", `/my-workout/plans/${activePlanId}`, `/my-workout/plans/${activePlanId}/edit`]) {
      observations.push(await openScenario({ viewport, scenario: "active", route, variant }));
    }
  }
}
observations.push(await openScenario({ viewport: viewports[2], scenario: "active", route: `/workouts/${catalogActivities[1].id}` }));
for (const target of [
  { route: "/my-workout/plans/builder", step: 2 },
  { route: "/workouts" },
  { route: `/workouts/session/${catalogActivityId}` },
  { route: `/workouts/session/day/${activeDayId}` },
]) {
  observations.push(await openScenario({ viewport: viewports[2], scenario: "active", ...target, mobileKeyboard: true }));
}
await browser.close();

const failures = observations.filter((item) => {
  const sessionRoute = item.route.startsWith("/workouts/session");
  const expectedController = item.scenario === "active" && !sessionRoute;
  return item.status !== 200
    || item.pageErrors.length > 0
    || item.horizontalOverflowPx > 1
    || Boolean(item.controller) !== expectedController
    || (!sessionRoute && item.shellState !== (expectedController ? "present" : "absent"))
    || item.intersections.controllerFooter
    || item.intersections.controllerNav
    || item.intersections.controllerLastMainAction
    || item.intersections.footerNav
    || (item.scenario === "rest" && item.route === "/my-workout/plans" && item.restActionHref !== `/my-workout/plans/${activePlanId}`)
    || (item.language === "ar" && item.direction !== "rtl")
    || (item.keyboard.checked && (!item.keyboard.focusVisible || item.keyboard.tabSelectionChanged === false || item.keyboard.pickerFocusReturned === false))
    || (item.mobileKeyboardState.checked && !item.mobileKeyboardState.focused);
});
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  viewports,
  summary: { observations: observations.length, failures: failures.length, passed: failures.length === 0 },
  failures,
  observations
};
await writeFile(path.join(outputDir, "train-layout-qa-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Train layout QA: ${observations.length} observations, ${failures.length} failures.`);
if (failures.length) process.exitCode = 1;
