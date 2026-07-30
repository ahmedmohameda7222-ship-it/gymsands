import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  baseUrl,
  buildCommand,
  contract,
  dayRoute,
  headSha,
  mockAuthBuildValue,
  serverMode,
  startCommand
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

const outputDir = path.resolve(
  process.env.QA_AW7_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "active-workout-aw7")
);
await mkdir(outputDir, { recursive: true });

if (!headSha) {
  throw new Error("QA_HEAD_SHA is required for exact-head AW-7 rendered evidence.");
}
if (serverMode !== "production") {
  throw new Error(`AW-7 rendered QA requires production server mode, received ${serverMode}.`);
}

const scenarios = [
  {
    name: "01-mobile-en-minimized-active-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    action: "minimized-active"
  },
  {
    name: "02-mobile-en-minimized-rest-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    action: "minimized-rest"
  },
  {
    name: "03-mobile-ar-minimized-review-rtl-390x844",
    viewport: { width: 390, height: 844 },
    language: "ar",
    theme: "light",
    action: "rtl-paused-review"
  },
  {
    name: "04-mobile-en-full-review-incomplete-320x568",
    viewport: { width: 320, height: 568 },
    language: "en",
    theme: "light",
    action: "review-incomplete"
  },
  {
    name: "05-tablet-en-review-jump-768x1024",
    viewport: { width: 768, height: 1024 },
    language: "en",
    theme: "light",
    action: "review-jump"
  },
  {
    name: "06-desktop-en-minimized-1440x900",
    viewport: { width: 1440, height: 900 },
    language: "en",
    theme: "light",
    action: "minimized-desktop"
  },
  {
    name: "07-desktop-dark-en-full-review-1440x900",
    viewport: { width: 1440, height: 900 },
    language: "en",
    theme: "dark",
    action: "review-dark"
  },
  {
    name: "08-mobile-en-partial-confirmation-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    action: "partial-confirmation"
  },
  {
    name: "09-mobile-en-terminal-final-heat-390x844",
    viewport: { width: 390, height: 844 },
    language: "en",
    theme: "light",
    action: "terminal-mobile-heat"
  },
  {
    name: "10-desktop-en-terminal-isolation-1440x900",
    viewport: { width: 1440, height: 900 },
    language: "en",
    theme: "light",
    action: "terminal-desktop-isolation"
  }
];

function visible(page, selector) {
  return page.locator(`${selector}:visible`).first();
}

async function capture(page, screenshotPath) {
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

async function openSession(page) {
  const response = await page.goto(`${baseUrl}${dayRoute}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await visible(page, "[data-aw5-execution-shell]").waitFor({
    state: "visible",
    timeout: 20_000
  });
  return response;
}

async function minimize(page, expectedState) {
  await visible(page, "[data-workout-session-close]").click({ timeout: 10_000 });
  const bar = visible(page, "[data-active-workout-minimized-bar]");
  await bar.waitFor({ state: "visible", timeout: 20_000 });
  if (expectedState) {
    await page.waitForFunction(
      (state) => document.querySelector(
        `[data-active-workout-minimized-state="${state}"]`
      ),
      expectedState,
      { timeout: 10_000 }
    );
  }
}

async function enterReview(page) {
  const mobileFinish = page.locator("[data-aw5-finish-action]:visible");
  if (await mobileFinish.count()) {
    await mobileFinish.first().click({ timeout: 10_000 });
  } else {
    await page.getByRole("button", { name: "Finish", exact: true })
      .filter({ visible: true })
      .last()
      .click({ timeout: 10_000 });
  }
  await visible(page, "[data-aw7-review-surface]").waitFor({
    state: "visible",
    timeout: 15_000
  });
}

async function openPartialConfirmation(page) {
  await page.getByRole("button", { name: "Finish partial workout", exact: true })
    .click({ timeout: 10_000 });
  await visible(page, "[data-aw7-partial-confirmation]").waitFor({
    state: "visible",
    timeout: 10_000
  });
}

async function completePartialWorkout(page) {
  await openPartialConfirmation(page);
  await page.getByRole("button", { name: "Finish anyway", exact: true })
    .click({ timeout: 10_000 });
  await visible(page, "[data-aw7-completion-surface]").waitFor({
    state: "visible",
    timeout: 20_000
  });
  await visible(page, "#aw7-final-muscle-load").waitFor({
    state: "visible",
    timeout: 10_000
  });
}

async function completeFirstSet(page) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.getByRole("button", { name: "Skip rest", exact: true })
    .filter({ visible: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "Skip rest", exact: true })
    .filter({ visible: true })
    .click({ timeout: 10_000 });
  await page.locator("#active-set-reps").waitFor({ state: "visible", timeout: 10_000 });
}

async function prepareScenario(page, scenario) {
  const response = await openSession(page);
  const checks = {
    pausedStateSeen: null,
    reviewStateSeen: null
  };

  if (scenario.action === "minimized-active" || scenario.action === "minimized-desktop") {
    await minimize(page, "active");
  } else if (scenario.action === "minimized-rest") {
    await page.locator("#active-set-reps").fill("8");
    await page.locator("#active-set-weight").fill("80");
    await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
    await page.waitForFunction(
      () => document.querySelector("[data-aw5-execution-shell]")?.textContent?.includes("Rest"),
      undefined,
      { timeout: 10_000 }
    );
    await minimize(page, "rest");
  } else if (scenario.action === "rtl-paused-review") {
    await visible(page, "[data-aw5-pause-resume]").click({ timeout: 10_000 });
    await minimize(page, "paused");
    checks.pausedStateSeen = await visible(
      page,
      '[data-active-workout-minimized-state="paused"]'
    ).count() === 1;
    await visible(page, "[data-active-workout-minimized-bar] a").click({
      timeout: 10_000
    });
    await visible(page, "[data-aw5-execution-shell]").waitFor({
      state: "visible",
      timeout: 15_000
    });
    await visible(page, "[data-aw5-pause-resume]").click({ timeout: 10_000 });
    await enterReview(page);
    await minimize(page, "review");
    checks.reviewStateSeen = await visible(
      page,
      '[data-active-workout-minimized-state="review"]'
    ).count() === 1;
  } else if (
    scenario.action === "review-incomplete"
    || scenario.action === "review-jump"
    || scenario.action === "review-dark"
  ) {
    await enterReview(page);
  } else if (scenario.action === "partial-confirmation") {
    await enterReview(page);
    await openPartialConfirmation(page);
  } else if (
    scenario.action === "terminal-mobile-heat"
    || scenario.action === "terminal-desktop-isolation"
  ) {
    await completeFirstSet(page);
    await enterReview(page);
    await completePartialWorkout(page);
    if (scenario.action === "terminal-mobile-heat") {
      await visible(page, "#aw7-final-muscle-load").scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
    }
  }

  await page.waitForTimeout(150);
  return { response, checks };
}

async function measure(page) {
  return page.evaluate(({ userId }) => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0;
    };
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      return isVisible(element) ? element.getBoundingClientRect() : null;
    };
    const overlaps = (left, right) => Boolean(
      left && right
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );
    const controls = [...document.querySelectorAll(
      "button, a[href], input, textarea, select"
    )].filter(isVisible);
    const clippedControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight) return false;
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).length;
    const bar = document.querySelector("[data-active-workout-minimized-bar]");
    const barText = isVisible(bar) ? bar.textContent ?? "" : "";
    const forbidden = ["Finish", "Cancel", "Beenden", "Abbrechen", "إنهاء", "إلغاء"];
    const activeControllers = [...document.querySelectorAll(
      "[data-active-workout-controller]"
    )].filter(isVisible).length;
    const activeElement = document.activeElement;
    return {
      locale: document.documentElement.lang,
      direction: document.documentElement.dir
        || getComputedStyle(document.documentElement).direction,
      horizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) > innerWidth + 1,
      stickyMinimizedNavOverlap: (
        overlaps(bounds("[data-active-workout-minimized-bar]"), bounds("[data-mobile-floating-nav]"))
        || overlaps(bounds("[data-aw7-review-actions]"), bounds("[data-mobile-floating-nav]"))
      ),
      clippedControls,
      duplicateActiveControllerCount: Math.max(0, activeControllers - 1),
      activeControllerCount: activeControllers,
      visibleReviewCount: [...document.querySelectorAll("[data-aw7-review-surface]")]
        .filter(isVisible).length,
      visibleCompletionCount: [...document.querySelectorAll("[data-aw7-completion-surface]")]
        .filter(isVisible).length,
      minimizedBarCount: [...document.querySelectorAll("[data-active-workout-minimized-bar]")]
        .filter(isVisible).length,
      noFinishCancelInMinimizedBar: !forbidden.some((label) => barText.includes(label)),
      cacheCleared: localStorage.getItem(`plaivra.active-workout.${userId}`) === null,
      editorCount: [...document.querySelectorAll("[data-aw5-execution-shell]")]
        .filter(isVisible).length,
      focusTarget: activeElement instanceof HTMLElement
        ? activeElement.id
          || activeElement.getAttribute("data-aw7-completion-surface")
          || activeElement.textContent?.trim().slice(0, 80)
          || activeElement.tagName
        : null,
      frameworkOverlay: Boolean(
        document.querySelector("nextjs-portal")
        || [...document.querySelectorAll("body *")].some((element) =>
          /Unhandled Runtime Error|Build Error|Application error:/.test(
            element.textContent ?? ""
          )
        )
      )
    };
  }, { userId: contract.userId });
}

async function postCaptureFocusCheck(page, scenario) {
  if (scenario.action === "review-jump") {
    await page.getByRole("button", { name: "Jump to set", exact: true })
      .first()
      .click({ timeout: 10_000 });
    await visible(page, "[data-aw5-execution-shell]").waitFor({
      state: "visible",
      timeout: 10_000
    });
    await page.waitForFunction(
      () => document.activeElement?.id === "active-set-reps",
      undefined,
      { timeout: 10_000 }
    );
    return {
      expected: "active-set-reps",
      actual: await page.evaluate(() => document.activeElement?.id ?? null),
      passed: true
    };
  }
  if (scenario.action === "partial-confirmation") {
    const actual = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
    return {
      expected: "Finish anyway",
      actual,
      passed: actual === "Finish anyway"
    };
  }
  if (scenario.action.startsWith("terminal-")) {
    const actual = await page.evaluate(
      () => document.activeElement?.hasAttribute("data-aw7-completion-surface") ?? false
    );
    return {
      expected: "completion surface",
      actual: actual ? "completion surface" : null,
      passed: actual
    };
  }
  return { expected: null, actual: null, passed: null };
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: "reduce",
      colorScheme: scenario.theme
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const failedResponses = [];
    const requestHistory = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown"
      });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push({ url: response.url(), status: response.status() });
      }
    });
    await installAw5CorrectionFixture(
      context,
      {
        direct: false,
        language: scenario.language,
        theme: scenario.theme,
        delayCanonical: false,
        muscleScenario: "ready",
        includeGuide: true
      },
      requestHistory
    );

    const { response, checks } = await prepareScenario(page, scenario);
    await page.waitForFunction(
      (language) => document.documentElement.lang === language,
      scenario.language,
      { timeout: 10_000 }
    );
    const measured = await measure(page);
    const screenshotPath = path.join(outputDir, `${scenario.name}.png`);
    await capture(page, screenshotPath);
    const focus = await postCaptureFocusCheck(page, scenario);
    const terminal = scenario.action.startsWith("terminal-");
    const unexpectedFailedRequests = failedRequests.filter((request) => !(
      request.error === "net::ERR_ABORTED"
      && new URL(request.url).searchParams.has("_rsc")
    ));
    const failures = [];
    if (!response?.ok()) failures.push(`page response ${response?.status() ?? "missing"}`);
    if (measured.frameworkOverlay) failures.push("framework error overlay is visible");
    if (measured.horizontalOverflow) failures.push("horizontal overflow");
    if (measured.stickyMinimizedNavOverlap) failures.push("sticky/minimized/nav overlap");
    if (measured.clippedControls) failures.push(`${measured.clippedControls} clipped controls`);
    if (measured.duplicateActiveControllerCount) {
      failures.push(`${measured.duplicateActiveControllerCount} duplicate active controllers`);
    }
    if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
    if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);
    if (unexpectedFailedRequests.length) {
      failures.push(`${unexpectedFailedRequests.length} unexpected failed requests`);
    }
    if (failedResponses.length) failures.push(`${failedResponses.length} failed responses`);
    if (!measured.noFinishCancelInMinimizedBar) {
      failures.push("minimized bar exposes Finish or Cancel");
    }
    if (scenario.language === "ar" && measured.direction !== "rtl") {
      failures.push("Arabic direction is not RTL");
    }
    if (scenario.action === "rtl-paused-review" && (
      checks.pausedStateSeen !== true || checks.reviewStateSeen !== true
    )) failures.push("RTL paused/review minimized states were not both observed");
    if (scenario.action.startsWith("review-") && measured.visibleReviewCount !== 1) {
      failures.push(`visible review count is ${measured.visibleReviewCount}`);
    }
    if (scenario.action === "partial-confirmation" && focus.passed !== true) {
      failures.push(`partial confirmation focus target is ${focus.actual}`);
    }
    if (scenario.action === "review-jump" && focus.passed !== true) {
      failures.push(`jump focus target is ${focus.actual}`);
    }
    if (terminal && (
      measured.visibleCompletionCount !== 1
      || measured.editorCount !== 0
      || measured.minimizedBarCount !== 0
      || measured.cacheCleared !== true
      || focus.passed !== true
    )) failures.push("terminal isolation, cache cleanup, or focus proof failed");

    results.push({
      name: scenario.name,
      headSha,
      serverMode,
      viewport: scenario.viewport,
      locale: measured.locale,
      direction: measured.direction,
      scenario: scenario.action,
      screenshotPath,
      horizontalOverflow: measured.horizontalOverflow,
      stickyMinimizedNavOverlap: measured.stickyMinimizedNavOverlap,
      clippedControlCount: measured.clippedControls,
      duplicateActiveControllerCount: measured.duplicateActiveControllerCount,
      visibleReviewCount: measured.visibleReviewCount,
      visibleCompletionSurfaceCount: measured.visibleCompletionCount,
      consoleErrors,
      pageErrors,
      unexpectedFailedRequests: [...unexpectedFailedRequests, ...failedResponses],
      expectedAbortedRscRequestCount: failedRequests.length - unexpectedFailedRequests.length,
      focusTargetResult: focus,
      cacheClearedResult: terminal ? measured.cacheCleared : null,
      noMinimizedBarAfterCompletion: terminal ? measured.minimizedBarCount === 0 : null,
      noFinishCancelInMinimizedBar: measured.noFinishCancelInMinimizedBar,
      checks,
      failures
    });
    await context.close();
    console.log(
      failures.length
        ? `[AW7-QA] FAIL ${scenario.name}: ${failures.join(" | ")}`
        : `[AW7-QA] PASS ${scenario.name}`
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
const reportPath = path.join(outputDir, "aw7-layout-qa-results.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (report.failures.length) {
  console.error(`AW-7 layout QA failed:\n- ${report.failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`AW-7 layout QA passed with ${results.length} screenshots: ${reportPath}`);
}
