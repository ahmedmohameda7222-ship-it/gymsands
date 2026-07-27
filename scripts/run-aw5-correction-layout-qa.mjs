import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve(
  process.env.QA_TRAIN_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "train-phase0b-phase1")
);
const contract = JSON.parse(
  await readFile(new URL("../lib/fixtures/train-mock-contract.json", import.meta.url), "utf8")
);
const activePlanId = contract.planIds.active;
const activeDayId = contract.activeDayId;
const activityId = "11111111-1111-4111-8111-111111111111";
const exerciseName = "Barbell squat with a deliberately long activity name for responsive verification";
const observations = [];
let scenarioSequence = 100;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

function sessionIdentity() {
  scenarioSequence += 1;
  return `20000000-0000-4000-8000-${String(scenarioSequence).padStart(12, "0")}`;
}

function intersects(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function sessionRoot(sessionId, direct) {
  return {
    id: sessionId,
    user_id: contract.userId,
    workout_id: direct ? activityId : null,
    plan_id: direct ? null : activePlanId,
    plan_day_id: direct ? null : activeDayId,
    workout_name: direct ? exerciseName : "Strength A",
    workout_day_name: direct ? null : "Strength A",
    workout_category: "strength",
    started_at: "2026-07-27T08:00:00.000Z",
    completed_at: null,
    skipped_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
}

function catalogPayload(url) {
  const activity = {
    id: activityId,
    slug: "barbell_squat",
    name: exerciseName,
    shortDescription: "A deterministic strength activity for AW-5 rendered verification.",
    instructions: [{ order: 1, text: "Brace, move with control, and stop if the movement feels painful." }],
    difficulty: "intermediate",
    movementPattern: "squat",
    version: 1,
    activityType: { id: "22222222-2222-4222-8222-222222222222", slug: "strength", name: "Strength" },
    metricSchema: null,
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: [{ id: "33333333-3333-4333-8333-333333333333", slug: "barbell", name: "Barbell", isRequired: true }],
    muscles: [{ id: "44444444-4444-4444-8444-444444444444", slug: "quadriceps", name: "Quadriceps", role: "primary" }],
    trainingGoals: [],
    translations: {},
    guideUrl: "https://example.com/catalog-guide",
    videoUrl: "https://example.com/catalog-video",
    updatedAt: "2026-07-27T00:00:00.000Z"
  };
  const meta = { source: "external", degraded: false, catalogVersion: "v1", locale: "en" };
  if (url.pathname.endsWith("/filters")) {
    return {
      data: {
        sports: [], activityTypes: [activity.activityType], sessionTypes: [], sessionPhases: [],
        equipment: activity.equipment, trainingGoals: [], difficulties: ["intermediate"]
      },
      meta
    };
  }
  if (url.pathname.endsWith("/alternatives")) return { data: [], meta };
  if (/\/activities\/[^/]+$/.test(url.pathname)) return { data: activity, meta };
  if (url.pathname.endsWith("/activities")) {
    return { data: [activity], pagination: { limit: 30, offset: 0, returned: 1, nextOffset: null }, meta };
  }
  if (url.pathname.endsWith("/sports")) return { data: [], meta };
  return { data: { sport: activity.activityType, sessionTypes: [], sessionPhases: [] }, meta };
}

async function installFixture(context, { sessionId, direct, language, theme, delayCanonical }) {
  const root = sessionRoot(sessionId, direct);
  const snapshotId = `21000000-0000-4000-8000-${String(scenarioSequence).padStart(12, "0")}`;
  const itemId = `22000000-0000-4000-8000-${String(scenarioSequence).padStart(12, "0")}`;
  const sourceExerciseId = direct ? null : contract.activeFirstExerciseId;
  const item = {
    id: itemId,
    snapshot_id: snapshotId,
    user_id: contract.userId,
    item_order: 1,
    source_plan_exercise_id: sourceExerciseId,
    source_plan_activity_id: direct ? activityId : null,
    activity_name_snapshot: direct ? exerciseName : contract.activeFirstExerciseName,
    planned_prescription: { sets: 1, reps: "8-10", rest_seconds: 90 },
    planned_sets: 1,
    state: "planned"
  };
  const set = {
    id: `23000000-0000-4000-8000-${String(scenarioSequence).padStart(12, "0")}`,
    snapshot_item_id: itemId,
    snapshot_id: snapshotId,
    workout_session_id: sessionId,
    user_id: contract.userId,
    set_order: 1,
    performed_order_hint: null,
    set_type: "working",
    target_mode: "custom",
    side_mode: "none",
    rest_seconds: 90,
    tempo_target: null,
    schema_version: 1,
    created_at: "2026-07-27T08:00:00.000Z"
  };
  const settings = {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: contract.userId,
    theme_id: theme === "dark" ? "elite-noir" : "olive",
    theme,
    accent_color: theme === "dark" ? "elite-noir" : "olive",
    language,
    weight_unit: "kg",
    height_unit: "cm",
    distance_unit: "km",
    liquid_unit: "ml",
    energy_unit: "kcal",
    body_measurement_unit: "cm",
    week_starts_on: "monday",
    default_start_page: "today",
    compact_mode: false,
    reduce_animations: true,
    large_text_mode: false,
    quick_log_sections: ["workout"],
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z"
  };

  await context.addCookies([{
    name: "plaivra.language.v1",
    value: language,
    url: baseUrl,
    sameSite: "Lax"
  }]);
  await context.addInitScript(({ languageValue, themeId }) => {
    localStorage.setItem("plaivra.qa.train-scenario", "active");
    localStorage.setItem("plaivra.qa.train-variant", "active-default-success");
    localStorage.setItem("plaivra.language.v1", languageValue);
    localStorage.setItem("plaivra-theme-id", themeId);
  }, {
    languageValue: language,
    themeId: theme === "dark" ? "elite-noir" : "olive"
  });

  await context.route("**/api/activity-catalog/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store", "x-plaivra-qa-fixture": "aw5-correction-catalog" },
      body: JSON.stringify(catalogPayload(url))
    });
  });
  await context.route(/\/api\/workouts\/sessions\/[^/]+\/muscle-analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store", "x-plaivra-qa-fixture": "aw5-correction-heat-map" },
      body: JSON.stringify({
        sessionId,
        snapshotId,
        snapshotSchemaVersion: "workout_session_muscle_snapshot_v1",
        frozenAt: "2026-07-27T08:00:00.000Z",
        source: "session_start",
        snapshotCompleteness: "complete",
        reasonCodes: [],
        effectiveCompleteness: "complete",
        effectiveWarnings: [],
        analysis: {
          schemaVersion: "muscle_analysis_result_v1",
          taxonomyVersion: "muscle_taxonomy_v1",
          engineVersion: "muscle_load_resistance_sets_v1",
          thresholdVersion: "muscle_load_thresholds_v1",
          mode: "planned",
          period: { kind: "session" },
          completeness: "complete",
          muscles: [], contributionBreakdown: [], mappingVersionsUsed: [],
          coverage: { totalItemCount: 1, includedItemCount: 1, unmappedItemCount: 0, unsupportedItemCount: 0 },
          warnings: []
        }
      })
    });
  });

  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathName = url.pathname;
    const wantsObject = (request.headers().accept || "").includes("application/vnd.pgrst.object");

    if (method === "POST" && pathName.includes("/rest/v1/rpc/start_or_resume_workout_session_atomic")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: root, resumed: true }) });
      return;
    }
    if (method === "POST" && pathName.includes("/rest/v1/rpc/start_or_resume_direct_workout_session_atomic")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: root, resumed: true }) });
      return;
    }
    if (method === "GET" && pathName.includes("/rest/v1/workout_sessions")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify(wantsObject ? root : [root]) });
      return;
    }
    if (method === "GET" && pathName.includes("/rest/v1/workout_session_muscle_snapshots")) {
      const snapshot = { id: snapshotId, workout_session_id: sessionId, user_id: contract.userId };
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify(wantsObject ? snapshot : [snapshot]) });
      return;
    }
    if (method === "GET" && pathName.includes("/rest/v1/workout_session_muscle_snapshot_items")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify([item]) });
      return;
    }
    if (method === "GET" && pathName.includes("/rest/v1/workout_session_prescription_sets")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify([set]) });
      return;
    }
    if (method === "GET" && (
      pathName.includes("/rest/v1/workout_session_prescription_metric_targets")
      || pathName.includes("/rest/v1/workout_performance_metric_definitions")
      || pathName.includes("/rest/v1/exercise_logs")
      || pathName.includes("/rest/v1/user_exercise_alternatives")
      || pathName.includes("/rest/v1/user_progression_targets")
    )) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "*/0" }, body: "[]" });
      return;
    }
    if (method === "POST" && pathName.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {
      if (delayCanonical) await new Promise((resolve) => setTimeout(resolve, 2500));
      const payload = request.postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: payload?.p_logs?.length ?? 1, deleted: 0 }) });
      return;
    }
    if (method === "POST" && pathName.includes("/rest/v1/rpc/complete_workout_session_atomic")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...root, status: "completed", completed_at: "2026-07-27T09:00:00.000Z" }) });
      return;
    }
    if (pathName.includes("/rest/v1/user_app_settings") && (method === "GET" || method === "HEAD")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/1", "x-plaivra-qa-fixture": "localized-settings" }, body: method === "HEAD" ? "" : JSON.stringify(wantsObject ? settings : [settings]) });
      return;
    }

    let body = {};
    if (method !== "GET" && method !== "HEAD") {
      try { body = request.postDataJSON(); } catch { body = {}; }
    }
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0", "x-plaivra-qa-fixture": "aw5-correction-empty" },
      body: method === "HEAD" ? "" : JSON.stringify(method === "GET" ? [] : body)
    });
  });
}

async function cleanChrome(page) {
  return page.evaluate(() => {
    const details = [];
    let overlay = false;
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot;
      if (!root) continue;
      const text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const candidate = root.querySelector("nextjs-errors-dialog, nextjs-error-dialog, [data-nextjs-error-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]");
      if (candidate || /(?:Build Error|Unhandled Runtime Error|Runtime Error|Failed to compile|\d+ Issue)/i.test(text)) {
        overlay = true;
        details.push(text.slice(0, 500));
      }
    }
    return { overlay, details };
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const rects = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
      });
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      close: rect("[data-workout-session-close]"),
      heatMap: rect("[data-aw5-mini-heat-map-slot]"),
      sessionTitle: rect("[data-aw5-session-title]"),
      metadata: rect("[data-aw5-metadata]"),
      pause: rect("[data-aw5-pause-resume]"),
      sticky: rect("[data-aw5-sticky-actions]"),
      reps: rect("#active-set-reps"),
      weight: rect("#active-set-weight"),
      details: rect("[data-active-set-details-trigger]"),
      setPath: rect("[data-aw5-set-path]"),
      restPresets: rects("[data-aw5-rest-presets] button"),
      feedback: rect("[data-aw5-feedback]"),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      directHeadings: [...document.querySelectorAll("h1,h2")].filter(visible).map((element) => ({
        tag: element.tagName,
        text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
        rect: (() => { const value = element.getBoundingClientRect(); return { top: value.top, height: value.height }; })()
      }))
    };
  });
}

function geometryFailures(metrics, { initial320 = false, direct = false, restPresetCheck = false, keyboard = false } = {}) {
  const failures = [];
  for (const [name, rect] of [
    ["Mini Heat Map", metrics.heatMap],
    ["session title", metrics.sessionTitle],
    ["metadata", metrics.metadata],
    ["Pause/Resume", metrics.pause]
  ]) {
    if (intersects(metrics.close, rect)) failures.push(`close intersects ${name}`);
  }
  for (const [name, rect] of [
    ["reps input", metrics.reps],
    ["weight input", metrics.weight],
    ["details trigger", metrics.details],
    ["set path", metrics.setPath],
    ["validation feedback", metrics.feedback]
  ]) {
    if (intersects(metrics.sticky, rect)) failures.push(`sticky intersects ${name}`);
  }
  if (restPresetCheck) {
    metrics.restPresets.forEach((rect, index) => {
      if (intersects(metrics.sticky, rect)) failures.push(`sticky intersects rest preset ${index + 1}`);
    });
  }
  if (initial320) {
    if (!metrics.setPath || metrics.setPath.top < 0 || metrics.setPath.bottom > metrics.viewport.height) {
      failures.push("set path is not fully visible in the initial 320x568 viewport");
    }
    if (!metrics.sticky || metrics.sticky.top < 0 || metrics.sticky.bottom > metrics.viewport.height + 1) {
      failures.push("primary CTA is not fully visible in the initial 320x568 viewport");
    }
    if (metrics.sticky && Math.abs(metrics.viewport.height - metrics.sticky.bottom) > 2) {
      failures.push("session CTA leaves an unnecessary mobile-navigation gap");
    }
  }
  if (direct) {
    const largeStartHeading = metrics.directHeadings.some((heading) => /^Start\b/i.test(heading.text) && heading.rect.height > 32);
    const exerciseHeadings = metrics.directHeadings.filter((heading) => heading.text === exerciseName);
    if (largeStartHeading) failures.push("loaded direct route contains a route-level Start heading");
    if (exerciseHeadings.length !== 1) failures.push(`direct exercise heading count is ${exerciseHeadings.length}, expected 1`);
  }
  if (keyboard && metrics.sticky && metrics.reps && metrics.reps.bottom > metrics.sticky.top) {
    failures.push("focused mobile input cannot be scrolled above the sticky CTA");
  }
  if (metrics.horizontalOverflowPx > 1) failures.push(`horizontal overflow is ${metrics.horizontalOverflowPx}px`);
  return failures;
}

async function openSession({ name, route, viewport, language = "en", theme = "light", delayCanonical = false }) {
  const direct = route.startsWith("/workouts/session/") && !route.startsWith("/workouts/session/day/");
  const sessionId = sessionIdentity();
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: theme });
  await installFixture(context, { sessionId, direct, language, theme, delayCanonical });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("[data-aw5-execution-shell]", { timeout: 30_000 });
  await page.waitForFunction((expected) => document.documentElement.lang === expected, language, { timeout: 20_000 });
  await page.waitForTimeout(150);
  return { name, direct, sessionId, context, page, response, pageErrors, consoleErrors, consoleWarnings };
}

async function record(session, options = {}) {
  const { page, context, name, direct, response, pageErrors, consoleErrors, consoleWarnings } = session;
  const metrics = await geometry(page);
  const chrome = await cleanChrome(page);
  const unexpectedWarnings = consoleWarnings.filter((message) => !/Reduced Motion enabled on your device/i.test(message));
  const failures = [
    ...geometryFailures(metrics, { ...options, direct }),
    ...pageErrors.map((message) => `page error: ${message}`),
    ...consoleErrors.map((message) => `console error: ${message}`),
    ...unexpectedWarnings.map((message) => `console warning: ${message}`)
  ];
  if (chrome.overlay) failures.push(`framework overlay detected: ${chrome.details.join(" | ")}`);
  const artifact = `${name}.png`;
  await page.screenshot({ path: path.join(outputDir, artifact), fullPage: false });
  observations.push({
    name,
    route: page.url(),
    status: response?.status() ?? null,
    artifact,
    metrics,
    chrome,
    pageErrors,
    consoleErrors,
    consoleWarnings,
    failures
  });
  await context.close();
}

const dayRoute = `/workouts/session/day/${activeDayId}`;
const directRoute = `/workouts/session/${activityId}`;

for (const scenario of [
  { name: "plan-day-set-entry-en-320x568", route: dayRoute, viewport: { width: 320, height: 568 }, options: { initial320: true } },
  { name: "plan-day-set-entry-en-390x844", route: dayRoute, viewport: { width: 390, height: 844 } },
  { name: "direct-set-entry-en-390x844", route: directRoute, viewport: { width: 390, height: 844 } },
  { name: "direct-set-entry-en-1440x900", route: directRoute, viewport: { width: 1440, height: 900 } },
  { name: "plan-day-set-entry-ar-390x844", route: dayRoute, viewport: { width: 390, height: 844 }, language: "ar" },
  { name: "plan-day-set-entry-de-390x844", route: dayRoute, viewport: { width: 390, height: 844 }, language: "de" },
  { name: "plan-day-set-entry-dark-en-1440x900", route: dayRoute, viewport: { width: 1440, height: 900 }, theme: "dark" }
]) {
  const session = await openSession(scenario);
  await record(session, scenario.options);
}

{
  const session = await openSession({ name: "plan-day-paused-en-390x844", route: dayRoute, viewport: { width: 390, height: 844 } });
  await session.page.locator("[data-aw5-pause-resume]").click();
  await session.page.waitForSelector('[data-aw5-session-state="paused"]');
  await session.page.waitForFunction(() => document.querySelector("[data-aw5-primary-action]:not([hidden])")?.textContent?.match(/resume/i));
  await record(session);
}

{
  const session = await openSession({ name: "plan-day-validation-error-en-390x844", route: dayRoute, viewport: { width: 390, height: 844 } });
  await session.page.locator("#active-set-reps").fill("");
  await session.page.locator("#active-set-weight").fill("40");
  const action = session.page.locator("[data-aw5-sticky-actions] [data-aw5-primary-action]");
  await action.click();
  await session.page.waitForFunction(() => (document.querySelector("[data-aw5-feedback]")?.textContent?.trim().length ?? 0) > 0);
  await record(session);
}

{
  const session = await openSession({ name: "plan-day-busy-en-390x844", route: dayRoute, viewport: { width: 390, height: 844 }, delayCanonical: true });
  await session.page.locator("#active-set-reps").fill("8");
  await session.page.locator("#active-set-weight").fill("80");
  await session.page.locator("[data-aw5-sticky-actions] [data-aw5-primary-action]").click();
  await session.page.waitForFunction(() => document.querySelector("[data-aw5-sticky-actions]")?.getAttribute("aria-busy") === "true");
  await record(session);
}

{
  const session = await openSession({ name: "plan-day-rest-en-390x844", route: dayRoute, viewport: { width: 390, height: 844 } });
  await session.page.locator("#active-set-reps").fill("8");
  await session.page.locator("#active-set-weight").fill("80");
  await session.page.locator("[data-aw5-sticky-actions] [data-aw5-primary-action]").click();
  await session.page.waitForSelector('[data-aw5-session-state="rest"]', { timeout: 20_000 });
  await session.page.locator("[data-aw5-rest-presets]").scrollIntoViewIfNeeded();
  await record(session, { restPresetCheck: true });
}

for (const scenario of [
  { name: "plan-day-details-ar-390x844", viewport: { width: 390, height: 844 }, language: "ar", theme: "light" },
  { name: "plan-day-details-dark-en-1440x900", viewport: { width: 1440, height: 900 }, language: "en", theme: "dark" }
]) {
  const session = await openSession({ ...scenario, route: dayRoute });
  await session.page.locator("[data-active-set-details-trigger]").click();
  await session.page.waitForSelector("[data-active-set-details-dialog]");
  await record(session);
}

{
  const session = await openSession({ name: "plan-day-session-review-en-1440x900", route: dayRoute, viewport: { width: 1440, height: 900 } });
  await session.page.getByRole("button", { name: /^Finish$/i }).click();
  await session.page.waitForSelector("[data-aw5-session-review]");
  await record(session);
}

for (const field of ["#active-set-reps", "#active-set-weight"]) {
  const suffix = field.endsWith("reps") ? "reps" : "weight";
  const session = await openSession({ name: `plan-day-keyboard-${suffix}-en-390x844`, route: dayRoute, viewport: { width: 390, height: 844 } });
  await session.page.setViewportSize({ width: 390, height: 464 });
  const input = session.page.locator(field);
  await input.focus();
  await input.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await session.page.waitForTimeout(100);
  await record(session, { keyboard: true });
}

await browser.close();

const failures = observations.flatMap((item) => item.failures.map((failure) => `${item.name}: ${failure}`));
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  productionRendered: true,
  requiredStates: {
    setEntry: observations.some((item) => item.name.includes("set-entry")),
    direct: observations.some((item) => item.name.startsWith("direct-set-entry")),
    busy: observations.some((item) => item.name.includes("busy")),
    validationError: observations.some((item) => item.name.includes("validation-error")),
    rest: observations.some((item) => item.name.includes("rest")),
    paused: observations.some((item) => item.name.includes("paused")),
    details: observations.some((item) => item.name.includes("details")),
    review: observations.some((item) => item.name.includes("session-review"))
  },
  observations,
  failures
};
await writeFile(
  path.join(outputDir, "aw5-correction-layout-qa-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
if (failures.length) {
  console.error(`AW-5 correction layout QA failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`AW-5 correction layout QA passed with ${observations.length} clean production-rendered observations.`);
}
