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

if (!headSha) {
  throw new Error("QA_HEAD_SHA is required for exact-head Active Workout data-conflict behavioral evidence.");
}
if (serverMode !== "production") {
  throw new Error(`Active Workout data-conflict behavioral QA requires production mode, received ${serverMode}.`);
}

const OFFLINE_KEY = "plaivra.qa.aw10.offline";
const scenarios = [
  {
    name: "data-conflict-keep-server-mobile-en-320x568",
    viewport: { width: 320, height: 568 },
    language: "en",
    theme: "light",
    resolution: "server",
    skipRestBeforeConflict: true,
    requireSetEntryCoverage: true,
    requireRestCoverage: false
  },
  {
    name: "data-conflict-use-local-mobile-ar-rtl-390x844",
    viewport: { width: 390, height: 844 },
    language: "ar",
    theme: "light",
    resolution: "local",
    skipRestBeforeConflict: true,
    requireSetEntryCoverage: true,
    requireRestCoverage: false
  },
  {
    name: "data-conflict-pending-sync-mobile-en-430x932",
    viewport: { width: 430, height: 932 },
    language: "en",
    theme: "light",
    resolution: null,
    skipRestBeforeConflict: false,
    requireSetEntryCoverage: false,
    requireRestCoverage: true
  },
  {
    name: "data-conflict-desktop-sanity-en-1280x800",
    viewport: { width: 1280, height: 800 },
    language: "en",
    theme: "light",
    resolution: "server",
    skipRestBeforeConflict: true,
    requireSetEntryCoverage: true,
    requireRestCoverage: false
  }
];

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
    const visibleConflict = conflict instanceof HTMLElement && conflict.getClientRects().length > 0;
    return !visibleConflict;
  }, undefined, { timeout: 15_000 });
}

async function openSession(page) {
  const response = await page.goto(`${baseUrl}${dayRoute}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
  await waitForLeadership(page);
  return response;
}

async function completeCurrentSet(page, { skipRest }) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")
      ?.getAttribute("data-aw5-session-state") === "rest",
  undefined, { timeout: 12_000 });
  if (!skipRest) return;
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.querySelector("[data-aw5-execution-shell]")
      ?.getAttribute("data-aw5-session-state") !== "rest",
  undefined, { timeout: 12_000 });
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
  await page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    await new Promise((resolve, reject) => {
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
        if (!database.objectStoreNames.contains("set_drafts")) {
          const drafts = database.createObjectStore("set_drafts", { keyPath: "key" });
          drafts.createIndex("by_session", ["userId", "workoutSessionId"]);
          drafts.createIndex("by_user", "userId");
          drafts.createIndex("by_expiry", "expiresAt");
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

async function waitForNoPendingOperations(page, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let stableZeroObservations = 0;
  while (Date.now() < deadline) {
    const count = (await pendingOperations(page)).length;
    stableZeroObservations = count === 0 ? stableZeroObservations + 1 : 0;
    if (stableZeroObservations >= 3) return;
    await page.waitForTimeout(100);
  }
  throw new Error("Durable operations did not reach a stable resolved state after data-conflict resolution.");
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

async function capture(page, target) {
  await page.screenshot({ path: target, fullPage: false });
}

async function domConflictSnapshot(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const isMutable = (element) => {
      if (!isVisible(element)) return false;
      if (element.getAttribute("aria-disabled") === "true") return false;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return !element.disabled && !element.readOnly;
      }
      if (element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) {
        return !element.disabled;
      }
      return false;
    };
    const descriptor = (element, fallback) => ({
      label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || fallback,
      tag: element.tagName.toLowerCase(),
      id: element.id || null
    });
    const select = (selector) => [...document.querySelectorAll(selector)].filter(isVisible);
    const mainMutationGroups = [
      ["reps", "#active-set-reps"],
      ["weight", "#active-set-weight"],
      ["primary", "[data-aw5-primary-action]"],
      ["set-path", "[data-aw5-set-path-number]"],
      ["previous-values", "[data-aw10-previous-performance] button"],
      ["rest", "[data-aw5-rest-presets] button"],
      ["set-rpe", "#active-set-rpe"],
      ["set-rir", "#active-set-rir"],
      ["set-type", "#active-set-type"],
      ["set-note", "#active-set-note"]
    ];
    const mutable = [];
    const coverage = {};
    for (const [label, selector] of mainMutationGroups) {
      const elements = select(selector);
      coverage[label] = {
        visible: elements.length,
        mutable: elements.filter(isMutable).length
      };
      for (const element of elements) {
        if (isMutable(element)) mutable.push(descriptor(element, label));
      }
    }
    const blockers = select("[data-aw9-reliability-blocking]");
    const standaloneSync = select("[data-aw9-reliability-sync-status]");
    const blocker = blockers[0] ?? null;
    const resolutionButtons = blocker
      ? [...blocker.querySelectorAll("button")].filter(isVisible)
      : [];
    const primary = select("[data-aw5-primary-action]")[0] ?? null;
    const blockerRect = blocker?.getBoundingClientRect() ?? null;
    const primaryRect = primary?.getBoundingClientRect() ?? null;
    const overlap = Boolean(blockerRect && primaryRect
      && blockerRect.left < primaryRect.right
      && blockerRect.right > primaryRect.left
      && blockerRect.top < primaryRect.bottom
      && blockerRect.bottom > primaryRect.top);
    return {
      locale: document.documentElement.lang,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      shellState: document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") ?? null,
      activeSetNumber: document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-active-set-number") ?? null,
      blockerCount: blockers.length,
      conflictState: blocker?.getAttribute("data-aw9-reliability-blocking") ?? null,
      standaloneSyncCount: standaloneSync.length,
      subordinateSyncCount: select("[data-aw9-reliability-sync-substatus]").length,
      keepServerEnabled: resolutionButtons[0] instanceof HTMLButtonElement ? !resolutionButtons[0].disabled : false,
      useLocalEnabled: resolutionButtons[1] instanceof HTMLButtonElement ? !resolutionButtons[1].disabled : false,
      resolutionButtonCount: resolutionButtons.length,
      horizontalOverflowPx: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      blockerCtaOverlap: overlap,
      coverage,
      enabledControls: mutable,
      enabledExecutionMutations: mutable.length,
      repsVisible: select("#active-set-reps").length === 1,
      repsMutable: select("#active-set-reps").some(isMutable),
      weightVisible: select("#active-set-weight").length === 1,
      weightMutable: select("#active-set-weight").some(isMutable),
      primaryVisible: select("[data-aw5-primary-action]").length > 0,
      primaryMutable: select("[data-aw5-primary-action]").some(isMutable),
      setDetailsTriggerVisible: select("[data-active-set-details-trigger]").length === 1,
      setDetailsTriggerEnabled: select("[data-active-set-details-trigger]")
        .some((element) => element instanceof HTMLButtonElement && !element.disabled),
      navigatorTriggerVisible: select("[data-aw-exercise-navigator-trigger]").length === 1
    };
  });
}

async function inspectAuxiliaryMutationSurfaces(page) {
  const enabled = [];
  const coverage = {
    sessionMutationControlCount: 0,
    exerciseMutationControlCount: 0,
    navigatorMutationControlCount: 0,
    sessionMutableCount: 0,
    exerciseMutableCount: 0,
    navigatorMutableCount: 0
  };

  const sessionTrigger = page.locator('[data-aw10-session-menu] [data-aw-menu-trigger="session"]:visible').first();
  if (await sessionTrigger.count()) {
    await sessionTrigger.click({ force: true, timeout: 5_000 });
    await page.waitForFunction(() =>
      document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open",
    undefined, { timeout: 5_000 });
    const session = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[data-aw10-session-menu] [role="menuitem"]')]
        .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0);
      return items.map((element, index) => ({
        label: `session-${index + 1}:${element.textContent?.trim().slice(0, 60) ?? "mutation"}`,
        mutable: element instanceof HTMLButtonElement && !element.disabled
      }));
    });
    coverage.sessionMutationControlCount = session.length;
    coverage.sessionMutableCount = session.filter((item) => item.mutable).length;
    enabled.push(...session.filter((item) => item.mutable).map(({ label }) => ({ label, surface: "session-menu" })));
    await page.keyboard.press("Escape");
  }

  const exerciseTrigger = page.locator('[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]:visible').first();
  if (await exerciseTrigger.count()) {
    await exerciseTrigger.click({ force: true, timeout: 5_000 });
    await page.waitForFunction(() =>
      document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open",
    undefined, { timeout: 5_000 });
    const exercise = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[data-aw10-exercise-actions] [role="menuitem"]')]
        .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0)
        .slice(0, 2);
      return items.map((element, index) => ({
        label: `exercise-${index + 1}:${element.textContent?.trim().slice(0, 60) ?? "mutation"}`,
        mutable: element instanceof HTMLButtonElement && !element.disabled
      }));
    });
    coverage.exerciseMutationControlCount = exercise.length;
    coverage.exerciseMutableCount = exercise.filter((item) => item.mutable).length;
    enabled.push(...exercise.filter((item) => item.mutable).map(({ label }) => ({ label, surface: "exercise-menu" })));
    await page.keyboard.press("Escape");
  }

  const navigatorTrigger = page.locator("[data-aw-exercise-navigator-trigger]:visible").first();
  if (await navigatorTrigger.count()) {
    await navigatorTrigger.click({ force: true, timeout: 5_000 });
    await visible(page, "[data-aw-exercise-navigator]").waitFor({ state: "visible", timeout: 5_000 });
    const navigator = await page.evaluate(() => {
      const items = [...document.querySelectorAll("[data-aw-exercise-navigator] ol button")]
        .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0);
      return items.map((element, index) => ({
        label: `navigator-${index + 1}:${element.textContent?.trim().slice(0, 60) ?? "mutation"}`,
        mutable: element instanceof HTMLButtonElement && !element.disabled
      }));
    });
    coverage.navigatorMutationControlCount = navigator.length;
    coverage.navigatorMutableCount = navigator.filter((item) => item.mutable).length;
    enabled.push(...navigator.filter((item) => item.mutable).map(({ label }) => ({ label, surface: "exercise-navigator" })));
    await page.keyboard.press("Escape");
    await visible(page, "[data-aw-exercise-navigator]").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }

  return { enabled, coverage };
}

async function measureEnabledExecutionMutations(page) {
  const main = await domConflictSnapshot(page);
  const auxiliary = await inspectAuxiliaryMutationSurfaces(page);
  return {
    ...main,
    auxiliaryCoverage: auxiliary.coverage,
    enabledControls: [...main.enabledControls, ...auxiliary.enabled],
    enabledExecutionMutations: main.enabledExecutionMutations + auxiliary.enabled.length
  };
}

async function attemptBlockedInteractions(page, pre) {
  const result = {
    reps: { applicable: false, actionAccepted: null, before: null, after: null, blocked: null },
    weight: { applicable: false, actionAccepted: null, before: null, after: null, blocked: null },
    primary: { applicable: false, actionAccepted: null, beforeSet: pre.activeSetNumber, afterSet: pre.activeSetNumber, beforeShellState: pre.shellState, afterShellState: pre.shellState, blocked: null },
    setPath: { applicable: false, actionAccepted: null, beforeSet: pre.activeSetNumber, afterSet: pre.activeSetNumber, blocked: null }
  };

  const reps = page.locator("#active-set-reps:visible").first();
  if (await reps.count()) {
    result.reps.applicable = true;
    result.reps.before = await reps.inputValue();
    try {
      await reps.fill(result.reps.before === "9" ? "10" : "9", { timeout: 1_500 });
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
      await weight.fill(result.weight.before === "82.5" ? "85" : "82.5", { timeout: 1_500 });
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
      await primary.click({ timeout: 1_500 });
      result.primary.actionAccepted = true;
    } catch {
      result.primary.actionAccepted = false;
    }
    await page.waitForTimeout(100);
    result.primary.afterSet = await page.locator("[data-aw5-execution-shell]").getAttribute("data-active-set-number");
    result.primary.afterShellState = await page.locator("[data-aw5-execution-shell]").getAttribute("data-aw5-session-state");
    result.primary.blocked = result.primary.afterSet === result.primary.beforeSet
      && result.primary.afterShellState === result.primary.beforeShellState;
  }

  const pathButtons = page.locator("[data-aw5-set-path-number]:visible");
  if (await pathButtons.count()) {
    let target = pathButtons.first();
    for (let index = 0; index < await pathButtons.count(); index += 1) {
      const candidate = pathButtons.nth(index);
      const number = await candidate.getAttribute("data-aw5-set-path-number");
      if (number !== result.setPath.beforeSet) {
        target = candidate;
        break;
      }
    }
    result.setPath.applicable = true;
    try {
      await target.click({ timeout: 1_500 });
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
  const result = {
    repsEditable: false,
    weightEditable: false,
    primaryEnabled: false,
    repsMutationAccepted: false,
    weightMutationAccepted: false,
    repsValueAfter: null,
    weightValueAfter: null,
    executionRecovered: false
  };
  if (!await reps.count() || !await weight.count() || !await primary.count()) return result;
  result.repsEditable = await reps.isEditable();
  result.weightEditable = await weight.isEditable();
  result.primaryEnabled = await primary.isEnabled();
  if (result.repsEditable) {
    await reps.fill("9");
    result.repsValueAfter = await reps.inputValue();
    result.repsMutationAccepted = result.repsValueAfter === "9";
  }
  if (result.weightEditable) {
    await weight.fill("82.5");
    result.weightValueAfter = await weight.inputValue();
    result.weightMutationAccepted = result.weightValueAfter === "82.5";
  }
  result.executionRecovered = result.repsEditable
    && result.weightEditable
    && result.primaryEnabled
    && result.repsMutationAccepted
    && result.weightMutationAccepted;
  return result;
}

function assertConflictPreconditions(scenario, evidence) {
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
  if (scenario.language === "ar" && evidence.direction !== "rtl") failures.push(`Arabic direction ${evidence.direction}, expected rtl`);
  if (scenario.language !== "ar" && evidence.direction !== "ltr") failures.push(`${scenario.language} direction ${evidence.direction}, expected ltr`);
  if (evidence.locale !== scenario.language) failures.push(`locale ${evidence.locale}, expected ${scenario.language}`);
  if (evidence.auxiliaryCoverage.sessionMutationControlCount < 2) failures.push("session mutation controls were not rendered for fail-closed inspection");
  if (evidence.auxiliaryCoverage.navigatorMutationControlCount < 1) failures.push("Exercise Navigator mutation control was not rendered for fail-closed inspection");
  if (scenario.requireSetEntryCoverage) {
    if (evidence.shellState !== "set-entry") failures.push(`expected set-entry conflict state, found ${evidence.shellState}`);
    if (!evidence.repsVisible || evidence.repsMutable) failures.push("Reps is not visibly fail-closed during data conflict");
    if (!evidence.weightVisible || evidence.weightMutable) failures.push("Weight is not visibly fail-closed during data conflict");
    if (evidence.primaryMutable) failures.push("primary execution CTA is mutable during data conflict");
    if (evidence.coverage["set-path"]?.visible < 1) failures.push("Set Path control was not rendered for fail-closed inspection");
    if (evidence.auxiliaryCoverage.exerciseMutationControlCount < 2) failures.push("Replace/Skip controls were not rendered for fail-closed inspection");
    if (!evidence.setDetailsTriggerVisible || evidence.setDetailsTriggerEnabled) failures.push("Set Details is accessible for mutation during data conflict");
  }
  if (scenario.requireRestCoverage) {
    if (evidence.shellState !== "rest") failures.push(`expected rest conflict state, found ${evidence.shellState}`);
    if (evidence.coverage.rest?.visible < 1) failures.push("Rest mutation controls were not rendered for fail-closed inspection");
    if (evidence.coverage.rest?.mutable !== 0 || evidence.primaryMutable) failures.push("Rest mutation controls are executable during data conflict");
  }
  return failures;
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
    await installAw5CorrectionFixture(context, {
      direct: false,
      language: scenario.language,
      theme: scenario.theme,
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

    const consoleErrors = [];
    const pageErrors = [];
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const failures = [];
    let response = null;
    let pre = null;
    let blockedInteractions = null;
    let pendingBeforeResolution = [];
    let pendingAtConflict = [];
    let pendingAfterResolution = null;
    let conflictVisibleAfterResolution = null;
    let recovery = null;
    const chosenResolution = scenario.resolution ?? "none";
    let unresolvedScreenshotPath = null;
    let resolvedScreenshotPath = null;
    let setupOperation = null;

    try {
      response = await openSession(page);
      if (!response?.ok()) failures.push(`page response ${response?.status() ?? "missing"}`);
      await setOffline(page, true);
      await completeCurrentSet(page, { skipRest: scenario.skipRestBeforeConflict });
      await waitForSyncState(page, "offline_saved");
      setupOperation = await mutateFirstOperation(page);
      pendingBeforeResolution = await pendingOperations(page);
      if (pendingBeforeResolution.length < 1) failures.push("no durable pending operations existed before reconnect conflict");
      await setOffline(page, false);
      await waitForSyncState(page, "data_conflict");
      pendingAtConflict = await pendingOperations(page);
      if (pendingAtConflict.length < 1) failures.push("data conflict did not coexist with a durable pending operation");

      pre = await measureEnabledExecutionMutations(page);
      failures.push(...assertConflictPreconditions(scenario, pre));
      blockedInteractions = await attemptBlockedInteractions(page, pre);
      if (scenario.requireSetEntryCoverage) {
        if (blockedInteractions.reps.blocked !== true) failures.push("blocked Reps interaction changed the field value");
        if (blockedInteractions.weight.blocked !== true) failures.push("blocked Weight interaction changed the field value");
        if (blockedInteractions.setPath.blocked !== true) failures.push("blocked Set Path interaction changed execution cursor");
      }
      if (blockedInteractions.primary.blocked !== true) failures.push("blocked primary action changed execution state");

      unresolvedScreenshotPath = path.join(outputDir, `${scenario.name}-unresolved.png`);
      await capture(page, unresolvedScreenshotPath);

      if (scenario.resolution) {
        const buttons = page.locator('[data-aw9-reliability-blocking="data_conflict"] button:visible');
        const resolutionIndex = scenario.resolution === "server" ? 0 : 1;
        await buttons.nth(resolutionIndex).click({ timeout: 10_000 });
        await waitForOnlineSynced(page);
        await waitForNoPendingOperations(page);
        pendingAfterResolution = await pendingOperations(page);
        conflictVisibleAfterResolution = await page.locator('[data-aw9-reliability-blocking="data_conflict"]:visible').count() > 0;
        recovery = await proveExecutionRecovery(page);
        if (pendingAfterResolution.length !== 0) failures.push(`pending operations after ${scenario.resolution} resolution: ${pendingAfterResolution.length}`);
        if (conflictVisibleAfterResolution) failures.push(`data-conflict blocker remained visible after ${scenario.resolution} resolution`);
        if (!recovery.executionRecovered) failures.push(`execution did not recover after ${scenario.resolution} resolution`);
        const post = await domConflictSnapshot(page);
        if (post.horizontalOverflowPx > 1) failures.push(`post-resolution horizontal overflow ${post.horizontalOverflowPx}px`);
        resolvedScreenshotPath = path.join(outputDir, `${scenario.name}-resolved.png`);
        await capture(page, resolvedScreenshotPath);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
    if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);

    const behavioralEvidence = {
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
      chosenResolution,
      pendingOperationsBeforeResolution: pendingBeforeResolution,
      pendingOperationsAtConflict: pendingAtConflict,
      pendingOperationsAfterResolution: pendingAfterResolution,
      conflictVisibleAfterResolution,
      executionRecovered: recovery?.executionRecovered ?? null,
      recovery,
      horizontalOverflow: pre?.horizontalOverflowPx ?? null,
      blockerCtaOverlap: pre?.blockerCtaOverlap ?? null,
      shellState: pre?.shellState ?? null,
      mutationCoverage: pre ? { main: pre.coverage, auxiliary: pre.auxiliaryCoverage } : null,
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
      theme: scenario.theme,
      resolution: scenario.resolution,
      requestCount: requestHistory.length,
      consoleErrors,
      pageErrors,
      behavioralEvidence,
      failures
    });

    console.log(
      failures.length
        ? `[AW-DATA-CONFLICT-QA] FAIL ${scenario.name}: ${failures.join(" | ")}`
        : `[AW-DATA-CONFLICT-QA] PASS ${scenario.name}`
    );
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) =>
  result.failures.map((failure) => `${result.name}: ${failure}`)
);
const coverage = {
  unresolvedZeroMutations: results.every((result) =>
    result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
  ),
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
  mobile320: results.some((result) => result.viewport.width === 320 && !result.failures.length),
  mobile390: results.some((result) => result.viewport.width === 390 && !result.failures.length),
  mobile430: results.some((result) => result.viewport.width === 430 && !result.failures.length),
  desktop: results.some((result) => result.viewport.width >= 1280 && !result.failures.length),
  rtl: results.some((result) =>
    result.language === "ar"
    && result.behavioralEvidence.direction === "rtl"
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
    && !result.failures.length
  ),
  setEntryMutations: results.some((result) =>
    result.behavioralEvidence.shellState === "set-entry"
    && result.behavioralEvidence.mutationCoverage?.main?.reps?.visible === 1
    && result.behavioralEvidence.mutationCoverage?.main?.weight?.visible === 1
    && result.behavioralEvidence.mutationCoverage?.main?.["set-path"]?.visible >= 1
    && result.behavioralEvidence.mutationCoverage?.auxiliary?.exerciseMutationControlCount >= 2
    && result.behavioralEvidence.mutationCoverage?.auxiliary?.navigatorMutationControlCount >= 1
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
  ),
  restMutations: results.some((result) =>
    result.behavioralEvidence.shellState === "rest"
    && result.behavioralEvidence.mutationCoverage?.main?.rest?.visible >= 1
    && result.behavioralEvidence.mutationCoverage?.main?.rest?.mutable === 0
    && result.behavioralEvidence.enabledExecutionMutationsBeforeResolution === 0
  )
};
const missingCoverage = Object.entries(coverage)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);
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
  requiredScenarioCount: 4,
  screenshotCount: results.reduce((count, result) =>
    count
      + (result.behavioralEvidence.unresolvedScreenshotPath ? 1 : 0)
      + (result.behavioralEvidence.resolvedScreenshotPath ? 1 : 0),
  0),
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
