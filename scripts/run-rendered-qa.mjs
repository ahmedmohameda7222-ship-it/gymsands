import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.resolve(process.env.QA_EVIDENCE_DIR || path.join(process.cwd(), "quality-reports", "rendered-qa-evidence"));
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
const knownDevelopmentConsolePattern = /eval\(\) is not supported in this environment/;

function sanitizedText(value, limit = 1600) {
  return String(value ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/gi, "[REDACTED]")
    .slice(0, limit);
}

async function createDeterministicContext(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "light" });
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    let requestBody = null;
    if (method !== "GET" && method !== "HEAD") {
      try {
        requestBody = route.request().postDataJSON();
      } catch {
        requestBody = {};
      }
    }
    const responseBody = method === "GET" || method === "HEAD"
      ? []
      : Array.isArray(requestBody)
        ? requestBody[0] ?? {}
        : requestBody ?? {};
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0", "x-plaivra-qa-fixture": "empty-v1" },
      body: method === "HEAD" ? "" : JSON.stringify(responseBody)
    });
  });
  return context;
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (let viewportIndex = 0; viewportIndex < viewports.length; viewportIndex += 1) {
  const viewport = viewports[viewportIndex];
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const context = await createDeterministicContext(browser, viewport);
    const page = await context.newPage();
    const route = routes[routeIndex];
    const pageErrors = [];
    const consoleErrors = [];
    const transitionEvents = [];
    const onPageError = (error) => pageErrors.push({ message: sanitizedText(error.message), stack: sanitizedText(error.stack || error.message) });
    const onConsole = (message) => { if (message.type() === "error") consoleErrors.push({ category: message.type(), message: sanitizedText(message.text(), 800) }); };
    const onNavigation = (frame) => { if (frame === page.mainFrame()) transitionEvents.push({ path: new URL(frame.url()).pathname, at: new Date().toISOString() }); };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("framenavigated", onNavigation);
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
    const filteredConsoleErrors = consoleErrors.filter((entry) => !/favicon|Failed to load resource.*404/i.test(entry.message));
    const unexpectedConsoleErrors = filteredConsoleErrors.filter((entry) => !knownDevelopmentConsolePattern.test(entry.message));
    const failed = response?.status() !== 200 || metrics.horizontalOverflowPx > 1 || metrics.unnamedInteractiveElements > 0 || pageErrors.length > 0 || unexpectedConsoleErrors.length > 0;
    let failureScreenshot = null;
    if (failed) {
      failureScreenshot = `failure-${route.name}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(evidenceDir, failureScreenshot), fullPage: true });
    } else if (routeIndex % viewports.length === viewportIndex) {
      await page.screenshot({ path: path.join(evidenceDir, `${route.name}-${viewport.name}.png`), fullPage: true });
    }
    results.push({
      requestedPath: route.path,
      route: route.path,
      surface: route.name,
      viewport: viewport.name,
      status: response?.status() ?? null,
      finalPath: new URL(page.url()).pathname,
      reducedMotion: true,
      ...metrics,
      keyboardFocusVisible: focus.visible,
      focusedTag: focus.tag,
      pageErrors,
      consoleErrors: filteredConsoleErrors,
      unexpectedConsoleErrors,
      transitionEvents,
      failureScreenshot
    });
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("framenavigated", onNavigation);
    await context.close();
  }
}

const navigationContext = await createDeterministicContext(browser, { width: 390, height: 844 });
const navigationPage = await navigationContext.newPage();
const navigationPageErrors = [];
const navigationTransitions = [];
navigationPage.on("pageerror", (error) => navigationPageErrors.push({ message: sanitizedText(error.message), stack: sanitizedText(error.stack || error.message) }));
navigationPage.on("framenavigated", (frame) => { if (frame === navigationPage.mainFrame()) navigationTransitions.push(new URL(frame.url()).pathname); });
await navigationPage.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle", timeout: 30_000 });
const navigationResponse = await navigationPage.goto(`${baseUrl}/today-workout`, { waitUntil: "networkidle", timeout: 30_000 });
const redirectFinalPath = new URL(navigationPage.url()).pathname;
await navigationPage.goBack({ waitUntil: "networkidle", timeout: 30_000 });
const awayFinalPath = new URL(navigationPage.url()).pathname;
const navigationEvidence = {
  kind: "reused-page-redirect-regression",
  requestedPath: "/today-workout",
  finalPath: redirectFinalPath,
  awayFinalPath,
  status: navigationResponse?.status() ?? null,
  transitionEvents: navigationTransitions,
  pageErrors: navigationPageErrors,
  passed: navigationResponse?.status() === 200 && redirectFinalPath === "/my-workout/plans" && awayFinalPath === "/dashboard" && navigationPageErrors.length === 0
};
if (!navigationEvidence.passed) {
  navigationEvidence.failureScreenshot = "failure-today-workout-reused-navigation-390x844.png";
  await navigationPage.screenshot({ path: path.join(evidenceDir, navigationEvidence.failureScreenshot), fullPage: true });
}
await navigationContext.close();

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

const failures = results.filter((item) => item.status !== 200 || item.horizontalOverflowPx > 1 || item.unnamedInteractiveElements > 0 || item.pageErrors.length > 0 || item.unexpectedConsoleErrors.length > 0);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  mockAuthExpected: true,
  productionAcceptanceEvidence: false,
  viewports,
  routes: routes.map((item) => item.path),
  checks: { reducedMotion: true, keyboardFocus: true, screenReaderNames: true, touchTargetsMeasured: true, textZoomPercent: 200, zoomOverflowPx: zoomOverflow, longLocalizedTextLanguage: "ar", localizedOverflowPx: localizedOverflow },
  summary: { observations: results.length, navigationRegressions: 1, failures: failures.length + (navigationEvidence.passed ? 0 : 1), passed: failures.length === 0 && navigationEvidence.passed && zoomOverflow <= 1 && localizedOverflow <= 1 },
  failures,
  navigationEvidence,
  observations: results
};
await writeFile(path.join(evidenceDir, "rendered-qa-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Rendered QA: ${report.summary.observations} observations, ${report.summary.failures} failures, zoom overflow ${zoomOverflow}px.`);
if (!report.summary.passed) process.exitCode = 1;
