import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  baseUrl,
  buildCommand,
  contract,
  dayRoute,
  directRoute,
  headSha,
  mockAuthBuildValue,
  serverMode,
  startCommand
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

const outputDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "ci-reports", "active-workout-aw10-evidence")
);
await mkdir(outputDir, { recursive: true });

if (!headSha) throw new Error("QA_HEAD_SHA is required for exact-head AW-10 evidence.");
if (serverMode !== "production") {
  throw new Error(`AW-10 requires production server mode, received ${serverMode}.`);
}

const OFFLINE_KEY = "plaivra.qa.aw10.offline";
const OTHER_DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scenarios = [
  ["01-plan-mobile-en-light-320x568", 320, 568, "en", "light", "baseline", false],
  ["02-plan-mobile-de-light-390x844", 390, 844, "de", "light", "baseline", false],
  ["03-plan-mobile-ar-rtl-390x844", 390, 844, "ar", "light", "baseline", false],
  ["04-plan-tablet-en-light-768x1024", 768, 1024, "en", "light", "baseline", false],
  ["05-plan-desktop-en-light-1440x900", 1440, 900, "en", "light", "baseline", false],
  ["06-plan-desktop-en-dark-1440x900", 1440, 900, "en", "dark", "baseline", false],
  ["07-direct-mobile-en-light-390x844", 390, 844, "en", "light", "baseline", true],
  ["08-direct-desktop-en-light-1440x900", 1440, 900, "en", "light", "baseline", true],
  ["09-details-mobile-en-390x844", 390, 844, "en", "light", "details", false],
  ["10-details-desktop-dark-en-1440x900", 1440, 900, "en", "dark", "details", false],
  ["11-paused-mobile-en-390x844", 390, 844, "en", "light", "paused", false],
  ["12-rest-mobile-en-390x844", 390, 844, "en", "light", "rest", false],
  ["13-rest-desktop-de-1440x900", 1440, 900, "de", "light", "rest", false],
  ["14-review-mobile-en-320x568", 320, 568, "en", "light", "review", false],
  ["15-review-tablet-en-768x1024", 768, 1024, "en", "light", "review", false],
  ["16-completion-metrics-mobile-en-390x844", 390, 844, "en", "light", "completion", false],
  ["17-completion-metrics-desktop-dark-en-1440x900", 1440, 900, "en", "dark", "completion", false],
  ["18-offline-save-mobile-en-390x844", 390, 844, "en", "light", "offline-save", false],
  ["19-offline-save-mobile-ar-rtl-390x844", 390, 844, "ar", "light", "offline-save", false],
  ["20-offline-refresh-restore-mobile-en-390x844", 390, 844, "en", "light", "offline-refresh", false],
  ["21-reconnect-flush-mobile-en-390x844", 390, 844, "en", "light", "reconnect", false],
  ["22-terminal-pending-mobile-en-390x844", 390, 844, "en", "light", "terminal-pending", false],
  ["23-server-terminal-wins-desktop-en-1440x900", 1440, 900, "en", "light", "server-terminal", false],
  ["24-same-tab-second-readonly-mobile-en-390x844", 390, 844, "en", "light", "tab-readonly", false],
  ["25-same-tab-explicit-continue-mobile-en-390x844", 390, 844, "en", "light", "tab-continue", false],
  ["26-same-tab-second-readonly-desktop-en-1440x900", 1440, 900, "en", "light", "tab-readonly", false],
  ["27-device-conflict-readonly-mobile-en-390x844", 390, 844, "en", "light", "device-conflict", false],
  ["28-takeover-confirmation-mobile-en-390x844", 390, 844, "en", "light", "takeover-confirmation", false],
  ["29-data-conflict-keep-server-mobile-en-390x844", 390, 844, "en", "light", "conflict-server", false],
  ["30-data-conflict-use-local-desktop-en-1440x900", 1440, 900, "en", "light", "conflict-local", false]
].map(([name, width, height, language, theme, action, direct]) => ({
  name,
  viewport: { width, height },
  language,
  theme,
  action,
  direct
}));

function visible(page, selector) {
  return page.locator(`${selector}:visible`).first();
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

async function waitForLeadership(page) {
  await page.waitForFunction(() => {
    const conflict = document.querySelector("[data-aw9-tab-conflict]");
    const visibleConflict = conflict instanceof HTMLElement
      && conflict.getClientRects().length > 0;
    return !visibleConflict;
  }, undefined, { timeout: 15_000 });
}

async function openSession(page, direct = false, { waitForLeader = true } = {}) {
  const response = await page.goto(`${baseUrl}${direct ? directRoute : dayRoute}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await visible(page, "[data-aw5-execution-shell]").waitFor({
    state: "visible",
    timeout: 20_000
  });
  if (waitForLeader) await waitForLeadership(page);
  return response;
}

async function completeCurrentSet(page, { skipRest = true } = {}) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")
      ?.getAttribute("data-aw5-session-state") === "rest",
  undefined, { timeout: 12_000 });
  if (skipRest) {
    await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.querySelector("[data-aw5-execution-shell]")
        ?.getAttribute("data-aw5-session-state") !== "rest",
    undefined, { timeout: 12_000 });
  }
}

async function openSessionMenu(page) {
  const trigger = visible(page, "[data-aw10-session-menu] > summary");
  await trigger.click({ timeout: 10_000 });
  await page.waitForFunction(() => {
    const menu = document.querySelector("[data-aw10-session-menu]");
    return menu instanceof HTMLDetailsElement && menu.open;
  }, undefined, { timeout: 5_000 });
  return visible(page, "[data-aw10-session-menu]");
}

async function openReview(page) {
  const menu = await openSessionMenu(page);
  const buttons = menu.locator("button:visible");
  if (await buttons.count() < 2) throw new Error("Session menu does not expose Finish Workout.");
  await buttons.nth(1).click({ timeout: 10_000 });
  await visible(page, "[data-aw7-review-surface]").waitFor({
    state: "visible",
    timeout: 15_000
  });
}

async function finishPartial(page) {
  await page.getByRole("button", { name: "Finish partial workout", exact: true })
    .click({ timeout: 10_000 });
  await visible(page, "[data-aw7-partial-confirmation]").waitFor({
    state: "visible",
    timeout: 10_000
  });
  await page.getByRole("button", { name: "Finish anyway", exact: true })
    .click({ timeout: 10_000 });
}

async function completePartial(page) {
  await completeCurrentSet(page);
  await openReview(page);
  await finishPartial(page);
  await visible(page, "[data-aw7-completion-surface]").waitFor({
    state: "visible",
    timeout: 20_000
  });
  await visible(page, "[data-aw10-terminal-completion]").waitFor({
    state: "visible",
    timeout: 10_000
  });
}

async function waitForSyncState(page, state) {
  await page.waitForFunction((next) =>
    document.querySelector(`[data-aw9-sync-state="${next}"]`),
  state, { timeout: 20_000 });
}

async function waitForOnlineSynced(page) {
  await page.waitForFunction(() =>
    !document.querySelector("[data-aw9-sync-state]"),
  undefined, { timeout: 20_000 });
}

async function openDatabase(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 1);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("session_snapshots")) {
          const sessions = database.createObjectStore("session_snapshots", { keyPath: "key" });
          sessions.createIndex("by_user", "userId");
          sessions.createIndex("by_expiry", "expiresAt");
        }
        if (!database.objectStoreNames.contains("operations")) {
          const operations = database.createObjectStore("operations", { keyPath: "id" });
          operations.createIndex("by_session_sequence", ["userId", "workoutSessionId", "sequence"], { unique: true });
          operations.createIndex("by_user", "userId");
          operations.createIndex("by_state", "state");
        }
      };
    });
  });
}

async function operationCount(page) {
  await openDatabase(page);
  return page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 1);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("operations", "readonly");
    const allRequest = transaction.objectStore("operations").getAll();
    const operations = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    database.close();
    return operations.filter((operation) =>
      operation.state !== "applied" && operation.state !== "discarded"
    ).length;
  });
}

async function waitForNoPendingOperations(page, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let stableZeroObservations = 0;
  while (Date.now() < deadline) {
    const count = await operationCount(page);
    stableZeroObservations = count === 0 ? stableZeroObservations + 1 : 0;
    if (stableZeroObservations >= 3) return;
    await page.waitForTimeout(100);
  }
  throw new Error("Durable operations did not reach a stable resolved state.");
}

async function mutateFirstOperation(page, patch) {
  await openDatabase(page);
  return page.evaluate(async (nextPatch) => {
    const request = indexedDB.open("plaivra-active-workout-v1", 1);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("operations", "readwrite");
    const store = transaction.objectStore("operations");
    const allRequest = store.getAll();
    const all = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    const first = all.sort((a, b) => a.sequence - b.sequence)[0];
    if (!first) throw new Error("No AW-10 pending operation exists.");
    store.put({ ...first, ...nextPatch, updatedAt: new Date().toISOString() });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return first.id;
  }, patch);
}

async function mutateCachedController(page, controllerDeviceId) {
  await openDatabase(page);
  return page.evaluate(async (nextController) => {
    const request = indexedDB.open("plaivra-active-workout-v1", 1);
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
    if (!cache?.executionState) throw new Error("No AW-10 durable session cache exists.");
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
    return cache.key;
  }, controllerDeviceId);
}

async function capture(page, target) {
  await page.screenshot({ path: target, fullPage: false });
}

async function measure(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden"
        && rect.width > 0 && rect.height > 0;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!isVisible(element)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
    };
    const overlaps = (a, b) => Boolean(a && b
      && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const controls = [...document.querySelectorAll("button,a[href],input,textarea,select")]
      .filter(isVisible);
    const clippedControls = controls.filter((element) => {
      const value = element.getBoundingClientRect();
      return value.bottom > 0 && value.top < innerHeight
        && (value.left < -1 || value.right > innerWidth + 1);
    }).length;
    const overlayText = [...document.querySelectorAll("body *")]
      .some((element) => /Unhandled Runtime Error|Build Error|Application error:/.test(element.textContent ?? ""));
    const primary = document.querySelector("[data-aw5-primary-action]");
    const reps = document.querySelector("#active-set-reps");
    const weight = document.querySelector("#active-set-weight");
    return {
      locale: document.documentElement.lang,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      horizontalOverflowPx: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      clippedControls,
      frameworkOverlay: Boolean(document.querySelector("nextjs-portal") || overlayText),
      controllerCount: document.querySelectorAll("[data-active-workout-controller]").length,
      shellCount: [...document.querySelectorAll("[data-aw5-execution-shell]")].filter(isVisible).length,
      shellState: document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") ?? null,
      reviewCount: [...document.querySelectorAll("[data-aw7-review-surface]")].filter(isVisible).length,
      completionCount: [...document.querySelectorAll("[data-aw7-completion-surface]")].filter(isVisible).length,
      performanceCount: [...document.querySelectorAll("[data-aw10-terminal-completion]")].filter(isVisible).length,
      syncState: document.querySelector("[data-aw9-sync-state]")?.getAttribute("data-aw9-sync-state") ?? null,
      tabConflictCount: [...document.querySelectorAll("[data-aw9-tab-conflict]")].filter(isVisible).length,
      deviceConflictCount: [...document.querySelectorAll("[data-aw9-device-conflict]")].filter(isVisible).length,
      takeoverConfirmationCount: [...document.querySelectorAll("[data-aw9-takeover-confirmation]")].filter(isVisible).length,
      dataConflictActionCount: [...document.querySelectorAll("[data-aw9-sync-state=\"data_conflict\"] button")].filter(isVisible).length,
      primaryDisabled: primary instanceof HTMLButtonElement ? primary.disabled : null,
      repsDisabled: reps instanceof HTMLInputElement ? reps.disabled : null,
      weightDisabled: weight instanceof HTMLInputElement ? weight.disabled : null,
      navOverlap: overlaps(rect("[data-aw9-sync-state]"), rect("[data-mobile-floating-nav]"))
        || overlaps(rect("[data-aw9-tab-conflict]"), rect("[data-mobile-floating-nav]"))
        || overlaps(rect("[data-aw9-device-conflict]"), rect("[data-mobile-floating-nav]")),
      activeElement: document.activeElement instanceof HTMLElement
        ? document.activeElement.id || document.activeElement.textContent?.trim().slice(0, 80) || document.activeElement.tagName
        : null
    };
  });
}

function baselineFailures(scenario, measured, consoleErrors, pageErrors, failedRequests, failedResponses) {
  const failures = [];
  if (measured.frameworkOverlay) failures.push("framework error overlay visible");
  if (measured.horizontalOverflowPx > 1) failures.push(`horizontal overflow ${measured.horizontalOverflowPx}px`);
  if (measured.clippedControls) failures.push(`${measured.clippedControls} clipped controls`);
  if (measured.controllerCount !== 1) failures.push(`active controller count ${measured.controllerCount}`);
  if (measured.navOverlap) failures.push("AW-9 notice overlaps mobile navigation");
  if (scenario.language === "ar" && measured.direction !== "rtl") failures.push("Arabic direction is not RTL");
  if (scenario.language !== "ar" && measured.direction !== "ltr") failures.push(`${scenario.language} direction is not LTR`);
  if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);
  const unexpectedRequests = failedRequests.filter((item) => !(
    item.error === "net::ERR_ABORTED" && new URL(item.url).searchParams.has("_rsc")
  ));
  if (unexpectedRequests.length) failures.push(`${unexpectedRequests.length} unexpected failed requests`);
  if (failedResponses.length) failures.push(`${failedResponses.length} failed responses`);
  return { failures, unexpectedRequests };
}

async function prepareAction({ scenario, context, page, fixture, checks }) {
  if (scenario.action === "baseline") return page;
  if (scenario.action === "details") {
    await visible(page, "[data-active-set-details-trigger]").click({ timeout: 10_000 });
    await page.locator('[role="dialog"]:visible').first().waitFor({ state: "visible", timeout: 10_000 });
    checks.detailsVisible = true;
    return page;
  }
  if (scenario.action === "paused") {
    const menu = await openSessionMenu(page);
    const buttons = menu.locator("button:visible");
    if (!await buttons.count()) throw new Error("Session menu does not expose Pause Workout.");
    await buttons.first().click({ timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")
      ?.getAttribute("data-aw5-session-state") === "paused", undefined, { timeout: 10_000 });
    checks.paused = true;
    return page;
  }
  if (scenario.action === "rest") {
    await completeCurrentSet(page, { skipRest: false });
    checks.rest = true;
    return page;
  }
  if (scenario.action === "review") {
    await openReview(page);
    checks.review = true;
    return page;
  }
  if (scenario.action === "completion") {
    await completePartial(page);
    checks.performance = true;
    return page;
  }
  if (scenario.action.startsWith("offline-") || scenario.action === "reconnect") {
    await setOffline(page, true);
    await page.waitForTimeout(50);
    await completeCurrentSet(page, { skipRest: false });
    await waitForSyncState(page, "offline_saved");
    checks.offlineSaved = true;
    checks.pendingBefore = await operationCount(page);
    if (scenario.action === "offline-refresh") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
      await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
      await waitForSyncState(page, "offline_saved");
      checks.restoredAfterRefresh = true;
    }
    if (scenario.action === "reconnect") {
      await setOffline(page, false);
      await waitForOnlineSynced(page);
      checks.pendingAfter = await operationCount(page);
      checks.reconnected = true;
    }
    return page;
  }
  if (scenario.action === "terminal-pending") {
    await completeCurrentSet(page);
    await openReview(page);
    await setOffline(page, true);
    await finishPartial(page);
    await waitForSyncState(page, "terminal_pending");
    checks.terminalPending = true;
    checks.pendingBefore = await operationCount(page);
    return page;
  }
  if (scenario.action === "server-terminal") {
    await setOffline(page, true);
    await completeCurrentSet(page, { skipRest: false });
    await waitForSyncState(page, "offline_saved");
    checks.pendingBefore = await operationCount(page);
    fixture.setServerRootStatus("completed");
    await setOffline(page, false);
    await waitForNoPendingOperations(page);
    checks.pendingAfter = await operationCount(page);
    checks.serverTerminalWins = checks.pendingAfter === 0;
    return page;
  }
  if (scenario.action === "tab-readonly" || scenario.action === "tab-continue") {
    const second = await context.newPage();
    await openSession(second, scenario.direct, { waitForLeader: false });
    await visible(second, "[data-aw9-tab-conflict]").waitFor({ state: "visible", timeout: 15_000 });
    checks.secondTabReadOnly = await second.locator("#active-set-reps").isDisabled();
    if (scenario.action === "tab-continue") {
      await second.locator("[data-aw9-tab-conflict] button:visible").click({ timeout: 10_000 });
      await visible(second, "[data-aw9-tab-conflict]").waitFor({ state: "hidden", timeout: 10_000 });
      await visible(page, "[data-aw9-tab-conflict]").waitFor({ state: "visible", timeout: 10_000 });
      checks.takeoverMovedLeadership = true;
    }
    return second;
  }
  if (scenario.action === "device-conflict" || scenario.action === "takeover-confirmation") {
    await page.waitForTimeout(250);
    await mutateCachedController(page, OTHER_DEVICE_ID);
    await setOffline(page, true, false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
    await visible(page, "[data-aw9-device-conflict]").waitFor({ state: "visible", timeout: 15_000 });
    checks.deviceConflict = true;
    checks.oldDeviceReadOnly = await page.locator("#active-set-reps").isDisabled();
    const takeover = page.locator("[data-aw9-device-conflict] button:visible").nth(1);
    checks.takeoverDisabledOffline = await takeover.isDisabled();
    if (scenario.action === "takeover-confirmation") {
      await setOffline(page, false, false);
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll("[data-aw9-device-conflict] button");
        const takeoverButton = buttons.item(1);
        return takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled;
      }, undefined, { timeout: 3_000 });
      await takeover.click({ timeout: 10_000 });
      await visible(page, "[data-aw9-takeover-confirmation]").waitFor({ state: "visible", timeout: 10_000 });
      checks.takeoverConfirmation = true;
    }
    return page;
  }
  if (scenario.action === "conflict-server" || scenario.action === "conflict-local") {
    await setOffline(page, true);
    await completeCurrentSet(page, { skipRest: false });
    await waitForSyncState(page, "offline_saved");
    await mutateFirstOperation(page, { baseTargetFingerprint: "aw10-server-diverged" });
    await setOffline(page, false);
    await waitForSyncState(page, "data_conflict");
    checks.dataConflictSeen = true;
    const screenshotPath = path.join(outputDir, `${scenario.name}-conflict.png`);
    await capture(page, screenshotPath);
    checks.preResolutionScreenshot = screenshotPath;
    const buttons = page.locator('[data-aw9-sync-state="data_conflict"] button:visible');
    await buttons.nth(scenario.action === "conflict-server" ? 0 : 1).click({ timeout: 10_000 });
    await waitForOnlineSynced(page);
    checks.pendingAfter = await operationCount(page);
    checks.resolution = scenario.action === "conflict-server" ? "server" : "local";
    return page;
  }
  throw new Error(`Unknown AW-10 action: ${scenario.action}`);
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      colorScheme: scenario.theme,
      reducedMotion: "reduce"
    });
    await installConnectivityContract(context);
    const requestHistory = [];
    const fixture = await installAw5CorrectionFixture(context, {
      direct: scenario.direct,
      language: scenario.language,
      theme: scenario.theme,
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true
    }, requestHistory);
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const failedResponses = [];
    const attachDiagnostics = (target) => {
      target.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      target.on("pageerror", (error) => pageErrors.push(error.message));
      target.on("requestfailed", (request) => failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown"
      }));
      target.on("response", (response) => {
        if (response.status() >= 400) {
          failedResponses.push({ url: response.url(), status: response.status() });
        }
      });
    };
    context.on("page", attachDiagnostics);
    const page = await context.newPage();

    const checks = {};
    let response = null;
    let scenarioError = null;
    let capturePage = page;
    try {
      response = await openSession(page, scenario.direct);
      capturePage = await prepareAction({ scenario, context, page, fixture, checks }) ?? page;
    } catch (error) {
      scenarioError = error instanceof Error ? error.message : String(error);
    }
    await capturePage.waitForTimeout(100);
    const measured = await measure(capturePage);
    const screenshotPath = path.join(outputDir, `${scenario.name}.png`);
    await capture(capturePage, screenshotPath);
    const base = baselineFailures(
      scenario,
      measured,
      consoleErrors,
      pageErrors,
      failedRequests,
      failedResponses
    );
    const failures = [...base.failures];
    if (!response?.ok()) failures.push(`page response ${response?.status() ?? "missing"}`);
    if (scenarioError) failures.push(scenarioError);
    if (scenario.action === "baseline" && measured.shellCount !== 1) failures.push("baseline shell missing");
    if (scenario.action === "details" && checks.detailsVisible !== true) failures.push("details surface missing");
    if (scenario.action === "paused" && measured.shellState !== "paused") failures.push("paused state missing");
    if (scenario.action === "rest" && measured.shellState !== "rest") failures.push("rest state missing");
    if (scenario.action === "review" && measured.reviewCount !== 1) failures.push("review surface missing");
    if (scenario.action === "completion" && (measured.completionCount !== 1 || measured.performanceCount !== 1)) {
      failures.push("completion performance surface missing");
    }
    if (scenario.action === "offline-save" && (measured.syncState !== "offline_saved" || checks.pendingBefore < 1)) {
      failures.push("offline save was not durable");
    }
    if (scenario.action === "offline-refresh" && (measured.syncState !== "offline_saved" || checks.restoredAfterRefresh !== true)) {
      failures.push("offline refresh did not restore durable state");
    }
    if (scenario.action === "reconnect" && (measured.syncState !== null || checks.pendingAfter !== 0)) {
      failures.push("reconnect did not flush durable operations");
    }
    if (scenario.action === "terminal-pending" && (measured.syncState !== "terminal_pending" || measured.completionCount !== 0)) {
      failures.push("terminal intent was shown as server-confirmed");
    }
    if (scenario.action === "server-terminal" && checks.serverTerminalWins !== true) {
      failures.push("server terminal state did not discard local operations");
    }
    if (scenario.action === "tab-readonly" && (measured.tabConflictCount !== 1 || checks.secondTabReadOnly !== true)) {
      failures.push("second tab is not read-only");
    }
    if (scenario.action === "tab-continue" && checks.takeoverMovedLeadership !== true) {
      failures.push("explicit same-device tab continuation failed");
    }
    if (scenario.action === "device-conflict" && (
      measured.deviceConflictCount !== 1 || checks.oldDeviceReadOnly !== true || checks.takeoverDisabledOffline !== true
    )) failures.push("old device conflict/read-only boundary failed");
    if (scenario.action === "takeover-confirmation" && measured.takeoverConfirmationCount !== 1) {
      failures.push("takeover confirmation surface missing");
    }
    if ((scenario.action === "conflict-server" || scenario.action === "conflict-local") && (
      checks.dataConflictSeen !== true || checks.pendingAfter !== 0 || measured.syncState !== null
    )) failures.push(`${scenario.action} resolution failed`);

    results.push({
      name: scenario.name,
      action: scenario.action,
      direct: scenario.direct,
      locale: measured.locale,
      direction: measured.direction,
      viewport: scenario.viewport,
      theme: scenario.theme,
      headSha,
      serverMode,
      screenshotPath,
      checks,
      measured,
      consoleErrors,
      pageErrors,
      unexpectedFailedRequests: base.unexpectedRequests,
      failedResponses,
      requestCount: requestHistory.length,
      failures
    });
    console.log(
      failures.length
        ? `[AW10-QA] FAIL ${scenario.name}: ${failures.join(" | ")}`
        : `[AW10-QA] PASS ${scenario.name}`
    );
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) =>
  result.failures.map((failure) => `${result.name}: ${failure}`)
);
const report = {
  generatedAt: new Date().toISOString(),
  headSha,
  workflowRunId: process.env.QA_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null,
  serverMode,
  buildCommand,
  startCommand,
  mockAuthBuildValue,
  baseUrl,
  scenarioCount: results.length,
  requiredScenarioCount: 30,
  screenshotCount: results.reduce(
    (count, result) => count + 1 + (result.checks.preResolutionScreenshot ? 1 : 0),
    0
  ),
  coverage: {
    responsive: results.some((item) => item.viewport.width === 320)
      && results.some((item) => item.viewport.width === 768)
      && results.some((item) => item.viewport.width === 1440),
    locales: ["en", "de", "ar"].every((locale) => results.some((item) => item.locale === locale)),
    rtl: results.some((item) => item.direction === "rtl"),
    themes: ["light", "dark"].every((theme) => results.some((item) => item.theme === theme)),
    directAndPlan: results.some((item) => item.direct) && results.some((item) => !item.direct),
    derivedMetrics: results.some((item) => item.measured.performanceCount === 1),
    offlineDurability: results.some((item) => item.action === "offline-refresh" && !item.failures.length),
    terminalPending: results.some((item) => item.action === "terminal-pending" && !item.failures.length),
    serverTerminalWins: results.some((item) => item.action === "server-terminal" && !item.failures.length),
    sameDeviceTabs: results.some((item) => item.action === "tab-continue" && !item.failures.length),
    controllerConflict: results.some((item) => item.action === "device-conflict" && !item.failures.length),
    conflictChoices: ["conflict-server", "conflict-local"].every((action) =>
      results.some((item) => item.action === action && !item.failures.length)
    )
  },
  results,
  failures
};
const reportPath = path.join(outputDir, "aw10-active-workout-closure-results.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const missingCoverage = Object.entries(report.coverage)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
if (results.length !== 30) failures.push(`scenario count ${results.length}, expected 30`);
if (missingCoverage.length) failures.push(`missing coverage: ${missingCoverage.join(", ")}`);

if (failures.length) {
  console.error(`AW-10 closure QA failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`AW-10 closure QA passed with ${results.length} scenarios: ${reportPath}`);
}
