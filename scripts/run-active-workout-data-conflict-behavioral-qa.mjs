import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  baseUrl,
  buildCommand,
  dayRoute,
  headSha,
  mockAuthBuildValue,
  serverMode,
  startCommand,
  workflowRunId
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

const outputDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "ci-reports", "active-workout-aw10-evidence")
);
await mkdir(outputDir, { recursive: true });

if (!headSha) throw new Error("QA_HEAD_SHA is required for exact-head Active Workout data-conflict behavioral evidence.");
if (serverMode !== "production") {
  throw new Error(`Active Workout data-conflict behavioral QA requires production mode, received ${serverMode}.`);
}

const OFFLINE_KEY = "plaivra.qa.aw10.offline";
const scenarios = [
  {
    name: "data-conflict-keep-server-mobile-en-320x568",
    viewport: { width: 320, height: 568 },
    language: "en",
    resolution: "server",
    skipRestBeforeConflict: true,
    expectedState: "set-entry"
  },
  {
    name: "data-conflict-use-local-mobile-ar-rtl-390x844",
    viewport: { width: 390, height: 844 },
    language: "ar",
    resolution: "local",
    skipRestBeforeConflict: true,
    expectedState: "set-entry"
  },
  {
    name: "data-conflict-pending-sync-mobile-en-430x932",
    viewport: { width: 430, height: 932 },
    language: "en",
    resolution: null,
    skipRestBeforeConflict: false,
    expectedState: "rest"
  },
  {
    name: "data-conflict-desktop-sanity-en-1280x800",
    viewport: { width: 1280, height: 800 },
    language: "en",
    resolution: "server",
    skipRestBeforeConflict: true,
    expectedState: "set-entry"
  }
];

const firstVisible = (page, selector) => page.locator(`${selector}:visible`).first();

async function installConnectivityContract(context) {
  await context.addInitScript(({ key }) => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get() {
        try {
          return localStorage.getItem(key) !== "true";
        } catch {
          return true;
        }
      }
    });
  }, { key: OFFLINE_KEY });
}

async function setOffline(page, offline) {
  await page.evaluate(({ key, offlineValue }) => {
    localStorage.setItem(key, offlineValue ? "true" : "false");
    window.dispatchEvent(new Event(offlineValue ? "offline" : "online"));
  }, { key: OFFLINE_KEY, offlineValue: offline });
}

async function openSession(page) {
  const response = await page.goto(`${baseUrl}${dayRoute}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await firstVisible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => {
    const conflict = document.querySelector("[data-aw9-tab-conflict]");
    return !(conflict instanceof HTMLElement && conflict.getClientRects().length > 0);
  }, undefined, { timeout: 15_000 });
  return response;
}

async function completeCurrentSet(page, skipRest) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await firstVisible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest",
  undefined, { timeout: 12_000 });
  if (!skipRest) return;
  await firstVisible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") !== "rest",
  undefined, { timeout: 12_000 });
}

async function waitForSyncState(page, state) {
  await page.waitForFunction((expected) => Boolean(document.querySelector(`[data-aw9-sync-state="${expected}"]`)), state, {
    timeout: 20_000
  });
}

async function waitForOnlineSynced(page) {
  await page.waitForFunction(() => !document.querySelector("[data-aw9-sync-state]"), undefined, { timeout: 20_000 });
}

async function openDatabase(page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("session_snapshots")) {
          const store = database.createObjectStore("session_snapshots", { keyPath: "key" });
          store.createIndex("by_user", "userId");
          store.createIndex("by_expiry", "expiresAt");
        }
        if (!database.objectStoreNames.contains("operations")) {
          const store = database.createObjectStore("operations", { keyPath: "id" });
          store.createIndex("by_session_sequence", ["userId", "workoutSessionId", "sequence"], { unique: true });
          store.createIndex("by_user", "userId");
          store.createIndex("by_state", "state");
        }
        if (!database.objectStoreNames.contains("set_drafts")) {
          const store = database.createObjectStore("set_drafts", { keyPath: "key" });
          store.createIndex("by_session", ["userId", "workoutSessionId"]);
          store.createIndex("by_user", "userId");
          store.createIndex("by_expiry", "expiresAt");
        }
      };
    });
  });
}

async function pendingOperations(page) {
  await openDatabase(page);
  return page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
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
    return operations
      .filter((operation) => operation.state !== "applied" && operation.state !== "discarded")
      .map((operation) => ({
        id: operation.id,
        sequence: operation.sequence,
        state: operation.state,
        kind: operation.kind ?? operation.commandType ?? null
      }));
  });
}

async function mutateFirstOperation(page) {
  await openDatabase(page);
  return page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
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
    if (!first) throw new Error("No pending Active Workout operation exists for data-conflict QA.");
    store.put({
      ...first,
      baseTargetFingerprint: "active-workout-behavioral-server-diverged",
      updatedAt: new Date().toISOString()
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return { id: first.id, sequence: first.sequence, state: first.state };
  });
}

async function waitForNoPendingOperations(page, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let stableZero = 0;
  while (Date.now() < deadline) {
    stableZero = (await pendingOperations(page)).length === 0 ? stableZero + 1 : 0;
    if (stableZero >= 3) return;
    await page.waitForTimeout(100);
  }
  throw new Error("Durable operations did not reach a stable resolved state after data-conflict resolution.");
}

async function mainConflictSnapshot(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const isMutable = (element) => {
      if (!isVisible(element) || element.getAttribute("aria-disabled") === "true") return false;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return !element.disabled && !element.readOnly;
      }
      if (element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) return !element.disabled;
      return false;
    };
    const visibleElements = (selector) => [...document.querySelectorAll(selector)].filter(isVisible);
    const groups = [
      ["reps", "#active-set-reps"],
      ["weight", "#active-set-weight"],
      ["primary", "[data-aw5-primary-action]"],
      ["set-path", "[data-aw5-set-path-number]"],
      ["previous-values", "[data-aw10-previous-performance] button"],
      ["rest", "[data-aw5-rest-presets] button"]
    ];
    const coverage = {};
    const enabledControls = [];
    for (const [label, selector] of groups) {
      const elements = visibleElements(selector);
      const mutable = elements.filter(isMutable);
      coverage[label] = { visible: elements.length, mutable: mutable.length };
      for (const element of mutable) {
        enabledControls.push({
          surface: label,
          label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.id || label
        });
      }
    }
    const blockers = visibleElements("[data-aw9-reliability-blocking]");
    const blocker = blockers[0] ?? null;
    const resolutionButtons = blocker ? [...blocker.querySelectorAll("button")].filter(isVisible) : [];
    const standaloneSync = visibleElements("[data-aw9-reliability-sync-status]");
    const primary = visibleElements("[data-aw5-primary-action]")[0] ?? null;
    const blockerRect = blocker?.getBoundingClientRect() ?? null;
    const primaryRect = primary?.getBoundingClientRect() ?? null;
    const overlap = Boolean(blockerRect && primaryRect
      && blockerRect.left < primaryRect.right
      && blockerRect.right > primaryRect.left
      && blockerRect.top < primaryRect.bottom
      && blockerRect.bottom > primaryRect.top);
    const shell = document.querySelector("[data-aw5-execution-shell]");
    return {
      locale: document.documentElement.lang,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      shellState: shell?.getAttribute("data-aw5-session-state") ?? null,
      activeSetNumber: shell?.getAttribute("data-active-set-number") ?? null,
      blockerCount: blockers.length,
      conflictState: blocker?.getAttribute("data-aw9-reliability-blocking") ?? null,
      standaloneSyncCount: standaloneSync.length,
      subordinateSyncCount: visibleElements("[data-aw9-reliability-sync-substatus]").length,
      keepServerEnabled: resolutionButtons[0] instanceof HTMLButtonElement ? !resolutionButtons[0].disabled : false,
      useLocalEnabled: resolutionButtons[1] instanceof HTMLButtonElement ? !resolutionButtons[1].disabled : false,
      resolutionButtonCount: resolutionButtons.length,
      horizontalOverflowPx: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      blockerCtaOverlap: overlap,
      setDetailsTriggerVisible: visibleElements("[data-active-set-details-trigger]").length === 1,
      coverage,
      enabledControls,
      enabledExecutionMutations: enabledControls.length
    };
  });
}

async function inspectAuxiliaryMutationSurfaces(page) {
  const enabledControls = [];
  const coverage = {
    session: { triggerVisible: false, triggerEnabled: false, opened: false, controls: 0, mutable: 0 },
    exercise: { triggerVisible: false, triggerEnabled: false, opened: false, controls: 0, mutable: 0 },
    navigator: { triggerVisible: false, triggerEnabled: false, opened: false, controls: 0, mutable: 0 },
    setDetails: { triggerVisible: false, triggerEnabled: false, opened: false, controls: 0, mutable: 0 }
  };

  async function inspectButtons({ key, triggerSelector, itemSelector, limit = null }) {
    const trigger = page.locator(`${triggerSelector}:visible`).first();
    if (!await trigger.count()) return;
    coverage[key].triggerVisible = true;
    coverage[key].triggerEnabled = await trigger.isEnabled();
    if (!coverage[key].triggerEnabled) return;
    try {
      await trigger.click({ force: true, timeout: 1_500 });
      await page.waitForTimeout(100);
    } catch {
      return;
    }
    const items = page.locator(`${itemSelector}:visible`);
    const count = await items.count();
    const inspectedCount = limit === null ? count : Math.min(count, limit);
    coverage[key].opened = count > 0;
    coverage[key].controls = inspectedCount;
    for (let index = 0; index < inspectedCount; index += 1) {
      const item = items.nth(index);
      if (await item.isEnabled()) {
        coverage[key].mutable += 1;
        enabledControls.push({
          surface: key,
          label: (await item.textContent())?.trim().slice(0, 80) || `${key}-${index + 1}`
        });
      }
    }
    if (count > 0) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
  }

  await inspectButtons({
    key: "session",
    triggerSelector: '[data-aw10-session-menu] [data-aw-menu-trigger="session"]',
    itemSelector: '[data-aw10-session-menu] [role="menuitem"]'
  });
  await inspectButtons({
    key: "exercise",
    triggerSelector: '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]',
    itemSelector: '[data-aw10-exercise-actions] [role="menuitem"]',
    limit: 2
  });
  await inspectButtons({
    key: "navigator",
    triggerSelector: "[data-aw-exercise-navigator-trigger]",
    itemSelector: "[data-aw-exercise-navigator] ol button"
  });

  const trigger = page.locator("[data-active-set-details-trigger]:visible").first();
  if (await trigger.count()) {
    coverage.setDetails.triggerVisible = true;
    coverage.setDetails.triggerEnabled = await trigger.isEnabled();
    if (coverage.setDetails.triggerEnabled) {
      try {
        await trigger.click({ force: true, timeout: 1_500 });
        await page.locator("[data-active-set-details-dialog]:visible").waitFor({ state: "visible", timeout: 1_500 });
        coverage.setDetails.opened = true;
        const controls = page.locator(
          "[data-active-set-details-dialog]:visible #active-set-rpe, "
          + "[data-active-set-details-dialog]:visible #active-set-rir, "
          + "[data-active-set-details-dialog]:visible #active-set-type, "
          + "[data-active-set-details-dialog]:visible #active-set-note"
        );
        coverage.setDetails.controls = await controls.count();
        for (let index = 0; index < coverage.setDetails.controls; index += 1) {
          const control = controls.nth(index);
          const mutable = await control.evaluate((element) => {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
              return !element.disabled && !element.readOnly;
            }
            if (element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) return !element.disabled;
            return false;
          });
          if (mutable) {
            coverage.setDetails.mutable += 1;
            enabledControls.push({ surface: "set-details", label: await control.getAttribute("id") || `set-details-${index + 1}` });
          }
        }
      } catch {
        coverage.setDetails.opened = false;
      } finally {
        if (coverage.setDetails.opened) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(100);
        }
      }
    }
  }
  return { coverage, enabledControls };
}

async function measureEnabledExecutionMutations(page) {
  const main = await mainConflictSnapshot(page);
  const auxiliary = await inspectAuxiliaryMutationSurfaces(page);
  return {
    ...main,
    mutationCoverage: { main: main.coverage, auxiliary: auxiliary.coverage },
    enabledControls: [...main.enabledControls, ...auxiliary.enabledControls],
    enabledExecutionMutations: main.enabledExecutionMutations + auxiliary.enabledControls.length
  };
}

async function attemptBlockedInteractions(page, pre) {
  const result = {
    reps: { applicable: false, before: null, after: null, actionAccepted: null, blocked: null },
    weight: { applicable: false, before: null, after: null, actionAccepted: null, blocked: null },
    primary: {
      applicable: false,
      beforeSet: pre.activeSetNumber,
      afterSet: pre.activeSetNumber,
      beforeState: pre.shellState,
      afterState: pre.shellState,
      actionAccepted: null,
      blocked: null
    },
    setPath: { applicable: false, beforeSet: pre.activeSetNumber, afterSet: pre.activeSetNumber, actionAccepted: null, blocked: null }
  };

  const reps = page.locator("#active-set-reps:visible").first();
  if (await reps.count()) {
    result.reps.applicable = true;
    result.reps.before = await reps.inputValue();
    try {
      await reps.fill(result.reps.before === "9" ? "10" : "9", { timeout: 1_000 });
      result.reps.actionAccepted = true;
    } catch {
      result.reps.actionAccepted = false;
    }
    result.reps.after = await reps.inputValue();
    result.reps.blocked = result.reps.after === result.reps.before;
  }

  const weight = page.locator("#active-set-weight:visible").first();
  if (await weight.count()) {
    result.weight.applicable = true;
    result.weight.before = await weight.inputValue();
    try {
      await weight.fill(result.weight.before === "82.5" ? "85" : "82.5", { timeout: 1_000 });
      result.weight.actionAccepted = true;
    } catch {
      result.weight.actionAccepted = false;
    }
    result.weight.after = await weight.inputValue();
    result.weight.blocked = result.weight.after === result.weight.before;
  }

  const primary = page.locator("[data-aw5-primary-action]:visible").first();
  if (await primary.count()) {
    result.primary.applicable = true;
    try {
      await primary.click({ timeout: 1_000 });
      result.primary.actionAccepted = true;
    } catch {
      result.primary.actionAccepted = false;
    }
    await page.waitForTimeout(100);
    const shell = page.locator("[data-aw5-execution-shell]");
    result.primary.afterSet = await shell.getAttribute("data-active-set-number");
    result.primary.afterState = await shell.getAttribute("data-aw5-session-state");
    result.primary.blocked = result.primary.afterSet === result.primary.beforeSet && result.primary.afterState === result.primary.beforeState;
  }

  const pathButtons = page.locator("[data-aw5-set-path-number]:visible");
  if (await pathButtons.count()) {
    let target = pathButtons.first();
    for (let index = 0; index < await pathButtons.count(); index += 1) {
      const candidate = pathButtons.nth(index);
      if (await candidate.getAttribute("data-aw5-set-path-number") !== result.setPath.beforeSet) {
        target = candidate;
        break;
      }
    }
    result.setPath.applicable = true;
    try {
      await target.click({ timeout: 1_000 });
      result.setPath.actionAccepted = true;
    } catch {
      result.setPath.actionAccepted = false;
    }
    await page.waitForTimeout(100);
    result.setPath.afterSet = await page.locator("[data-aw5-execution-shell]").getAttribute("data-active-set-number");
    result.setPath.blocked = result.setPath.afterSet === result.setPath.beforeSet;
  }
  return result;
}

async function proveExecutionRecovery(page) {
  await page.waitForFunction(() => {
    const reps = document.querySelector("#active-set-reps");
    const weight = document.querySelector("#active-set-weight");
    const primary = [...document.querySelectorAll("[data-aw5-primary-action]")].find((element) =>
      element instanceof HTMLElement && element.getClientRects().length > 0
    );
    return reps instanceof HTMLInputElement && !reps.disabled && !reps.readOnly
      && weight instanceof HTMLInputElement && !weight.disabled && !weight.readOnly
      && primary instanceof HTMLButtonElement && !primary.disabled;
  }, undefined, { timeout: 8_000 });

  const reps = page.locator("#active-set-reps:visible").first();
  const weight = page.locator("#active-set-weight:visible").first();
  const primary = page.locator("[data-aw5-primary-action]:visible").first();
  const recovery = {
    repsEditable: await reps.isEditable(),
    weightEditable: await weight.isEditable(),
    primaryEnabled: await primary.isEnabled(),
    repsMutationAccepted: false,
    weightMutationAccepted: false,
    repsValueAfter: null,
    weightValueAfter: null,
    executionRecovered: false
  };
  if (recovery.repsEditable) {
    await reps.fill("9");
    recovery.repsValueAfter = await reps.inputValue();
    recovery.repsMutationAccepted = recovery.repsValueAfter === "9";
  }
  if (recovery.weightEditable) {
    await weight.fill("82.5");
    recovery.weightValueAfter = await weight.inputValue();
    recovery.weightMutationAccepted = recovery.weightValueAfter === "82.5";
  }
  recovery.executionRecovered = recovery.repsEditable
    && recovery.weightEditable
    && recovery.primaryEnabled
    && recovery.repsMutationAccepted
    && recovery.weightMutationAccepted;
  return recovery;
}

function assertUnresolved(scenario, evidence) {
  const failures = [];
  if (evidence.blockerCount !== 1) failures.push(`blocking reliability surface count ${evidence.blockerCount}, expected 1`);
  if (evidence.conflictState !== "data_conflict") failures.push(`blocking state ${evidence.conflictState ?? "missing"}, expected data_conflict`);
  if (evidence.standaloneSyncCount !== 0) failures.push(`standalone sync surface count ${evidence.standaloneSyncCount}, expected 0`);
  if (evidence.resolutionButtonCount !== 2) failures.push(`conflict resolution button count ${evidence.resolutionButtonCount}, expected 2`);
  if (!evidence.keepServerEnabled) failures.push("Keep Server is not enabled");
  if (!evidence.useLocalEnabled) failures.push("Use Local is not enabled");
  if (evidence.enabledExecutionMutations !== 0) {
    failures.push(`enabled execution mutations ${evidence.enabledExecutionMutations}, expected 0: ${JSON.stringify(evidence.enabledControls)}`);
  }
  if (evidence.horizontalOverflowPx > 1) failures.push(`horizontal overflow ${evidence.horizontalOverflowPx}px`);
  if (evidence.blockerCtaOverlap) failures.push("data-conflict blocker overlaps execution CTA");
  if (evidence.locale !== scenario.language) failures.push(`locale ${evidence.locale}, expected ${scenario.language}`);
  if (scenario.language === "ar" && evidence.direction !== "rtl") failures.push(`Arabic direction ${evidence.direction}, expected rtl`);
  if (scenario.language !== "ar" && evidence.direction !== "ltr") failures.push(`${scenario.language} direction ${evidence.direction}, expected ltr`);
  if (evidence.shellState !== scenario.expectedState) failures.push(`session state ${evidence.shellState}, expected ${scenario.expectedState}`);

  const auxiliary = evidence.mutationCoverage.auxiliary;
  for (const key of ["session", "exercise", "navigator", "setDetails"]) {
    if (auxiliary[key].mutable !== 0) failures.push(`${key} mutation surface exposes ${auxiliary[key].mutable} executable controls during data conflict`);
  }

  if (scenario.expectedState === "set-entry") {
    if (evidence.coverage.reps?.visible !== 1 || evidence.coverage.reps?.mutable !== 0) failures.push("Reps is not visibly fail-closed during data conflict");
    if (evidence.coverage.weight?.visible !== 1 || evidence.coverage.weight?.mutable !== 0) failures.push("Weight is not visibly fail-closed during data conflict");
    if (evidence.coverage.primary?.mutable !== 0) failures.push("primary execution CTA is mutable during data conflict");
    if ((evidence.coverage["set-path"]?.visible ?? 0) < 1 || evidence.coverage["set-path"]?.mutable !== 0) failures.push("Set Path is not fail-closed during data conflict");
    if (!evidence.setDetailsTriggerVisible) failures.push("Set Details trigger was not rendered for fail-closed inspection");
  } else if (scenario.expectedState === "rest") {
    if ((evidence.coverage.rest?.visible ?? 0) < 1 || evidence.coverage.rest?.mutable !== 0) failures.push("Rest mutation controls are not fail-closed during data conflict");
    if (evidence.coverage.primary?.mutable !== 0) failures.push("Skip Rest is mutable during data conflict");
  }
  return failures;
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      colorScheme: "light",
      reducedMotion: "reduce"
    });
    await installConnectivityContract(context);
    const requestHistory = [];
    await installAw5CorrectionFixture(context, {
      direct: false,
      language: scenario.language,
      theme: "light",
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true
    }, requestHistory);
    await context.route(/\/api\/workouts\/active\/previous-performance(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "private, no-store" },
        body: JSON.stringify({ data: null })
      });
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const failures = [];
    let response = null;
    let setupOperation = null;
    let pre = null;
    let blockedInteractions = null;
    let pendingBeforeResolution = [];
    let pendingAtConflict = [];
    let pendingAfterResolution = null;
    let conflictVisibleAfterResolution = null;
    let recovery = null;
    let unresolvedScreenshotPath = null;
    let resolvedScreenshotPath = null;

    try {
      response = await openSession(page);
      if (!response?.ok()) failures.push(`page response ${response?.status() ?? "missing"}`);
      await setOffline(page, true);
      await completeCurrentSet(page, scenario.skipRestBeforeConflict);
      await waitForSyncState(page, "offline_saved");
      setupOperation = await mutateFirstOperation(page);
      pendingBeforeResolution = await pendingOperations(page);
      if (pendingBeforeResolution.length < 1) failures.push("no durable pending operations existed before reconnect conflict");

      await setOffline(page, false);
      await waitForSyncState(page, "data_conflict");
      pendingAtConflict = await pendingOperations(page);
      if (pendingAtConflict.length < 1) failures.push("data conflict did not coexist with a durable pending operation");

      pre = await measureEnabledExecutionMutations(page);
      failures.push(...assertUnresolved(scenario, pre));
      blockedInteractions = await attemptBlockedInteractions(page, pre);
      if (scenario.expectedState === "set-entry") {
        if (blockedInteractions.reps.blocked !== true) failures.push("blocked Reps interaction changed the field value");
        if (blockedInteractions.weight.blocked !== true) failures.push("blocked Weight interaction changed the field value");
        if (blockedInteractions.setPath.blocked !== true) failures.push("blocked Set Path interaction changed execution cursor");
      }
      if (blockedInteractions.primary.blocked !== true) failures.push("blocked primary action changed execution state");

      unresolvedScreenshotPath = path.join(outputDir, `${scenario.name}-unresolved.png`);
      await page.screenshot({ path: unresolvedScreenshotPath, fullPage: false });

      if (scenario.resolution) {
        const buttons = page.locator('[data-aw9-reliability-blocking="data_conflict"] button:visible');
        await buttons.nth(scenario.resolution === "server" ? 0 : 1).click({ timeout: 10_000 });
        await waitForOnlineSynced(page);
        await waitForNoPendingOperations(page);
        pendingAfterResolution = await pendingOperations(page);
        conflictVisibleAfterResolution = await page.locator('[data-aw9-reliability-blocking="data_conflict"]:visible').count() > 0;
        recovery = await proveExecutionRecovery(page);
        if (pendingAfterResolution.length !== 0) failures.push(`pending operations after ${scenario.resolution} resolution: ${pendingAfterResolution.length}`);
        if (conflictVisibleAfterResolution) failures.push(`data-conflict blocker remained visible after ${scenario.resolution} resolution`);
        if (!recovery.executionRecovered) failures.push(`execution did not recover after ${scenario.resolution} resolution`);
        const post = await mainConflictSnapshot(page);
        if (post.horizontalOverflowPx > 1) failures.push(`post-resolution horizontal overflow ${post.horizontalOverflowPx}px`);
        resolvedScreenshotPath = path.join(outputDir, `${scenario.name}-resolved.png`);
        await page.screenshot({ path: resolvedScreenshotPath, fullPage: false });
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
    if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);

    const evidence = {
      scenarioName: scenario.name,
      exactHeadSha: headSha,
      viewport: scenario.viewport,
      locale: pre?.locale ?? scenario.language,
      direction: pre?.direction ?? null,
      conflictState: pre?.conflictState ?? null,
      blockerCount: pre?.blockerCount ?? null,
      standaloneSyncCount: pre?.standaloneSyncCount ?? null,
      subordinateSyncCount: pre?.subordinateSyncCount ?? null,
      enabledExecutionMutationsBeforeResolution: pre?.enabledExecutionMutations ?? null,
      enabledExecutionMutationControls: pre?.enabledControls ?? [],
      keepServerEnabled: pre?.keepServerEnabled ?? null,
      useLocalEnabled: pre?.useLocalEnabled ?? null,
      attemptedBlockedInteractionResult: blockedInteractions,
      chosenResolution: scenario.resolution ?? "none",
      pendingOperationsBeforeResolution: pendingBeforeResolution,
      pendingOperationsAtConflict: pendingAtConflict,
      pendingOperationsAfterResolution: pendingAfterResolution,
      conflictVisibleAfterResolution,
      executionRecovered: recovery?.executionRecovered ?? null,
      recovery,
      horizontalOverflow: pre?.horizontalOverflowPx ?? null,
      blockerCtaOverlap: pre?.blockerCtaOverlap ?? null,
      shellState: pre?.shellState ?? null,
      mutationCoverage: pre?.mutationCoverage ?? null,
      unresolvedScreenshotPath,
      resolvedScreenshotPath,
      setupOperation,
      failures: [...failures]
    };
    results.push({
      name: scenario.name,
      headSha,
      serverMode,
      viewport: scenario.viewport,
      language: scenario.language,
      resolution: scenario.resolution,
      requestCount: requestHistory.length,
      consoleErrors,
      pageErrors,
      behavioralEvidence: evidence,
      failures
    });
    console.log(failures.length
      ? `[AW-DATA-CONFLICT-QA] FAIL ${scenario.name}: ${failures.join(" | ")}`
      : `[AW-DATA-CONFLICT-QA] PASS ${scenario.name}`);
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => result.failures.map((failure) => `${result.name}: ${failure}`));
const coverage = {
  unresolvedZeroMutations: results.every((result) => result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0),
  keepServerRecovery: results.some((result) =>
    result.resolution === "server"
    && result.behavioralEvidence.executionRecovered === true
    && result.behavioralEvidence.pendingOperationsAfterResolution?.length === 0
  ),
  useLocalRecovery: results.some((result) =>
    result.resolution === "local"
    && result.behavioralEvidence.executionRecovered === true
    && result.behavioralEvidence.pendingOperationsAfterResolution?.length === 0
  ),
  conflictPendingPriority: results.some((result) =>
    result.name.includes("pending-sync")
    && result.behavioralEvidence.blockerCount === 1
    && result.behavioralEvidence.standaloneSyncCount === 0
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
    && (result.behavioralEvidence.pendingOperationsAtConflict?.length ?? 0) > 0
  ),
  mobile320: results.some((result) => result.viewport.width === 320 && result.failures.length === 0),
  mobile390: results.some((result) => result.viewport.width === 390 && result.failures.length === 0),
  mobile430: results.some((result) => result.viewport.width === 430 && result.failures.length === 0),
  desktop: results.some((result) => result.viewport.width >= 1280 && result.failures.length === 0),
  rtl: results.some((result) =>
    result.language === "ar"
    && result.behavioralEvidence.direction === "rtl"
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
    && result.failures.length === 0
  ),
  setEntryMutations: results.some((result) =>
    result.behavioralEvidence.shellState === "set-entry"
    && result.behavioralEvidence.mutationCoverage?.main?.reps?.visible === 1
    && result.behavioralEvidence.mutationCoverage?.main?.weight?.visible === 1
    && (result.behavioralEvidence.mutationCoverage?.main?.["set-path"]?.visible ?? 0) >= 1
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
  ),
  auxiliaryMutationClasses: results.some((result) => {
    const auxiliary = result.behavioralEvidence.mutationCoverage?.auxiliary;
    return (auxiliary?.session?.controls ?? 0) >= 2
      && (auxiliary?.exercise?.controls ?? 0) >= 2
      && (auxiliary?.navigator?.controls ?? 0) >= 1
      && (auxiliary?.setDetails?.controls ?? 0) >= 4
      && auxiliary?.session?.mutable === 0
      && auxiliary?.exercise?.mutable === 0
      && auxiliary?.navigator?.mutable === 0
      && auxiliary?.setDetails?.mutable === 0;
  }),
  restMutations: results.some((result) =>
    result.behavioralEvidence.shellState === "rest"
    && (result.behavioralEvidence.mutationCoverage?.main?.rest?.visible ?? 0) >= 1
    && result.behavioralEvidence.mutationCoverage?.main?.rest?.mutable === 0
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
  )
};
const missingCoverage = Object.entries(coverage).filter(([, passed]) => passed !== true).map(([name]) => name);
if (missingCoverage.length) failures.push(`missing behavioral data-conflict coverage: ${missingCoverage.join(", ")}`);

const report = {
  generatedAt: new Date().toISOString(),
  headSha,
  workflowRunId,
  serverMode,
  buildCommand,
  startCommand,
  mockAuthBuildValue,
  baseUrl,
  scenarioCount: results.length,
  requiredScenarioCount: scenarios.length,
  screenshotCount: results.reduce((count, result) => count
    + (result.behavioralEvidence.unresolvedScreenshotPath ? 1 : 0)
    + (result.behavioralEvidence.resolvedScreenshotPath ? 1 : 0), 0),
  coverage,
  results,
  failures
};
const reportPath = path.join(outputDir, "active-workout-data-conflict-behavioral-results.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length) {
  console.error(`Active Workout behavioral data-conflict QA failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Active Workout behavioral data-conflict QA passed with ${results.length} scenarios: ${reportPath}`);
}
