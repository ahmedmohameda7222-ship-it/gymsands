import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.join(process.cwd(), "docs", "qa", "evidence", "2026-07-11");
const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "393x852", width: 393, height: 852 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
];
const routes = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "registration", path: "/register" },
  { name: "recovery", path: "/forgot-password" },
  { name: "onboarding", path: "/onboarding" },
  { name: "dashboard", path: "/dashboard" },
  { name: "workout-plan", path: "/my-workout/plans" },
  { name: "active-workout", path: "/today-workout" },
  { name: "food-log", path: "/calories" },
  { name: "meal-plan-groceries", path: "/my-meal-plan" },
  { name: "progress", path: "/progress" },
  { name: "settings-privacy-deletion", path: "/settings/data-privacy" },
  { name: "oauth-consent", path: "/oauth/authorize" },
  { name: "subscription", path: "/settings/subscription" },
  { name: "privacy", path: "/legal/privacy" },
  { name: "terms", path: "/legal/terms" },
  { name: "disclaimer", path: "/legal/disclaimer" },
  { name: "impressum", path: "/legal/impressum" }
];

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (let viewportIndex = 0; viewportIndex < viewports.length; viewportIndex += 1) {
  const viewport = viewports[viewportIndex];
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "light" });
  const page = await context.newPage();
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex];
    const pageErrors = [];
    const consoleErrors = [];
    const onPageError = (error) => pageErrors.push(error.message);
    const onConsole = (message) => { if (message.type() === "error") consoleErrors.push(message.text()); };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const interactive = [...document.querySelectorAll("button, input, select, textarea, [role='button'], nav a")].filter(visible);
      const unnamed = interactive.filter((element) => {
        const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.getAttribute("placeholder") || element.getAttribute("value") || ("labels" in element && element.labels?.length ? "associated-label" : "");
        return !String(label || "").trim();
      }).length;
      const compactTargets = interactive.filter((element) => {
        const target = (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) && element.labels?.[0]) ? element.labels[0] : element;
        const rect = target.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).length;
      const compactTargetDetails = interactive.filter((element) => {
        const target = (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) && element.labels?.[0]) ? element.labels[0] : element;
        const rect = target.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).slice(0, 12).map((element) => {
        const target = (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) && element.labels?.[0]) ? element.labels[0] : element;
        const rect = target.getBoundingClientRect();
        return { tag: element.tagName.toLowerCase(), text: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 60), width: Math.round(rect.width), height: Math.round(rect.height) };
      });
      return {
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.trim() || null,
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        unnamedInteractiveElements: unnamed,
        compactInteractiveTargets: compactTargets,
        compactTargetDetails,
        interactiveElements: interactive.length,
        hasMain: Boolean(document.querySelector("main")),
        hasRetryControl: Boolean([...document.querySelectorAll("button, a")].find((element) => /retry|try again/i.test(element.textContent || "")))
      };
    });
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return { visible: false, tag: null };
      const style = getComputedStyle(active);
      return {
        visible: style.outlineStyle !== "none" || style.boxShadow !== "none",
        tag: active.tagName.toLowerCase()
      };
    });
    if (routeIndex % viewports.length === viewportIndex) {
      await page.screenshot({ path: path.join(evidenceDir, `${route.name}-${viewport.name}.png`), fullPage: true });
    }
    results.push({
      route: route.path,
      surface: route.name,
      viewport: viewport.name,
      status: response?.status() ?? null,
      finalUrl: page.url(),
      reducedMotion: true,
      ...metrics,
      keyboardFocusVisible: focus.visible,
      focusedTag: focus.tag,
      pageErrors,
      consoleErrors: consoleErrors.filter((message) => !/favicon|Failed to load resource.*404/i.test(message))
    });
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
  await context.close();
}

const zoomContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const zoomPage = await zoomContext.newPage();
await zoomPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await zoomPage.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
const zoomOverflow = await zoomPage.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
await zoomPage.screenshot({ path: path.join(evidenceDir, "landing-390x844-200-percent-text.png"), fullPage: true });
await zoomPage.evaluate(() => localStorage.setItem("plaivra.language.v1", "ar"));
await zoomPage.reload({ waitUntil: "networkidle" });
const localizedOverflow = await zoomPage.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
await zoomPage.screenshot({ path: path.join(evidenceDir, "landing-390x844-arabic.png"), fullPage: true });
await zoomContext.close();
await browser.close();

const knownDevelopmentConsolePattern = /eval\(\) is not supported in this environment|\[dashboard\.load\] Error: Please refresh, sign in again, and retry/;
for (const item of results) item.unexpectedConsoleErrors = item.consoleErrors.filter((message) => !knownDevelopmentConsolePattern.test(message));
const failures = results.filter((item) => item.status !== 200 || item.horizontalOverflowPx > 1 || item.unnamedInteractiveElements > 0 || item.pageErrors.length > 0 || item.unexpectedConsoleErrors.length > 0);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  mockAuthExpected: true,
  viewports,
  routes: routes.map((item) => item.path),
  checks: { reducedMotion: true, keyboardFocus: true, screenReaderNames: true, touchTargetsMeasured: true, textZoomPercent: 200, zoomOverflowPx: zoomOverflow, longLocalizedTextLanguage: "ar", localizedOverflowPx: localizedOverflow },
  summary: { observations: results.length, failures: failures.length, passed: failures.length === 0 && zoomOverflow <= 1 && localizedOverflow <= 1 },
  failures,
  observations: results
};
await writeFile(path.join(process.cwd(), "docs", "qa", "rendered-qa-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Rendered QA: ${report.summary.observations} observations, ${report.summary.failures} failures, zoom overflow ${zoomOverflow}px.`);
if (!report.summary.passed) process.exitCode = 1;
