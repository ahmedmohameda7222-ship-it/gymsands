import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  activityId,
  baseUrl,
  contract,
  dayRoute,
  headSha,
  serverMode,
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";

if (!headSha) {
  throw new Error("QA_HEAD_SHA is required for exact-head replacement request stability evidence.");
}
if (serverMode !== "production") {
  throw new Error(`Replacement request stability QA requires production mode, received ${serverMode}.`);
}

const rootEvidenceDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "active-workout-aw10"),
);
const evidenceDir = path.join(rootEvidenceDir, "replacement-request-stability");
await mkdir(evidenceDir, { recursive: true });

const scenarioName = "replacement-request-stability-across-live-timer-rerenders-390x844";
const replacementDetailId = "11111111-1111-4111-8111-111111111121";
const replacementDetailName = "Dumbbell Goblet Squat";

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

async function openExerciseMenu(page) {
  const trigger = visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]');
  await trigger.click();
  await page.waitForFunction(
    () => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open",
  );
  return visible(page, "[data-aw10-exercise-actions]");
}

function replacementCatalogPayload(url) {
  const meta = {
    apiVersion: "v2",
    locale: url.searchParams.get("locale") || "en",
    libraryRelease: {
      id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
      version: "qa-active-workout",
      checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
      publishedAt: "2026-08-16T00:00:00.000Z",
      strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a",
    },
    catalogRelease: {
      id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
      version: "qa-active-workout",
      checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271",
    },
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
  if (url.pathname === `${base}/filters` || url.pathname === `${base}/archetypes`) {
    return { data: [], meta };
  }
  if (url.pathname === `${base}/activities`) {
    return {
      data: activities,
      pagination: { limit: 50, returned: activities.length, nextCursor: null },
      meta,
    };
  }
  if (url.pathname.endsWith("/alternatives")) return { data: [], meta };
  if (url.pathname.startsWith(`${base}/activities/`)) {
    const id = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    const activity = activities.find((item) => item.id === id) ?? activities[0];
    return {
      data: {
        ...activity,
        prescriptionSchema: {
          id: "77777777-7777-4777-8777-777777777777",
          key: "resistance_sets",
          version: 1,
          checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          fields: [],
        },
        performedMetricSchema: null,
        recordDefinitions: [],
        heatMap: {
          mapping: [{ muscleName: "Quadriceps", role: "primary", broadGroup: "Lower Body" }],
        },
        publicationPolicy: {
          id: "88888888-8888-4888-8888-888888888888",
          key: "published_library",
          version: 1,
          checksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        capabilityContract: {
          id: "99999999-9999-4999-8999-999999999999",
          version: "qa",
          compatibleCatalogApiVersion: "v2",
          checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
        authority: {
          libraryRelease: meta.libraryRelease,
          catalogRelease: meta.catalogRelease,
          activityId: activity.id,
          revisionId: activity.revisionId,
          revisionNumber: 1,
        },
      },
      meta,
    };
  }
  return { data: [], meta };
}

async function waitForTimerChange(timer, previousValue) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await timer.page().waitForTimeout(100);
    const currentValue = (await timer.innerText()).trim();
    if (currentValue && currentValue !== previousValue) return currentValue;
  }
  throw new Error(`Workout elapsed timer did not advance from ${previousValue}.`);
}

async function waitForRequestCount(getCount, expected) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (getCount() >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Replacement logical request count did not reach ${expected}; observed ${getCount()}.`);
}

const observation = {
  scenarioName,
  exactHeadSha: headSha,
  viewport: { width: 390, height: 844 },
  timerSamples: [],
  timerTicksCrossed: 0,
  baselineRequestCount: null,
  requestCountAfterUnchangedTimerRerenders: null,
  requestCountAfterReasonChange: null,
  candidateTextBeforeTicks: [],
  candidateTextAfterTicks: [],
  failedReplacementRequests: [],
  failures: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: observation.viewport });
const requestHistory = [];
const page = await context.newPage();
let sourceDetailRequestCount = 0;
let replacementSurfaceStarted = false;

page.on("pageerror", (error) => observation.failures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/ERR_ABORTED/i.test(message.text())) {
    observation.failures.push(`console error: ${message.text()}`);
  }
});
page.on("requestfailed", (request) => {
  if (!replacementSurfaceStarted) return;
  const url = request.url();
  if (!url.includes("/api/activity-catalog/") && !url.includes("get_workout_replacement_candidate_eligibility")) return;
  observation.failedReplacementRequests.push({
    url,
    errorText: request.failure()?.errorText ?? null,
  });
});

try {
  await installAw5CorrectionFixture(context, {
    direct: false,
    language: "en",
    theme: "light",
    restSeconds: 90,
    muscleScenario: "ready",
    includeGuide: true,
  }, requestHistory);

  const sourceDetailPath = `/api/activity-catalog/library-domains/strength/activities/${activityId}`;
  await context.route("**/api/activity-catalog/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === sourceDetailPath) sourceDetailRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify(replacementCatalogPayload(url)),
    });
  });

  await context.route(/\/rest\/v1\/rpc\/get_workout_replacement_candidate_eligibility(?:\?.*)?$/, async (route) => {
    let payload = {};
    try {
      payload = route.request().postDataJSON();
    } catch {
      payload = {};
    }
    const candidates = Array.isArray(payload?.p_candidates) ? payload.p_candidates : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(candidates.map((candidate) => ({ key: candidate.key, eligible: true, reason: null }))),
    });
  });

  await page.goto(`${baseUrl}${dayRoute}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForActiveShell(page);

  const countBeforeOpen = sourceDetailRequestCount;
  const menu = await openExerciseMenu(page);
  replacementSurfaceStarted = true;
  await menu.locator('[role="menuitem"]').first().click();

  const replacement = visible(page, "[data-aw-replacement-recommendations]");
  await replacement.waitFor({ state: "visible", timeout: 10_000 });
  await replacement.locator("ol li").first().waitFor({ state: "visible", timeout: 15_000 });

  observation.baselineRequestCount = sourceDetailRequestCount - countBeforeOpen;
  check(
    observation.baselineRequestCount === 1,
    `Initial replacement surface issued ${observation.baselineRequestCount} logical recommendation requests; expected 1.`,
  );

  observation.candidateTextBeforeTicks = await replacement.locator("ol li").allInnerTexts();
  check(observation.candidateTextBeforeTicks.length > 0, "Replacement recommendations were not visible before timer stability measurement.");

  const elapsedTimer = page.locator('[data-aw5-header] span[dir="ltr"]').first();
  await elapsedTimer.waitFor({ state: "visible", timeout: 10_000 });
  observation.timerSamples.push((await elapsedTimer.innerText()).trim());

  for (let tick = 0; tick < 2; tick += 1) {
    const previous = observation.timerSamples.at(-1);
    const next = await waitForTimerChange(elapsedTimer, previous);
    observation.timerSamples.push(next);
    observation.timerTicksCrossed += 1;
    check(
      sourceDetailRequestCount - countBeforeOpen === observation.baselineRequestCount,
      `Timer-driven rerender ${tick + 1} triggered a replacement recommendation refetch.`,
    );
  }

  await page.waitForTimeout(250);
  observation.requestCountAfterUnchangedTimerRerenders = sourceDetailRequestCount - countBeforeOpen;
  check(
    observation.requestCountAfterUnchangedTimerRerenders === observation.baselineRequestCount,
    `Unchanged timer rerenders changed logical request count from ${observation.baselineRequestCount} to ${observation.requestCountAfterUnchangedTimerRerenders}.`,
  );

  observation.candidateTextAfterTicks = await replacement.locator("ol li").allInnerTexts();
  check(
    JSON.stringify(observation.candidateTextAfterTicks) === JSON.stringify(observation.candidateTextBeforeTicks),
    "Replacement recommendations changed during semantically unchanged timer rerenders.",
  );
  check(
    observation.failedReplacementRequests.length === 0,
    `Replacement requests failed or were aborted during unchanged timer rerenders: ${JSON.stringify(observation.failedReplacementRequests)}.`,
  );

  const reasonButtons = replacement.locator('button[aria-pressed]');
  check(await reasonButtons.count() >= 2, "Replacement reason controls are unavailable.");
  const expectedAfterReason = sourceDetailRequestCount + 1;
  await reasonButtons.nth(1).click();
  await waitForRequestCount(() => sourceDetailRequestCount, expectedAfterReason);
  await page.waitForTimeout(350);

  observation.requestCountAfterReasonChange = sourceDetailRequestCount - countBeforeOpen;
  check(
    observation.requestCountAfterReasonChange === observation.baselineRequestCount + 1,
    `One replacement reason change produced ${observation.requestCountAfterReasonChange - observation.baselineRequestCount} additional logical requests; expected 1.`,
  );
  check(
    await reasonButtons.nth(1).getAttribute("aria-pressed") === "true",
    "Replacement reason change did not remain selected after refresh.",
  );
  await replacement.locator("ol li").first().waitFor({ state: "visible", timeout: 10_000 });
  check(observation.failedReplacementRequests.length === 0, "Replacement surface produced a failed request during the stability scenario.");

  await page.screenshot({
    path: path.join(evidenceDir, `${scenarioName}.png`),
    fullPage: true,
  });
} catch (error) {
  observation.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await writeFile(
    path.join(evidenceDir, "replacement-request-stability-results.json"),
    `${JSON.stringify(observation, null, 2)}\n`,
    "utf8",
  );
  await context.close();
  await browser.close();
}

if (observation.failures.length) {
  console.error(`[ACTIVE-WORKOUT-REPLACEMENT-STABILITY-QA] FAIL ${observation.failures.join(" | ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `[ACTIVE-WORKOUT-REPLACEMENT-STABILITY-QA] PASS ${scenarioName} at ${headSha}: ${observation.timerTicksCrossed} live timer ticks, ${observation.baselineRequestCount} baseline logical request, ${observation.requestCountAfterUnchangedTimerRerenders} after unchanged rerenders, ${observation.requestCountAfterReasonChange} after reason change.`,
  );
}
