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
  serverMode,
  snapshotId,
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

if (!headSha) throw new Error("QA_HEAD_SHA is required for exact-head full Active Workout authority evidence.");
if (serverMode !== "production") throw new Error(`Full Active Workout authority QA requires production mode, received ${serverMode}.`);

const rootEvidenceDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "active-workout-aw10"),
);
const evidenceDir = path.join(rootEvidenceDir, "full-authority");
await mkdir(evidenceDir, { recursive: true });

const results = [];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function visible(page, selector) {
  return page.locator(`${selector}:visible`).first();
}

async function waitForActiveShell(page) {
  await visible(page, "[data-aw5-execution-shell]").waitFor({ state: "visible", timeout: 20_000 });
  const conflict = page.locator("[data-aw9-tab-conflict]:visible");
  if (await conflict.count()) {
    const continueButton = conflict.getByRole("button").first();
    if (await continueButton.count()) await continueButton.click();
    await conflict.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  }
}

async function openSessionMenu(page) {
  const trigger = visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]');
  await trigger.click();
  await page.waitForFunction(() => document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open");
  return visible(page, "[data-aw10-session-menu]");
}

async function openExerciseMenu(page) {
  const trigger = visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]');
  await trigger.click();
  await page.waitForFunction(() => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open");
  return visible(page, "[data-aw10-exercise-actions]");
}

async function completeCurrentSet(page, reps = "8", weight = "32.5") {
  await page.locator("#active-set-reps").fill(reps);
  await page.locator("#active-set-weight").fill(weight);
  await visible(page, "[data-aw5-primary-action]").click();
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body ? document.body.scrollWidth - document.body.clientWidth : 0,
  ));
  check(overflow <= 1, `horizontal overflow ${overflow}px`);
}

function multiExerciseRows(restSeconds = 2) {
  const names = [contract.activeFirstExerciseName, "Bench Press", "Row", "Plank"];
  const activityIds = [
    activityId,
    "11111111-1111-4111-8111-111111111112",
    "11111111-1111-4111-8111-111111111113",
    "11111111-1111-4111-8111-111111111114",
  ];
  const items = names.map((name, index) => ({
    id: `22000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    snapshot_id: snapshotId,
    user_id: contract.userId,
    item_order: index + 1,
    source_plan_exercise_id: `${contract.activeFirstExerciseId.slice(0, -1)}${index + 1}`,
    source_plan_activity_id: activityIds[index],
    activity_name_snapshot: name,
    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: restSeconds },
    planned_sets: 2,
    state: "planned",
  }));
  const sets = items.flatMap((item, exerciseIndex) => [1, 2].map((setOrder) => {
    const sequence = exerciseIndex * 2 + setOrder;
    return {
      id: `23000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      snapshot_item_id: item.id,
      snapshot_id: snapshotId,
      workout_session_id: contract.activeSessionId,
      user_id: contract.userId,
      set_order: setOrder,
      performed_order_hint: null,
      set_type: "working",
      target_mode: "custom",
      side_mode: "none",
      rest_seconds: restSeconds,
      tempo_target: null,
      schema_version: 1,
      created_at: "2026-07-27T08:00:00.000Z",
    };
  }));
  return { items, sets };
}

async function installMultiExerciseOverrides(context) {
  const { items, sets } = multiExerciseRows();
  await context.route(/\/rest\/v1\/workout_session_muscle_snapshot_items(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-${items.length - 1}/${items.length}` }, body: JSON.stringify(items) });
  });
  await context.route(/\/rest\/v1\/workout_session_prescription_sets(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": `0-${sets.length - 1}/${sets.length}` }, body: JSON.stringify(sets) });
  });
}

const replacementDetailId = "11111111-1111-4111-8111-111111111121";
const replacementDetailName = "Dumbbell Goblet Squat";

function replacementCatalogPayload(url) {
  const meta = {
    apiVersion: "v2",
    locale: url.searchParams.get("locale") || "en",
    libraryRelease: { id: "d985375c-a97e-592b-832c-ccf6226e1ae9", version: "qa-active-workout", checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e", publishedAt: "2026-08-16T00:00:00.000Z", strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a" },
    catalogRelease: { id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca", version: "qa-active-workout", checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271" },
    source: "library_v2",
    degraded: false,
  };
  const make = (id, name, equipment, difficulty, movementPattern = "squat") => ({
    id,
    revisionId: `${id.slice(0, 24)}${id.slice(24)}`,
    revisionNumber: 1,
    revisionLifecycle: "published",
    revisionChecksum: null,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    name,
    shortDescription: `QA replacement candidate ${name}`,
    instructions: [{ order: 1, text: "Move with controlled form." }],
    difficulty,
    movementPattern,
    activityType: { slug: "strength", name: "Strength" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
    aliases: [],
    equipment: [{ slug: equipment.toLowerCase().replace(/\s+/g, "_"), name: equipment, requirement: "required" }],
    coverage: [{ name: "Quadriceps", muscleName: "Quadriceps", role: "primary", bodyRegion: "Lower Body", broadGroup: "Lower Body" }],
    executionProfiles: [{ filterProfile: { difficulty, movementFamily: movementPattern } }],
    bodyEffects: [],
    guideUrl: null,
    videoUrl: null,
  });
  const activities = [
    make(activityId, contract.activeFirstExerciseName, "Barbell", "intermediate"),
    make(replacementDetailId, replacementDetailName, "Dumbbell", "intermediate"),
    make("11111111-1111-4111-8111-111111111122", "Bodyweight Box Squat", "Bodyweight", "beginner"),
    make("11111111-1111-4111-8111-111111111123", "Leg Press", "Machine", "intermediate", "knee_dominant"),
  ];
  const base = "/api/activity-catalog/library-domains/strength";
  if (url.pathname === `${base}/filters` || url.pathname === `${base}/archetypes`) return { data: [], meta };
  if (url.pathname === `${base}/activities`) return { data: activities, pagination: { limit: 50, returned: activities.length, nextCursor: null }, meta };
  if (url.pathname.endsWith("/alternatives")) return { data: [], meta };
  if (url.pathname.startsWith(`${base}/activities/`)) {
    const id = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    const activity = activities.find((item) => item.id === id) ?? activities[0];
    return {
      data: {
        ...activity,
        prescriptionSchema: { id: "77777777-7777-4777-8777-777777777777", key: "resistance_sets", version: 1, checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", fields: [] },
        performedMetricSchema: null,
        recordDefinitions: [],
        heatMap: { mapping: [{ muscleName: "Quadriceps", role: "primary", broadGroup: "Lower Body" }] },
        publicationPolicy: { id: "88888888-8888-4888-8888-888888888888", key: "published_library", version: 1, checksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        capabilityContract: { id: "99999999-9999-4999-8999-999999999999", version: "qa", compatibleCatalogApiVersion: "v2", checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
        authority: { libraryRelease: meta.libraryRelease, catalogRelease: meta.catalogRelease, activityId: activity.id, revisionId: activity.revisionId, revisionNumber: 1 },
      },
      meta,
    };
  }
  return { data: [], meta };
}

async function installReplacementOverrides(context, enableCanonicalReplacement = false) {
  let replacementApplied = false;
  const replacementItem = () => ({
    id: itemId, snapshot_id: snapshotId, user_id: contract.userId, item_order: 1,
    source_plan_exercise_id: contract.activeFirstExerciseId, source_plan_activity_id: activityId,
    activity_name_snapshot: contract.activeFirstExerciseName,
    actual_target_type: replacementApplied ? "global_exercise" : null,
    actual_global_exercise_id: replacementApplied ? replacementDetailId : null,
    actual_custom_exercise_id: null, actual_provider: null, actual_provider_activity_id: null,
    actual_name_snapshot: replacementApplied ? replacementDetailName : null,
    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: 90 }, planned_sets: 2,
    state: replacementApplied ? "replaced" : "planned"
  });
  if (enableCanonicalReplacement) {
    await context.route(/\/rest\/v1\/workout_session_muscle_snapshot_items(?:\?.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify([replacementItem()]) });
    });
    await context.route(/\/rest\/v1\/rpc\/replace_workout_session_snapshot_item_atomic(?:\?.*)?$/, async (route) => {
      const payload = route.request().postDataJSON();
      check(payload?.p_replacement_identity === replacementDetailId, `Replacement RPC used unexpected identity ${payload?.p_replacement_identity}.`);
      replacementApplied = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(replacementItem()) });
    });
  }
  await context.route("**/api/activity-catalog/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify(replacementCatalogPayload(url)) });
  });
  await context.route(/\/rest\/v1\/rpc\/get_workout_replacement_candidate_eligibility(?:\?.*)?$/, async (route) => {
    let payload = {};
    try { payload = route.request().postDataJSON(); } catch { payload = {}; }
    const candidates = Array.isArray(payload?.p_candidates) ? payload.p_candidates : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates.map((candidate) => ({ key: candidate.key, eligible: true, reason: null }))) });
  });
  return { replacementDetailId, replacementDetailName, wasApplied: () => replacementApplied };
}

async function runScenario(browser, scenario) {
  const observation = { name: scenario.name, failures: [], screenshot: null };
  results.push(observation);
  const context = await browser.newContext({
    viewport: scenario.viewport ?? { width: 390, height: 844 },
    colorScheme: scenario.theme === "dark" ? "dark" : "light",
    reducedMotion: scenario.reducedMotion ?? "no-preference",
  });
  const requestHistory = [];
  let fixture;
  const page = await context.newPage();
  page.on("pageerror", (error) => observation.failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const expected = scenario.allow503 && /503|Failed to load resource/i.test(text);
    if (!expected && !/ERR_ABORTED/i.test(text)) observation.failures.push(`console error: ${text}`);
  });
  try {
    fixture = await installAw5CorrectionFixture(context, {
      direct: Boolean(scenario.direct),
      language: scenario.language ?? "en",
      theme: scenario.theme ?? "light",
      delayCanonical: Boolean(scenario.delayCanonical),
      canonicalSetFailure: Boolean(scenario.canonicalSetFailure),
      restSeconds: scenario.restSeconds ?? 90,
      muscleScenario: "ready",
      includeGuide: true,
    }, requestHistory);
    if (scenario.multiExercise) await installMultiExerciseOverrides(context);
    const replacementAuthority = scenario.replacementCatalog
      ? await installReplacementOverrides(context, Boolean(scenario.replacementApply))
      : null;
    const route = scenario.direct ? directRoute : dayRoute;
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    check(response && response.status() < 400, `session navigation failed: ${response?.status() ?? "no response"}`);
    await waitForActiveShell(page);
    await scenario.run({ page, context, fixture, replacementAuthority });
    await assertNoHorizontalOverflow(page);
  } catch (error) {
    observation.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      const suffix = observation.failures.length ? "-failure" : "";
      const screenshotPath = path.join(evidenceDir, `${scenario.name}${suffix}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      observation.screenshot = path.relative(rootEvidenceDir, screenshotPath);
    } catch {
      // Preserve the primary scenario result.
    }
    await context.close();
  }
}

const scenarios = [
  {
    name: "input-blank-zero-field-validation-390x844",
    run: async ({ page }) => {
      const reps = page.locator("#active-set-reps");
      const weight = page.locator("#active-set-weight");
      check(await weight.inputValue() === "", "Weight did not start visually blank.");
      check(await weight.getAttribute("placeholder") !== "0", "Blank Weight is visually indistinguishable from real zero.");
      await weight.fill("0");
      check(await weight.inputValue() === "0", "A real 0 kg value was not preserved as an actual value.");
      await reps.fill("8.5");
      await visible(page, "#active-set-reps-error").waitFor({ state: "visible" });
      await page.waitForTimeout(700);
      check(await visible(page, "#active-set-reps-error").count() === 1, "Invalid reps error auto-dismissed while invalid.");
      await reps.fill("8");
      await visible(page, "#active-set-reps-error").waitFor({ state: "hidden" });
      await weight.fill("-1");
      await visible(page, "#active-set-weight-error").waitFor({ state: "visible" });
      check(await weight.inputValue() === "-1", "Invalid weight input was erased.");
      await weight.fill("0");
      await visible(page, "#active-set-weight-error").waitFor({ state: "hidden" });
      check(!(await page.locator("body").innerText()).includes("Enter the required values."), "Generic permanent input message remains visible.");
    },
  },
  {
    name: "transient-menu-mutual-exclusion-390x844",
    run: async ({ page }) => {
      await openSessionMenu(page);
      await openExerciseMenu(page);
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Session menu stayed open behind Exercise menu.");
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "open", "Exercise menu did not open.");
      await openSessionMenu(page);
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind Session menu.");
      await page.locator("#active-set-reps").click();
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Outside click did not close Session menu.");
      const trigger = visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]');
      await trigger.click();
      await page.keyboard.press("Escape");
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Escape did not close Session menu.");
      await page.waitForTimeout(50);
      check(await page.evaluate(() => document.activeElement?.getAttribute("data-aw-menu-trigger")) === "session", "Escape did not restore focus to the menu trigger.");
      const exerciseMenu = await openExerciseMenu(page);
      await exerciseMenu.locator('[role="menuitem"]').first().click();
      await visible(page, "[data-aw6-details-adjust-today]").waitFor({ state: "visible", timeout: 10_000 });
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind replacement surface.");
    },
  },
  {
    name: "canonical-exercise-detail-draft-return-390x844",
    run: async ({ page }) => {
      await page.locator("#active-set-reps").fill("8");
      await page.locator("#active-set-weight").fill("32.5");
      await visible(page, "[data-aw10-exercise-details-trigger]").click();
      await page.waitForURL((url) => url.pathname === `/workouts/${activityId}` && url.searchParams.get("returnTo") === dayRoute, { timeout: 20_000 });
      check(await page.locator("[data-aw6-details-overview]:visible").count() === 0, "Exercise title still opened the retired Active Workout overview drawer.");
      await page.getByText(contract.activeFirstExerciseName, { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
      const back = page.locator(`a[href="${dayRoute}"]`).first();
      await back.waitFor({ state: "visible", timeout: 10_000 });
      await back.click();
      await page.waitForURL((url) => url.pathname === dayRoute, { timeout: 20_000 });
      await waitForActiveShell(page);
      await page.waitForFunction(() => document.querySelector("#active-set-reps")?.value === "8" && document.querySelector("#active-set-weight")?.value === "32.5", undefined, { timeout: 15_000 });
      check(await page.locator("#active-set-reps").inputValue() === "8", "Reps draft was lost after Exercise Detail return.");
      check(await page.locator("#active-set-weight").inputValue() === "32.5", "Weight draft was lost after Exercise Detail return.");
    },
  },
  {
    name: "exercise-navigator-canonical-cursor-pause-rest-430x932",
    viewport: { width: 430, height: 932 },
    multiExercise: true,
    restSeconds: 2,
    run: async ({ page }) => {
      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      const navigator = visible(page, "[data-aw-exercise-navigator]");
      await navigator.waitFor({ state: "visible" });
      const rows = navigator.locator("ol button");
      check(await rows.count() === 4, `Exercise Navigator rendered ${await rows.count()} rows instead of 4.`);
      for (const name of [contract.activeFirstExerciseName, "Bench Press", "Row", "Plank"]) check((await navigator.innerText()).includes(name), `Exercise Navigator missing ${name}.`);
      check(await rows.first().getAttribute("aria-current") === "step", "Current exercise semantics are missing.");
      await rows.nth(1).click();
      await page.getByRole("heading", { name: "Bench Press", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      await visible(page, "[data-aw-exercise-navigator]").locator("ol button").first().click();
      await page.getByRole("heading", { name: contract.activeFirstExerciseName, exact: true }).waitFor({ state: "visible", timeout: 10_000 });

      const menu = await openSessionMenu(page);
      await menu.locator('[role="menuitem"]').first().click();
      await visible(page, "[data-aw10-paused-state]").waitFor({ state: "visible", timeout: 10_000 });
      check(await page.locator("[data-aw10-paused-elapsed]:visible").count() === 1, "Paused state does not preserve elapsed context.");
      check(await page.locator("[data-aw5-primary-action]:visible").count() === 0, "Paused state exposes a duplicate global primary action.");
      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      const pausedRows = visible(page, "[data-aw-exercise-navigator]").locator("ol button");
      check(await pausedRows.nth(1).isDisabled(), "Paused navigator allowed a cursor mutation.");
      await page.keyboard.press("Escape");
      await visible(page, "[data-aw10-paused-state]").getByRole("button", { name: /resume/i }).click();
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry");

      await completeCurrentSet(page);
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 5_000 });
      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      await visible(page, "[data-aw-exercise-navigator]").locator("ol button").nth(1).click();
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry", undefined, { timeout: 10_000 });
      await page.getByRole("heading", { name: "Bench Press", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    },
  },
  {
    name: "replacement-intelligence-reason-aware-390x844",
    replacementCatalog: true,
    run: async ({ page }) => {
      const menu = await openExerciseMenu(page);
      await menu.locator('[role="menuitem"]').first().click();
      const replacement = visible(page, "[data-aw-replacement-recommendations]");
      await replacement.waitFor({ state: "visible", timeout: 10_000 });
      const recommendations = replacement.locator("ol li");
      await recommendations.first().waitFor({ state: "visible", timeout: 15_000 });
      check(await recommendations.count() >= 2, "Intelligent replacement did not render multiple eligible candidates.");
      const firstText = await recommendations.first().innerText();
      check(!firstText.includes(contract.activeFirstExerciseName), "Replacement ranking recommended the original unavailable exercise.");
      check(/Quadriceps|primary|movement|equipment/i.test(firstText), "Replacement result does not explain structured ranking evidence.");
      const pain = replacement.getByRole("button", { name: /pain|discomfort/i }).first();
      await pain.click();
      await page.waitForTimeout(100);
      const replacementText = await replacement.innerText();
      check(!/safe for pain/i.test(replacementText), "Pain replacement UI made an unsupported medical safety claim.");
      check(await replacement.getByRole("button", { name: /browse all/i }).count() === 1, "Replacement fallback does not expose Browse all exercises.");
    },
  },
  {
    name: "replacement-exercise-detail-identity-390x844",
    replacementCatalog: true,
    replacementApply: true,
    run: async ({ page, replacementAuthority }) => {
      const menu = await openExerciseMenu(page);
      await menu.locator('[role="menuitem"]').first().click();
      const replacement = visible(page, "[data-aw-replacement-recommendations]");
      await replacement.locator("ol li").first().waitFor({ state: "visible", timeout: 15_000 });
      const firstRecommendation = replacement.locator("ol li").first();
      check((await firstRecommendation.innerText()).includes(replacementAuthority.replacementDetailName), "Expected deterministic replacement candidate was not first.");
      await firstRecommendation.getByRole("button", { name: /^Replace$/i }).click();
      await page.getByRole("heading", { name: replacementAuthority.replacementDetailName, exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      check(replacementAuthority.wasApplied(), "Canonical replacement RPC was not acknowledged.");
      await visible(page, "[data-aw10-exercise-details-trigger]").click();
      await page.waitForURL((url) => url.pathname === `/workouts/${replacementAuthority.replacementDetailId}` && url.searchParams.get("returnTo") === dayRoute, { timeout: 20_000 });
      await page.getByText(replacementAuthority.replacementDetailName, { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
      const back = page.locator(`a[href="${dayRoute}"]`).first();
      await back.click();
      await page.waitForURL((url) => url.pathname === dayRoute, { timeout: 20_000 });
      await waitForActiveShell(page);
      await page.getByRole("heading", { name: replacementAuthority.replacementDetailName, exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    },
  },
  {
    name: "optimistic-complete-network-delay-390x844",
    delayCanonical: true,
    run: async ({ page, fixture }) => {
      await completeCurrentSet(page, "8", "32.5");
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 750 });
      check(fixture.canonicalSettled() === false, "Canonical request settled before optimistic-state assertion could prove latency independence.");
      check(fixture.performedLogsSnapshot().length === 0, "Canonical log existed before delayed persistence was released.");
      fixture.releaseCanonical();
      await fixture.waitForCanonical();
      await page.waitForTimeout(150);
      check(fixture.performedLogsSnapshot().length === 1, `Canonical reconciliation produced ${fixture.performedLogsSnapshot().length} logs instead of one.`);
    },
  },
  {
    name: "optimistic-hard-failure-rollback-auto-dismiss-390x844",
    delayCanonical: true,
    canonicalSetFailure: true,
    allow503: true,
    run: async ({ page, fixture }) => {
      await completeCurrentSet(page, "9", "32.5");
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 750 });
      fixture.releaseCanonical();
      await fixture.waitForCanonical();
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry", undefined, { timeout: 10_000 });
      check(await page.locator("#active-set-reps").inputValue() === "9", "Rollback lost the entered reps.");
      check(await page.locator("#active-set-weight").inputValue() === "32.5", "Rollback lost the entered weight.");
      check(fixture.performedLogsSnapshot().length === 0, "Rollback left a phantom completed set.");
      const feedback = page.locator("[data-aw5-feedback]");
      await page.waitForFunction(() => (document.querySelector("[data-aw5-feedback]")?.textContent || "").trim().length > 0, undefined, { timeout: 5_000 });
      const firstMessage = (await feedback.innerText()).trim();
      check(firstMessage.length > 0, "Rollback produced no readable transient error.");
      await page.waitForTimeout(5_500);
      check((await feedback.innerText()).trim() === "", "Recoverable error did not auto-dismiss after the centralized error duration.");
      check(await visible(page, "[data-aw5-primary-action]").isEnabled(), "User cannot retry after rollback.");
    },
  },
  {
    name: "natural-rest-expiry-next-context-390x844",
    restSeconds: 1,
    run: async ({ page }) => {
      await completeCurrentSet(page);
      const rest = visible(page, "[data-aw10-rest-state]");
      await rest.waitFor({ state: "visible", timeout: 2_000 });
      const restText = await rest.innerText();
      check(restText.includes(contract.activeFirstExerciseName), "Rest state does not identify the next exercise.");
      check(/2\s*(of|\/|von|من)\s*2/i.test(restText) || restText.includes("2/2"), "Rest state does not identify the next set context.");
      check(await rest.getByRole("button").filter({ hasText: "+30" }).count() === 1, "Rest content duplicates +30 control.");
      check(await page.locator("[data-aw5-primary-action]:visible").count() === 1, "Rest does not expose exactly one sticky dominant Skip Rest action.");
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry", undefined, { timeout: 5_000 });
    },
  },
  {
    name: "long-exercise-title-chevron-mobile-320x568",
    viewport: { width: 320, height: 568 },
    direct: true,
    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");
      const box = await title.boundingBox();
      check(Boolean(box) && box.width <= 320, "Long exercise title/chevron target exceeds the mobile viewport.");
      check(await title.locator("svg").count() === 1, "Exercise Detail navigation chevron is missing beside the title.");
    },
  },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of scenarios) await runScenario(browser, scenario);
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => result.failures.map((failure) => `${result.name}: ${failure}`));
const report = {
  schemaVersion: 1,
  authority: "active-workout-full-product-authority",
  headSha,
  serverMode,
  scenarioCount: results.length,
  screenshotCount: results.filter((result) => result.screenshot).length,
  requiredViewportComplement: ["320x568", "390x844", "430x932"],
  results,
  failures,
};
await writeFile(path.join(evidenceDir, "active-workout-full-authority-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (failures.length) throw new Error(`Full Active Workout rendered authority failed:\n${failures.join("\n")}`);
console.log(`Full Active Workout rendered authority passed ${results.length} scenarios at ${headSha}.`);
