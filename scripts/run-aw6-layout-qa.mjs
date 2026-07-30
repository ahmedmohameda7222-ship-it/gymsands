import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  baseUrl,
  buildCommand,
  dayRoute,
  directRoute,
  headSha,
  mockAuthBuildValue,
  serverMode,
  startCommand
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

const outputDir = path.resolve(
  process.env.QA_AW6_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "active-workout-aw6")
);
await mkdir(outputDir, { recursive: true });

const scenarios = [
  {
    name: "01-mobile-en-active-mini-map-320x568",
    viewport: { width: 320, height: 568 },
    language: "en",
    theme: "light",
    route: dayRoute,
    muscleScenario: "ready",
    action: "active"
  },
  {
    name: "02-mobile-ar-rtl-muscle-load-390x844",
    viewport: { width: 390, height: 844 },
    language: "ar",
    theme: "light",
    route: dayRoute,
    muscleScenario: "ready",
    action: "muscle-load"
  },
  {
    name: "03-mobile-en-partial-muscle-load-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    route: dayRoute,
    muscleScenario: "partial",
    action: "muscle-load"
  },
  {
    name: "04-mobile-en-cached-refresh-error-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    route: dayRoute,
    muscleScenario: "cached-refresh-error",
    action: "cached-refresh-error"
  },
  {
    name: "05-tablet-en-current-set-768x1024",
    viewport: { width: 768, height: 1024 },
    language: "en",
    theme: "light",
    route: dayRoute,
    muscleScenario: "ready",
    includeGuide: false,
    action: "current-set"
  },
  {
    name: "06-desktop-en-light-rail-actions-1440x900",
    viewport: { width: 1440, height: 900 },
    language: "en",
    theme: "light",
    route: dayRoute,
    muscleScenario: "ready",
    action: "desktop"
  },
  {
    name: "07-desktop-en-dark-interactive-map-1440x900",
    viewport: { width: 1440, height: 900 },
    language: "en",
    theme: "dark",
    route: dayRoute,
    muscleScenario: "ready",
    action: "interactive-map"
  },
  {
    name: "08-mobile-en-direct-no-plan-actions-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    route: directRoute,
    muscleScenario: "ready",
    action: "direct-boundary"
  }
];

function visibleLocator(page, selector) {
  return page.locator(`${selector}:visible`).first();
}

async function waitFor(predicate, timeoutMs = 10_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for fixture state.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function captureScreenshot(page, screenshotPath) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.waitForTimeout(150);
    }
  }
  throw lastError;
}

async function openDetailsFrom(page, opener) {
  await opener.evaluate((element) => {
    element.setAttribute("data-aw6-focus-origin", "true");
  });
  await opener.click({ timeout: 10_000 });
  await page.locator("[data-active-set-details-dialog]").waitFor({
    state: "visible",
    timeout: 10_000
  });
}

async function closeDetailsAndCheckFocus(page, scenario) {
  const dialog = page.locator("[data-active-set-details-dialog]");
  if (scenario.action === "current-set") {
    await page.setViewportSize({ width: 1024, height: scenario.viewport.height });
  }
  const close = dialog.locator("button[aria-label][title]");
  if (await close.count() !== 1) {
    throw new Error("Expected exactly one Details close control.");
  }
  await close.click({ timeout: 10_000 });
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-aw6-focus-origin") === "true"
  );
}

async function runAction(session, scenario) {
  const { page, fixture } = session;
  if (scenario.action === "active" || scenario.action === "desktop") return {};

  if (scenario.action === "cached-refresh-error") {
    await page.locator("#active-set-reps").fill("8");
    await page.locator("#active-set-weight").fill("80");
    await visibleLocator(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
    await waitFor(() => fixture.muscleRequestCount() >= 2);
    const opener = visibleLocator(page, "[data-aw6-mini-heat-map]");
    await openDetailsFrom(page, opener);
    await page.locator("[data-active-set-details-dialog]")
      .getByText("Showing the last available result", { exact: false })
      .filter({ visible: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    return {
      requestedSection: await page.locator("[data-active-set-details-dialog]")
        .getAttribute("data-aw6-details-section"),
      cachedMapVisible: await page.locator(
        '[data-aw6-muscle-load-section][data-state="ready"]'
      ).count() === 1
    };
  }

  if (scenario.action === "current-set") {
    await page.setViewportSize({ width: 1024, height: scenario.viewport.height });
    await page.locator("[data-aw6-desktop-quick-actions]").waitFor({
      state: "visible",
      timeout: 10_000
    });
    const opener = page.locator("[data-aw6-desktop-quick-actions]")
      .getByRole("button", { name: "Set details", exact: true });
    await openDetailsFrom(page, opener);
    await page.setViewportSize(scenario.viewport);
    return {
      requestedSection: await page.locator("[data-active-set-details-dialog]")
        .getAttribute("data-aw6-details-section"),
      bodyViewCount: await page.locator(
        '[data-active-set-details-dialog] svg[viewBox="0 0 1024 1536"]'
      ).count()
    };
  }

  if (scenario.action === "direct-boundary") {
    const opener = visibleLocator(page, "[data-active-set-details-trigger]");
    await openDetailsFrom(page, opener);
    return {
      requestedSection: await page.locator("[data-active-set-details-dialog]")
        .getAttribute("data-aw6-details-section"),
      adjustTodayCount: await page.locator("[data-aw6-details-adjust-today]").count(),
      replacementButtonCount: await page.getByRole("button", { name: /replacement/i }).count()
    };
  }

  const opener = visibleLocator(page, "[data-aw6-mini-heat-map]");
  await openDetailsFrom(page, opener);
  if (scenario.action === "interactive-map") {
    const target = page.locator(
      '[data-active-set-details-dialog] [data-view="front"][data-canonical-id="quadriceps.rectus_femoris"][role="button"]'
    ).first();
    await target.scrollIntoViewIfNeeded();
    await target.press("Enter", { timeout: 10_000 });
    await page.locator("[data-active-set-details-dialog] [aria-live='polite']")
      .getByText("Quadriceps", { exact: false })
      .waitFor({ state: "visible", timeout: 10_000 });
  }
  return {
    requestedSection: await page.locator("[data-active-set-details-dialog]")
      .getAttribute("data-aw6-details-section"),
    adjustTodayCount: await page.locator("[data-aw6-details-adjust-today]").count()
  };
}

async function geometry(page, detailsOpen) {
  return page.evaluate(({ hasDetails }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0;
    };
    const rect = (element) => element?.getBoundingClientRect() ?? null;
    const overlaps = (left, right) => Boolean(
      left && right
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );
    const sticky = visible(document.querySelector("[data-aw5-sticky-actions]"))
      ? rect(document.querySelector("[data-aw5-sticky-actions]"))
      : null;
    const guarded = [
      document.querySelector("#active-set-reps"),
      document.querySelector("#active-set-weight"),
      document.querySelector("[data-aw5-set-path]"),
      document.querySelector("[data-aw6-mobile-quick-actions]")
    ].filter(visible).map(rect);
    const controls = [
      ...document.querySelectorAll(
        "[data-aw5-execution-shell] button, [data-aw5-execution-shell] input, [data-active-set-details-dialog] button, [data-active-set-details-dialog] input, [data-active-set-details-dialog] select, [data-active-set-details-dialog] textarea"
      )
    ].filter(visible);
    const clippedControls = controls.filter((element) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= innerHeight) return false;
      return bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.width < 1 || bounds.height < 1;
    }).length;
    return {
      horizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) > innerWidth + 1,
      stickyOverlap: hasDetails ? false : guarded.some((target) => overlaps(sticky, target)),
      clippedControls,
      frameworkOverlay: Boolean(
        document.querySelector("nextjs-portal")
        || [...document.querySelectorAll("body *")].some((element) =>
          /Unhandled Runtime Error|Build Error|Application error:/.test(element.textContent ?? "")
        )
      ),
      meaningfulContent: (document.querySelector("[data-aw5-execution-shell]")?.textContent?.trim().length ?? 0) > 20,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      locale: document.documentElement.lang
    };
  }, { hasDetails: detailsOpen });
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const scenario of scenarios) {
    const direct = scenario.route === directRoute;
    const context = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: "reduce",
      colorScheme: scenario.theme
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    const failedResponses = [];
    const requestHistory = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown"
      });
    });
    page.on("response", (response) => {
      if (
        response.status() >= 400
        && /\/muscle-analysis(?:\?|$)/.test(response.url())
      ) {
        failedResponses.push({ url: response.url(), status: response.status() });
      }
    });
    const fixture = await installAw5CorrectionFixture(
      context,
      {
        direct,
        language: scenario.language,
        theme: scenario.theme,
        delayCanonical: false,
        muscleScenario: scenario.muscleScenario,
        includeGuide: scenario.includeGuide ?? true
      },
      requestHistory
    );
    const response = await page.goto(`${baseUrl}${scenario.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });
    await page.locator("[data-aw5-execution-shell]").waitFor({
      state: "visible",
      timeout: 20_000
    });
    await page.waitForFunction(
      (language) => document.documentElement.lang === language,
      scenario.language,
      { timeout: 10_000 }
    );
    await page.locator("[data-aw6-mini-heat-map]:visible").waitFor({
      state: "visible",
      timeout: 10_000
    });
    await page.waitForTimeout(150);

    const session = { page, fixture };
    const checks = await runAction(session, scenario);
    const detailsOpen = await page.locator("[data-active-set-details-dialog]:visible").count() > 0;
    const measured = await geometry(page, detailsOpen);
    const screenshotPath = path.join(outputDir, `${scenario.name}.png`);
    await captureScreenshot(page, screenshotPath);
    const focusReturn = detailsOpen ? await closeDetailsAndCheckFocus(page, scenario) : null;
    const expectedFailedResponses = scenario.action === "cached-refresh-error" ? 1 : 0;
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !(
      scenario.action === "cached-refresh-error"
      && /failed to load resource/i.test(message)
      && /503/.test(message)
    ));
    const failures = [];
    if (!response?.ok()) failures.push(`page response ${response?.status() ?? "missing"}`);
    if (!measured.meaningfulContent) failures.push("active workout content is blank");
    if (measured.frameworkOverlay) failures.push("framework error overlay is visible");
    if (measured.horizontalOverflow) failures.push("horizontal overflow");
    if (measured.stickyOverlap) failures.push("sticky action overlap");
    if (measured.clippedControls) failures.push(`${measured.clippedControls} clipped controls`);
    if (unexpectedConsoleErrors.length) {
      failures.push(`${unexpectedConsoleErrors.length} unexpected console errors`);
    }
    if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);
    if (requestFailures.length) failures.push(`${requestFailures.length} failed requests`);
    if (failedResponses.length !== expectedFailedResponses) {
      failures.push(
        `${failedResponses.length} relevant failed responses, expected ${expectedFailedResponses}`
      );
    }
    if (detailsOpen && focusReturn !== true) failures.push("focus did not return to opener");
    if (scenario.language === "ar" && measured.direction !== "rtl") failures.push("Arabic direction is not RTL");
    if (scenario.action === "muscle-load" && checks.requestedSection !== "muscle-load") {
      failures.push(`Details opened at ${checks.requestedSection}`);
    }
    if (scenario.action === "current-set" && checks.requestedSection !== "current-set") {
      failures.push(`Details opened at ${checks.requestedSection}`);
    }
    if (scenario.action === "current-set" && checks.bodyViewCount !== 2) {
      failures.push(`tablet body view count is ${checks.bodyViewCount}`);
    }
    if (scenario.action === "cached-refresh-error" && checks.cachedMapVisible !== true) {
      failures.push("cached map is not retained");
    }
    if (scenario.action === "direct-boundary" && (
      checks.adjustTodayCount !== 0 || checks.replacementButtonCount !== 0
    )) failures.push("direct session exposes plan-day replacement actions");

    results.push({
      name: scenario.name,
      headSha,
      serverMode,
      buildCommand,
      startCommand,
      mockAuthBuildValue,
      viewport: scenario.viewport,
      locale: measured.locale,
      direction: measured.direction,
      scenario: scenario.action,
      route: scenario.route,
      screenshotPath,
      horizontalOverflow: measured.horizontalOverflow,
      stickyOverlap: measured.stickyOverlap,
      clippedControlCount: measured.clippedControls,
      consoleErrorCount: consoleErrors.length,
      unexpectedConsoleErrorCount: unexpectedConsoleErrors.length,
      consoleErrors,
      pageErrorCount: pageErrors.length,
      failedRequestCount: requestFailures.length,
      relevantFailedResponseCount: failedResponses.length,
      focusReturn,
      checks,
      failures
    });
    await context.close();
    console.log(
      failures.length
        ? `[AW6-QA] FAIL ${scenario.name}: ${failures.join(" | ")}`
        : `[AW6-QA] PASS ${scenario.name}`
    );
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  headSha,
  serverMode,
  buildCommand,
  startCommand,
  mockAuthBuildValue,
  baseUrl,
  screenshotCount: results.length,
  results,
  failures: results.flatMap((result) =>
    result.failures.map((failure) => `${result.name}: ${failure}`)
  )
};
const reportPath = path.join(outputDir, "aw6-layout-qa-results.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (report.failures.length) {
  console.error(`AW-6 layout QA failed:\n- ${report.failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`AW-6 layout QA passed with ${results.length} screenshots: ${reportPath}`);
}
