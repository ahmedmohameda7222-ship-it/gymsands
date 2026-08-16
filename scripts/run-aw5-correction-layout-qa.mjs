import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  activityId,
  baseUrl,
  contract,
  dayRoute,
  directRoute,
  headSha,
  itemId,
  observations,
  outputDir,
  reportPayload,
  serverMode,
  setIds,
  snapshotId,
  writeReport
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

if (!headSha) throw new Error("QA_HEAD_SHA is required for exact-head Active Workout evidence.");
if (serverMode !== "production") throw new Error(`Active Workout rendered QA requires production mode, received ${serverMode}.`);

const evidenceDir = path.join(outputDir, "active-workout-redesign");
await mkdir(evidenceDir, { recursive: true });

const visualMatrix = [
  ["plan-day-set-entry-en-360x800", 360, 800, "en", "light", false],
  ["plan-day-set-entry-en-390x844", 390, 844, "en", "light", false],
  ["plan-day-set-entry-de-393x852", 393, 852, "de", "light", false],
  ["plan-day-set-entry-ar-430x932", 430, 932, "ar", "light", false],
  ["plan-day-set-entry-en-dark-768x1024", 768, 1024, "en", "dark", false],
  ["direct-set-entry-en-1024x768", 1024, 768, "en", "light", true],
  ["plan-day-set-entry-de-dark-1280x800", 1280, 800, "de", "dark", false],
  ["direct-set-entry-en-dark-1440x900", 1440, 900, "en", "dark", true],
  ["plan-day-set-entry-en-wide-1728x1000", 1728, 1000, "en", "light", false],
  ["plan-day-set-entry-en-tiny-320x568", 320, 568, "en", "light", false]
].map(([name, width, height, language, theme, direct]) => ({
  name,
  viewport: { width, height },
  language,
  theme,
  direct
}));

const stateMatrix = [
  { name: "plan-day-session-menu-en-390x844", action: "session-menu" },
  { name: "plan-day-details-en-390x844", action: "details" },
  { name: "plan-day-set-details-en-390x844", action: "set-details" },
  { name: "plan-day-exercise-actions-en-390x844", action: "exercise-actions" },
  { name: "plan-day-previous-performance-en-390x844", action: "previous", previous: "available" },
  { name: "plan-day-previous-failure-en-390x844", action: "previous-failure", previous: "failure" },
  { name: "plan-day-rest-en-390x844", action: "rest" },
  { name: "plan-day-paused-en-390x844", action: "paused" },
  { name: "plan-day-session-review-en-390x844", action: "review" },
  { name: "plan-day-completed-summary-en-390x844", action: "completion", records: "available" },
  { name: "plan-day-completed-summary-record-failure-en-390x844", action: "completion", records: "failure" },
  { name: "plan-day-keyboard-reps-en-390x844", action: "keyboard" },
  { name: "plan-day-200pct-text-zoom-en-1024x768", action: "zoom", viewport: { width: 1024, height: 768 } },
  { name: "plan-day-reduced-motion-en-390x844", action: "baseline", reducedMotion: "reduce" },
  { name: "plan-day-unsupported-nonstrength-en-390x844", action: "unsupported", unsupported: true },
  { name: "plan-day-details-ar-430x932", action: "details", language: "ar", viewport: { width: 430, height: 932 } },
  { name: "plan-day-session-review-de-768x1024", action: "review", language: "de", viewport: { width: 768, height: 1024 } },
  { name: "plan-day-completed-summary-dark-en-1440x900", action: "completion", theme: "dark", records: "empty", viewport: { width: 1440, height: 900 } }
].map((scenario) => ({
  viewport: { width: 390, height: 844 },
  language: "en",
  theme: "light",
  direct: false,
  previous: "empty",
  records: "empty",
  reducedMotion: "no-preference",
  unsupported: false,
  ...scenario
}));

function visible(page, selector) {
  return page.locator(`${selector}:visible`).first();
}

async function assertNoHorizontalOverflow(page, failures) {
  const geometry = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body ? document.body.scrollWidth - document.body.clientWidth : 0
  }));
  if (geometry.document > 1) failures.push(`document horizontal overflow ${geometry.document}px`);
  if (geometry.body > 1) failures.push(`body horizontal overflow ${geometry.body}px`);
}

async function assertPrimaryVisible(page, failures) {
  const primary = visible(page, "[data-aw5-primary-action]");
  if (!await primary.count()) {
    failures.push("dominant primary action is not visible");
    return;
  }
  const box = await primary.boundingBox();
  if (!box) failures.push("dominant primary action has no rendered box");
}

async function assertBaseline(page, scenario, failures) {
  const shell = visible(page, "[data-aw5-execution-shell]");
  await shell.waitFor({ state: "visible", timeout: 20_000 });
  const state = await shell.getAttribute("data-aw5-session-state");
  if (state !== "set-entry") failures.push(`unexpected baseline session state ${state}`);
  if (await page.locator("h2[data-aw5-exercise-title]:visible").count() !== 1) {
    failures.push("active exercise is not one semantic h2 heading");
  }
  if (!await visible(page, "[data-aw5-mini-heat-map-slot]").count()) failures.push("Mini Heat Map is missing");
  if (!await visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]').count()) failures.push("Session menu trigger is missing");
  if (!await visible(page, "[data-aw10-exercise-details-trigger]").count()) failures.push("Exercise Details trigger is missing");
  if (!scenario.direct && !await visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]').count()) failures.push("Exercise actions trigger is missing");
  if (!await visible(page, "[data-active-set-details-trigger]").count()) failures.push("Set Details trigger is missing");
  if (!await visible(page, "[data-aw10-current-target]").count()) failures.push("Frozen prescription target is missing");
  if (!await visible(page, "#active-set-reps").count()) failures.push("Reps input is missing");
  if (!await visible(page, "#active-set-weight").count()) failures.push("Weight input is missing");
  if (!await visible(page, "[data-aw5-set-path]").count()) failures.push("Set path is missing");
  await assertPrimaryVisible(page, failures);
  await assertNoHorizontalOverflow(page, failures);
  if (scenario.language === "ar") {
    const direction = await shell.getAttribute("dir");
    if (direction !== "rtl") failures.push(`Arabic shell direction is ${direction}, expected rtl`);
  }
}

async function installSecondaryRoutes(context, scenario) {
  await context.route(/\/api\/workouts\/active\/previous-performance(?:\?.*)?$/, async (route) => {
    if (scenario.previous === "failure") {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "qa previous failure" }) });
    }
    const data = scenario.previous === "available" ? {
      identity: { kind: "plan_exercise", value: contract.activeFirstExerciseId },
      workoutSessionId: "31000000-0000-4000-8000-000000000001",
      exerciseLogId: "32000000-0000-4000-8000-000000000001",
      setNumber: 1,
      reps: 8,
      weightKg: 80,
      performedAt: "2026-07-20T08:30:00.000Z"
    } : null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({ data })
    });
  });

  await context.route(/\/api\/workouts\/active\/[^/]+\/personal-records(?:\?.*)?$/, async (route) => {
    if (scenario.records === "failure") {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "qa record failure" }) });
    }
    const data = scenario.records === "available" ? [{
      id: "33000000-0000-4000-8000-000000000001",
      exerciseName: contract.activeFirstExerciseName,
      recordType: "highest_load",
      recordValue: 80,
      recordUnit: "kg",
      achievedAt: "2026-07-27T09:00:00.000Z"
    }] : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({ data })
    });
  });

  if (scenario.unsupported) {
    const target = {
      id: "34000000-0000-4000-8000-000000000001",
      prescription_set_id: setIds[0],
      snapshot_item_id: itemId,
      workout_session_id: contract.activeSessionId,
      user_id: contract.userId,
      metric_key: "distance_meters",
      metric_version: 1,
      side: "none",
      target_value: 5000,
      minimum_value: null,
      maximum_value: null,
      target_mode: "distance",
      created_at: "2026-07-27T08:00:00.000Z"
    };
    const definition = {
      metric_key: "distance_meters",
      metric_version: 1,
      value_kind: "decimal",
      minimum_value: 0,
      maximum_value: 1000000,
      supports_side: false
    };
    const sets = [1, 2].map((setOrder) => ({
      id: setIds[setOrder - 1],
      snapshot_item_id: itemId,
      snapshot_id: snapshotId,
      workout_session_id: contract.activeSessionId,
      user_id: contract.userId,
      set_order: setOrder,
      performed_order_hint: null,
      set_type: "working",
      target_mode: setOrder === 1 ? "distance" : "custom",
      side_mode: "none",
      rest_seconds: 90,
      tempo_target: null,
      schema_version: 1,
      created_at: "2026-07-27T08:00:00.000Z"
    }));
    await context.route(/\/rest\/v1\/workout_session_prescription_sets(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-1/2" },
      body: JSON.stringify(sets)
    }));
    await context.route(/\/rest\/v1\/workout_session_prescription_metric_targets(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([target])
    }));
    await context.route(/\/rest\/v1\/workout_performance_metric_definitions(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([definition])
    }));
  }
}

async function openSession(page, scenario) {
  const response = await page.goto(`${baseUrl}${scenario.direct ? directRoute : dayRoute}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  if (!response || response.status() >= 400) throw new Error(`session navigation failed with ${response?.status() ?? "no response"}`);
  if (scenario.unsupported) {
    await visible(page, "[data-aw10-unsupported-execution]").waitFor({ state: "visible", timeout: 20_000 });
  } else {
    await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(() => {
      const conflict = document.querySelector("[data-aw9-tab-conflict]");
      return !(conflict instanceof HTMLElement) || conflict.getClientRects().length === 0;
    }, undefined, { timeout: 15_000 });
  }
}

async function completeOneSet(page) {
  await page.locator("#active-set-reps").fill("8");
  await page.locator("#active-set-weight").fill("80");
  await visible(page, "[data-aw5-primary-action]").click({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 15_000 });
}

async function openSessionMenu(page) {
  await visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]').click({ timeout: 10_000 });
  const menu = visible(page, "[data-aw10-session-menu]");
  await page.waitForFunction(() => document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open", undefined, { timeout: 5_000 });
  return menu;
}

async function enterReview(page) {
  const menu = await openSessionMenu(page);
  const buttons = menu.locator('[role="menuitem"]:visible');
  if (await buttons.count() < 2) throw new Error("Session menu does not expose Finish Workout.");
  await buttons.nth(1).click({ timeout: 10_000 });
  await visible(page, "[data-aw7-review-surface]").waitFor({ state: "visible", timeout: 15_000 });
}

async function finishPartial(page) {
  const actions = visible(page, "[data-aw7-review-actions]");
  const finish = actions.getByRole("button", { name: /finish/i }).first();
  if (!await finish.count()) throw new Error("Review does not expose a semantic Finish action.");
  await finish.click({ timeout: 10_000 });
  const confirmation = visible(page, "[data-aw7-partial-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 10_000 });
  const confirmFinish = confirmation.getByRole("button", { name: /finish/i }).first();
  if (!await confirmFinish.count()) throw new Error("Partial confirmation does not expose a semantic Finish action.");
  await confirmFinish.click({ timeout: 10_000 });
  await visible(page, "[data-aw7-completion-surface]").waitFor({ state: "visible", timeout: 20_000 });
}

async function keyboardFill(page, failures) {
  let reachedReps = false;
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    if (id === "active-set-reps") {
      reachedReps = true;
      break;
    }
  }
  if (!reachedReps) {
    failures.push("keyboard traversal did not reach Reps input");
    return;
  }
  await page.keyboard.type("8");
  await page.keyboard.press("Tab");
  const activeId = await page.evaluate(() => document.activeElement?.id ?? "");
  if (activeId !== "active-set-weight") failures.push(`keyboard traversal reached ${activeId || "no id"}, expected Weight input`);
  else await page.keyboard.type("80");
}

async function exerciseScenario(page, scenario, failures) {
  if (scenario.unsupported) {
    if (await page.locator("#active-set-reps").count()) failures.push("unsupported non-Strength rendered Reps");
    if (await page.locator("#active-set-weight").count()) failures.push("unsupported non-Strength rendered Weight");
    if (await page.locator("[data-aw5-mini-heat-map-slot]").count()) failures.push("unsupported non-Strength rendered Strength Mini Heat Map");
    await assertNoHorizontalOverflow(page, failures);
    return;
  }

  await assertBaseline(page, scenario, failures);

  if (scenario.action === "session-menu") {
    const menu = await openSessionMenu(page);
    const buttons = menu.locator('[role="menuitem"]:visible');
    if (await buttons.count() !== 3) failures.push(`Session menu exposes ${await buttons.count()} actions, expected exactly 3`);
    const labels = await buttons.allTextContents();
    if (!labels.some((label) => /cancel|abbrechen|إلغاء/i.test(label))) failures.push("Session menu does not expose localized destructive Cancel Workout");
  } else if (scenario.action === "details") {
    await visible(page, "[data-aw10-exercise-details-trigger]").click();
    await page.waitForURL((url) => url.pathname === `/workouts/${activityId}` && url.searchParams.get("returnTo") === dayRoute, { timeout: 15_000 });
    if (page.url().includes("/workouts/session/")) failures.push("Exercise Name did not leave Active Workout for canonical Exercise Detail");
  } else if (scenario.action === "set-details") {
    await visible(page, "[data-active-set-details-trigger]").click();
    const section = visible(page, "[data-aw10-set-details-exact]");
    await section.waitFor({ state: "visible", timeout: 10_000 });
    for (const id of ["active-set-rpe", "active-set-rir", "active-set-type", "active-set-note"]) {
      if (!await section.locator(`#${id}`).count()) failures.push(`Set Details missing ${id}`);
    }
    if (await section.getByRole("button").count()) failures.push("Set Details contains an unrelated button/action");
  } else if (scenario.action === "exercise-actions") {
    await visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]').click();
    await page.waitForFunction(() => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open", undefined, { timeout: 5_000 });
    const menu = visible(page, "[data-aw10-exercise-actions]");
    const buttons = menu.locator('[role="menuitem"]:visible');
    if (await buttons.count() !== 3) failures.push(`Exercise Actions exposes ${await buttons.count()} actions, expected exactly 3`);
    const labels = (await buttons.allTextContents()).map((value) => value.trim()).filter(Boolean);
    if (!labels.some((value) => value.includes("ChatGPT"))) failures.push("Exercise Actions does not use Ask ChatGPT member-facing branding");
  } else if (scenario.action === "previous") {
    const performance = visible(page, "[data-aw10-previous-performance]");
    await performance.waitFor({ state: "visible", timeout: 10_000 });
    const use = performance.locator("button:visible");
    if (!await use.count()) failures.push("Previous Performance has no explicit Use action when data is available");
    else {
      await use.click();
      if (await page.locator("#active-set-reps").inputValue() !== "8") failures.push("Use did not copy previous repetitions");
      if (await page.locator("#active-set-weight").inputValue() !== "80") failures.push("Use did not copy previous weight");
    }
  } else if (scenario.action === "previous-failure") {
    const performance = visible(page, "[data-aw10-previous-performance]");
    await performance.waitFor({ state: "visible", timeout: 10_000 });
    if (!await visible(page, "#active-set-reps").count()) failures.push("Previous Performance failure blocked execution");
    await assertPrimaryVisible(page, failures);
  } else if (scenario.action === "rest") {
    await completeOneSet(page);
    if (!await visible(page, "[data-aw10-rest-state]").count()) failures.push("Rest did not become an independent dominant state");
    const presets = visible(page, "[data-aw5-rest-presets]").locator("button:visible");
    if (await presets.count() < 5) failures.push("Rest does not expose +30 seconds and required presets");
    await assertPrimaryVisible(page, failures);
    await visible(page, "[data-aw5-primary-action]").click();
  } else if (scenario.action === "paused") {
    const menu = await openSessionMenu(page);
    await menu.locator('[role="menuitem"]:visible').first().click();
    await visible(page, "[data-aw10-paused-state]").waitFor({ state: "visible", timeout: 10_000 });
    if (await page.locator("[data-aw5-primary-action]:visible").count()) failures.push("Paused state still exposes Complete Set / primary execution action");
    const resume = visible(page, "[data-aw10-paused-state]").locator("button:visible");
    if (!await resume.count()) failures.push("Paused state has no dominant Resume action");
  } else if (scenario.action === "review") {
    await enterReview(page);
    if (await page.locator("[data-aw10-pr-post-save-only]:visible").count()) failures.push("Review exposes Personal Records before terminal save");
    if (!await visible(page, "#finish-notes").count()) failures.push("Review note editor is missing");
  } else if (scenario.action === "completion") {
    await completeOneSet(page);
    await visible(page, "[data-aw5-primary-action]").click();
    await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") !== "rest", undefined, { timeout: 10_000 });
    await enterReview(page);
    await finishPartial(page);
    const records = visible(page, "[data-aw10-pr-post-save-only]");
    if (scenario.records === "available") {
      await records.waitFor({ state: "visible", timeout: 10_000 });
    } else {
      await page.waitForTimeout(500);
      if (await page.locator("[data-aw10-pr-post-save-only]:visible").count()) {
        failures.push("Completion exposes Personal Records without canonical records");
      }
    }
    if (!await visible(page, "[data-aw7-final-muscle-load]").count()) failures.push("Completion is missing final muscle analysis");
    if (!await page.locator('[data-aw7-completion-surface] a[href^="/workout-history/"]:visible').count()) failures.push("Completion lacks canonical View Workout Details link");
    if (scenario.records === "failure" && !await visible(page, "[data-aw7-completion-surface]").count()) failures.push("Personal Records failure invalidated completion");
  } else if (scenario.action === "keyboard") {
    await keyboardFill(page, failures);
  } else if (scenario.action === "zoom") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.waitForTimeout(100);
    await assertNoHorizontalOverflow(page, failures);
    await assertPrimaryVisible(page, failures);
  }

  await assertNoHorizontalOverflow(page, failures);
}

async function runScenario(browser, scenario) {
  const requestHistory = [];
  const observation = {
    name: scenario.name,
    viewport: scenario.viewport,
    language: scenario.language,
    theme: scenario.theme,
    action: scenario.action ?? "baseline",
    direct: scenario.direct,
    bootstrapFailed: false,
    failures: [],
    metrics: null,
    requests: requestHistory
  };
  observations.push(observation);
  console.log(`[AW5-QA] START ${scenario.name}`);

  const context = await browser.newContext({
    viewport: scenario.viewport,
    reducedMotion: scenario.reducedMotion ?? "no-preference",
    colorScheme: scenario.theme === "dark" ? "dark" : "light"
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => observation.failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const expectedSecondaryFailure = (scenario.previous === "failure" || scenario.records === "failure")
      && /Failed to load resource: the server responded with a status of 503/i.test(text);
    if (!expectedSecondaryFailure) observation.failures.push(`console error: ${text}`);
  });

  try {
    await installAw5CorrectionFixture(context, {
      direct: scenario.direct,
      language: scenario.language,
      theme: scenario.theme,
      delayCanonical: false,
      muscleScenario: "ready",
      includeGuide: true
    }, requestHistory);
    await installSecondaryRoutes(context, scenario);
    await openSession(page, scenario);
    await exerciseScenario(page, scenario, observation.failures);
    const screenshotPath = path.join(evidenceDir, `${scenario.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
    observation.screenshot = path.relative(outputDir, screenshotPath);
  } catch (error) {
    observation.bootstrapFailed = true;
    observation.failures.push(error instanceof Error ? error.message : String(error));
    try {
      const screenshotPath = path.join(evidenceDir, `${scenario.name}-failure.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      observation.screenshot = path.relative(outputDir, screenshotPath);
    } catch {
      // Preserve the original failure.
    }
  } finally {
    await context.close();
  }

  if (observation.failures.length) {
    console.error(`[AW5-QA] FAIL ${scenario.name} ${observation.failures.join(" | ")}`);
  } else {
    console.log(`[AW5-QA] PASS ${scenario.name}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of [...visualMatrix.map((item) => ({
    ...item,
    action: "baseline",
    previous: "empty",
    records: "empty",
    reducedMotion: "no-preference",
    unsupported: false
  })), ...stateMatrix]) {
    await runScenario(browser, scenario);
  }
} finally {
  await browser.close();
}

await writeReport();
await writeFile(
  path.join(evidenceDir, "active-workout-redesign-evidence.json"),
  `${JSON.stringify({
    headSha,
    serverMode,
    requiredViewports: visualMatrix.map((item) => item.viewport),
    scenarioCount: observations.length,
    screenshotCount: observations.filter((item) => item.screenshot).length,
    failures: reportPayload().failures
  }, null, 2)}\n`,
  "utf8"
);

const failures = reportPayload().failures;
if (failures.length) {
  throw new Error(`Active Workout redesign rendered QA failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
}
console.log(`[AW5-QA] PASS ${observations.length} Active Workout redesign scenarios at ${headSha}`);
