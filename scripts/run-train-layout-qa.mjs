import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.join(process.cwd(), "qa-artifacts", "pr53-final");
const activePlanId = "10000000-0000-4000-8000-000000000001";
const viewports = [
  { name: "360x780", width: 360, height: 780 },
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

function intersects(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function openScenario({ viewport, scenario, language = "en", route, step = null }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "light" });
  await context.addInitScript(({ scenarioValue, languageValue }) => {
    localStorage.setItem("plaivra.qa.train-scenario", scenarioValue);
    localStorage.setItem("plaivra.language.v1", languageValue);
  }, { scenarioValue: scenario, languageValue: language });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("[data-app-shell]", { timeout: 20_000 });
  if (scenario === "active") await page.waitForSelector("[data-active-workout-controller]", { timeout: 20_000 });
  if (step === 2) {
    await page.waitForSelector('[data-builder-step="details"]', { timeout: 20_000 });
    await page.locator("[data-train-sticky-footer] button").last().click();
    await page.waitForSelector('[data-builder-step="days"]', { timeout: 20_000 });
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
    pageErrors
  };
  const safeRoute = route.replaceAll("/", "-").replace(/^-/, "") || "root";
  await page.screenshot({ path: path.join(outputDir, `${scenario}-${language}-${viewport.name}-${safeRoute}${step ? `-step${step}` : ""}.png`), fullPage: true });
  await context.close();
  return item;
}

for (const viewport of viewports) {
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans" }));
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans/builder", step: 1 }));
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans/builder", step: 2 }));
  observations.push(await openScenario({ viewport, scenario: "active", route: `/my-workout/plans/${activePlanId}/edit` }));
}
for (const viewport of viewports.filter((item) => ["390x844", "768x1024", "1440x900"].includes(item.name))) {
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
  observations.push(await openScenario({ viewport: viewports[1], scenario: "active", language: "ar", route, step: route.endsWith("builder") ? 2 : null }));
}
await browser.close();

const failures = observations.filter((item) => {
  const expectedController = item.scenario === "active";
  return item.status !== 200
    || item.pageErrors.length > 0
    || item.horizontalOverflowPx > 1
    || Boolean(item.controller) !== expectedController
    || item.shellState !== (expectedController ? "present" : "absent")
    || item.intersections.controllerFooter
    || item.intersections.controllerNav
    || item.intersections.controllerLastMainAction
    || item.intersections.footerNav
    || (item.scenario === "rest" && item.restActionHref !== `/my-workout/plans/${activePlanId}`)
    || (item.language === "ar" && item.direction !== "rtl");
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
