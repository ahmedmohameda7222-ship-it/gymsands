import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  baseUrl,
  contract,
  directRoute,
  headSha,
  serverMode,
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

if (!headSha) throw new Error("QA_HEAD_SHA is required for final pre-merge Active Workout evidence.");
if (serverMode !== "production") throw new Error(`Final pre-merge Active Workout QA requires production mode, received ${serverMode}.`);

const rootEvidenceDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "active-workout-aw10"),
);
const evidenceDir = path.join(rootEvidenceDir, "final-premerge");
await mkdir(evidenceDir, { recursive: true });

const results = [];
const OFFLINE_KEY = "plaivra.qa.final-premerge.offline";
const OTHER_DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function visible(page, selector) {
  return page.locator(`${selector}:visible`).first();
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body ? document.body.scrollWidth - document.body.clientWidth : 0,
  ));
  check(overflow <= 1, `horizontal overflow ${overflow}px`);
}

async function installConnectivityContract(context) {
  await context.addInitScript(({ offlineKey }) => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get() {
        try {
          return localStorage.getItem(offlineKey) !== "true";
        } catch {
          return true;
        }
      }
    });
  }, { offlineKey: OFFLINE_KEY });
}

async function setOffline(page, offline, dispatch = true) {
  await page.evaluate(({ key, value, fire }) => {
    localStorage.setItem(key, value ? "true" : "false");
    if (fire) window.dispatchEvent(new Event(value ? "offline" : "online"));
  }, { key: OFFLINE_KEY, value: offline, fire: dispatch });
}

async function waitForActiveShell(page, { allowTabConflict = false } = {}) {
  await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
  if (!allowTabConflict) {
    await page.waitForFunction(() => {
      const conflict = document.querySelector("[data-aw9-tab-conflict]");
      return !(conflict instanceof HTMLElement) || conflict.getClientRects().length === 0;
    }, undefined, { timeout: 15_000 });
  }
}

async function completeCurrentSet(page) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest",
  undefined, { timeout: 12_000 });
}

async function waitForSyncState(page, state) {
  await page.waitForFunction((next) =>
    document.querySelector(`[data-aw9-sync-state="${next}"]`),
  state, { timeout: 20_000 });
}

async function openDatabase(page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    await new Promise((resolve, reject) => {
      request.onsuccess = () => { request.result.close(); resolve(true); };
      request.onerror = () => reject(request.error);
    });
  });
}

async function mutateCachedController(page, controllerDeviceId) {
  await openDatabase(page);
  await page.evaluate(async (nextController) => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("session_snapshots", "readwrite");
    const store = transaction.objectStore("session_snapshots");
    const allRequest = store.getAll();
    const all = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    const cache = all[0];
    if (!cache?.executionState) throw new Error("No durable Active Workout session cache exists.");
    store.put({
      ...cache,
      controllerDeviceId: nextController,
      executionState: {
        ...cache.executionState,
        controller_device_id: nextController,
        revision: Math.max(1, cache.executionState.revision ?? 0)
      },
      updatedAt: new Date().toISOString()
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, controllerDeviceId);
}

async function reliabilityGeometry(page) {
  return page.evaluate(() => {
    const isVisible = (element) => element instanceof HTMLElement
      && getComputedStyle(element).display !== "none"
      && getComputedStyle(element).visibility !== "hidden"
      && element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0;
    const rect = (selector) => {
      const element = [...document.querySelectorAll(selector)].find(isVisible);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
    };
    const overlaps = (a, b) => Boolean(a && b
      && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const blocker = rect("[data-aw9-reliability-blocking]");
    const primary = rect("[data-aw5-primary-action]");
    return {
      blockerCount: [...document.querySelectorAll("[data-aw9-reliability-blocking]")].filter(isVisible).length,
      standaloneSyncCount: [...document.querySelectorAll("[data-aw9-reliability-sync-status]")].filter(isVisible).length,
      blockerPrimaryOverlap: overlaps(blocker, primary),
      blockerWithinViewport: Boolean(blocker && blocker.top >= -1 && blocker.bottom <= innerHeight + 1),
      blockerState: document.querySelector("[data-aw9-reliability-blocking]")?.getAttribute("data-aw9-reliability-blocking") ?? null,
      substatusVisible: [...document.querySelectorAll("[data-aw9-reliability-sync-substatus]")].some(isVisible),
    };
  });
}

async function runLoadingScenario(browser, { name, viewport, language, theme = "light", reducedMotion = "reduce" }) {
  const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion });
  const page = await context.newPage();
  const result = { name, failures: [], screenshot: null };
  results.push(result);
  try {
    await installAw5CorrectionFixture(context, {
      direct: true,
      language,
      theme,
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true,
    }, []);
    await context.route(/\/api\/activity-catalog\/library-domains\/strength\/activities\/[^/?]+(?:\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.fallback();
    });
    const response = await page.goto(`${baseUrl}${directRoute}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    check(response && response.status() < 400, `entry navigation failed: ${response?.status() ?? "no response"}`);
    const loading = visible(page, "[data-aw-entry-loading]");
    await loading.waitFor({ state: "visible", timeout: 5_000 });
    check(await loading.getAttribute("aria-busy") === "true", "entry loading state is not announced as busy");
    check(await page.locator("[data-aw-entry-session-placeholder]:visible").count() === 1, "session identity loading geometry is missing");
    check(await page.locator("[data-aw-entry-primary-placeholder]:visible").count() === 1, "primary action loading geometry is missing");
    check(!(await loading.innerText()).includes(contract.activeFirstExerciseName), "loading state invented a workout/exercise identity");
    const direction = await loading.getAttribute("dir");
    check(direction === (language === "ar" ? "rtl" : "ltr"), `${language} loading direction is ${direction}`);
    if (reducedMotion === "reduce") {
      const animationName = await loading.evaluate((element) => getComputedStyle(element).animationName);
      check(animationName === "none", `reduced-motion loading still animates (${animationName})`);
    }
    await assertNoHorizontalOverflow(page);
    const screenshot = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    result.screenshot = path.relative(rootEvidenceDir, screenshot);
    await waitForActiveShell(page);
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

async function runOptionalVideoFailure(browser) {
  const name = "optional-video-failure-direct-390x844";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  const result = { name, failures: [], screenshot: null };
  results.push(result);
  try {
    await installAw5CorrectionFixture(context, {
      direct: true,
      language: "en",
      theme: "light",
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true,
    }, []);
    let videoFailures = 0;
    await context.route(/\/rest\/v1\/user_exercise_videos(?:\?.*)?$/, async (route) => {
      videoFailures += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "optional media unavailable" }) });
    });
    const response = await page.goto(`${baseUrl}${directRoute}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    check(response && response.status() < 400, `direct navigation failed: ${response?.status() ?? "no response"}`);
    await waitForActiveShell(page);
    check(videoFailures >= 1, "optional custom-video failure fixture was not exercised");
    check(await page.locator("[data-aw-entry-error]:visible").count() === 0, "optional video failure rendered a blocking entry error");
    check(await visible(page, "[data-aw5-execution-shell]").count() === 1, "optional video failure removed the core session");
    await assertNoHorizontalOverflow(page);
    const screenshot = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    result.screenshot = path.relative(rootEvidenceDir, screenshot);
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

async function runTabPendingCombination(browser) {
  const name = "reliability-tab-conflict-pending-sync-320x568";
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, colorScheme: "light", reducedMotion: "reduce" });
  await installConnectivityContract(context);
  const page = await context.newPage();
  const result = { name, failures: [], screenshot: null };
  results.push(result);
  try {
    await installAw5CorrectionFixture(context, {
      direct: false,
      language: "en",
      theme: "light",
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true,
    }, []);
    await page.goto(`${baseUrl}/workouts/session/day/${contract.activeDayId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForActiveShell(page);
    await setOffline(page, true);
    await completeCurrentSet(page);
    await waitForSyncState(page, "offline_saved");

    const second = await context.newPage();
    await second.goto(`${baseUrl}/workouts/session/day/${contract.activeDayId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForActiveShell(second, { allowTabConflict: true });
    await visible(second, "[data-aw9-tab-conflict]").waitFor({ state: "visible", timeout: 15_000 });
    const geometry = await reliabilityGeometry(second);
    check(geometry.blockerCount === 1, `same-tab + pending rendered ${geometry.blockerCount} blocking surfaces`);
    check(geometry.blockerState === "tab_conflict", `same-tab + pending priority became ${geometry.blockerState}`);
    check(geometry.standaloneSyncCount === 0, "same-tab + pending stacked a separate sync card");
    check(geometry.substatusVisible, "pending sync status was not subordinated inside the tab conflict");
    check(!geometry.blockerPrimaryOverlap, "same-tab conflict overlaps the sticky execution CTA");
    check(geometry.blockerWithinViewport, "same-tab conflict essential actions are outside the viewport");
    check(await second.getByRole("button", { name: /continue in this tab/i }).count() === 1, "Continue in this tab action is missing");
    check(await second.locator("#active-set-reps").isDisabled(), "non-controller tab still allows execution mutation");
    await assertNoHorizontalOverflow(second);
    const screenshot = path.join(evidenceDir, `${name}.png`);
    await second.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    result.screenshot = path.relative(rootEvidenceDir, screenshot);
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

async function runDevicePendingCombination(browser) {
  const name = "reliability-device-conflict-pending-sync-ar-390x844";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", reducedMotion: "reduce" });
  await installConnectivityContract(context);
  const page = await context.newPage();
  const result = { name, failures: [], screenshot: null };
  results.push(result);
  try {
    await installAw5CorrectionFixture(context, {
      direct: false,
      language: "ar",
      theme: "dark",
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true,
    }, []);
    await page.goto(`${baseUrl}/workouts/session/day/${contract.activeDayId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForActiveShell(page);
    await setOffline(page, true);
    await completeCurrentSet(page);
    await waitForSyncState(page, "offline_saved");
    await mutateCachedController(page, OTHER_DEVICE_ID);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForActiveShell(page, { allowTabConflict: true });
    await visible(page, "[data-aw9-device-conflict]").waitFor({ state: "visible", timeout: 15_000 });
    const geometry = await reliabilityGeometry(page);
    check(geometry.blockerCount === 1, `device + pending rendered ${geometry.blockerCount} blocking surfaces`);
    check(geometry.blockerState === "device_conflict", `device + pending priority became ${geometry.blockerState}`);
    check(geometry.standaloneSyncCount === 0, "device + pending stacked a separate sync card");
    check(geometry.substatusVisible, "pending sync status was not subordinated inside the device conflict");
    check(!geometry.blockerPrimaryOverlap, "device conflict overlaps the sticky execution CTA");
    check(geometry.blockerWithinViewport, "device conflict essential actions are outside the viewport");
    check(await page.getByRole("button", { name: /take over|استمرار|متابعة|السيطرة|تول/i }).count() >= 1, "device takeover action is missing");
    check(await page.locator("#active-set-reps").isDisabled(), "non-controller device still allows execution mutation");
    check((await page.locator("html").getAttribute("dir")) === "rtl", "Arabic device-conflict presentation is not RTL");
    await assertNoHorizontalOverflow(page);
    const screenshot = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    result.screenshot = path.relative(rootEvidenceDir, screenshot);
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await runLoadingScenario(browser, { name: "entry-loading-en-320x568-reduced-motion", viewport: { width: 320, height: 568 }, language: "en" });
  await runLoadingScenario(browser, { name: "entry-loading-ar-rtl-390x844", viewport: { width: 390, height: 844 }, language: "ar" });
  await runLoadingScenario(browser, { name: "entry-loading-de-desktop-1440x900", viewport: { width: 1440, height: 900 }, language: "de" });
  await runOptionalVideoFailure(browser);
  await runTabPendingCombination(browser);
  await runDevicePendingCombination(browser);
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => result.failures.map((failure) => `${result.name}: ${failure}`));
const report = {
  schemaVersion: 1,
  authority: "active-workout-pr144-final-premerge-corrections",
  headSha,
  serverMode,
  scenarioCount: results.length,
  results,
  failures,
};
await writeFile(path.join(evidenceDir, "active-workout-final-premerge-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (failures.length) throw new Error(`Final pre-merge Active Workout rendered authority failed:\n${failures.join("\n")}`);
console.log(`Final pre-merge Active Workout rendered authority passed ${results.length} scenarios at ${headSha}.`);
