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
const dayRoute = `/workouts/session/day/${contract.activeDayId}`;
const activityId = "11111111-1111-4111-8111-111111111111";
const directRoute = `/workouts/session/${activityId}`;
const exerciseName = "Barbell squat with a deliberately long activity name for responsive verification";
const observations = [];
let sequence = 100;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

function nextId(prefix) {
  sequence += 1;
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function overlaps(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
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
        sports: [],
        activityTypes: [activity.activityType],
        sessionTypes: [],
        sessionPhases: [],
        equipment: activity.equipment,
        trainingGoals: [],
        difficulties: ["intermediate"]
      },
      meta
    };
  }
  if (url.pathname.endsWith("/alternatives")) return { data: [], meta };
  if (/\/activities\/[^/]+$/.test(url.pathname)) return { data: activity, meta };
  if (url.pathname.endsWith("/activities")) {
    return {
      data: [activity],
      pagination: { limit: 30, offset: 0, returned: 1, nextOffset: null },
      meta
    };
  }
  if (url.pathname.endsWith("/sports")) return { data: [], meta };
  return { data: { sport: activity.activityType, sessionTypes: [], sessionPhases: [] }, meta };
}

async function installFixture(context, { direct, language, theme, delayCanonical }) {
  const sessionId = nextId("2");
  const snapshotId = nextId("3");
  const itemId = nextId("4");
  const sourceExerciseId = direct ? null : contract.activeFirstExerciseId;
  const root = {
    id: sessionId,
    user_id: contract.userId,
    workout_id: direct ? activityId : null,
    plan_id: direct ? null : contract.planIds.active,
    plan_day_id: direct ? null : contract.activeDayId,
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
  const item = {
    id: itemId,
    snapshot_id: snapshotId,
    user_id: contract.userId,
    item_order: 1,
    source_plan_exercise_id: sourceExerciseId,
    source_plan_activity_id: direct ? activityId : null,
    activity_name_snapshot: direct ? exerciseName : contract.activeFirstExerciseName,
    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: 90 },
    planned_sets: 2,
    state: "planned"
  };
  const prescriptionSets = [1, 2].map((setOrder) => ({
    id: nextId("5"),
    snapshot_item_id: itemId,
    snapshot_id: snapshotId,
    workout_session_id: sessionId,
    user_id: contract.userId,
    set_order: setOrder,
    performed_order_hint: null,
    set_type: "working",
    target_mode: "custom",
    side_mode: "none",
    rest_seconds: 90,
    tempo_target: null,
    schema_version: 1,
    created_at: "2026-07-27T08:00:00.000Z"
  }));
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store",
        "x-plaivra-qa-fixture": "aw5-correction-catalog"
      },
      body: JSON.stringify(catalogPayload(new URL(route.request().url())))
    });
  });

  await context.route(/\/api\/workouts\/sessions\/[^/]+\/muscle-analysis(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store",
        "x-plaivra-qa-fixture": "aw5-correction-heat-map"
      },
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
          muscles: [],
          contributionBreakdown: [],
          mappingVersionsUsed: [],
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
    const pathname = url.pathname;
    const wantsObject = (request.headers().accept || "").includes("application/vnd.pgrst.object");

    const json = async (body, status = 200, headers = {}) => route.fulfill({
      status,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body)
    });

    if (method === "POST" && pathname.includes("/rest/v1/rpc/start_or_resume_workout_session_atomic")) {
      await json({ session: root, resumed: true });
      return;
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/start_or_resume_direct_workout_session_atomic")) {
      await json({ session: root, resumed: true });
      return;
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_sessions")) {
      await json(wantsObject ? root : [root], 200, { "content-range": "0-0/1" });
      return;
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_muscle_snapshots")) {
      const snapshot = { id: snapshotId, workout_session_id: sessionId, user_id: contract.userId };
      await json(wantsObject ? snapshot : [snapshot], 200, { "content-range": "0-0/1" });
      return;
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_muscle_snapshot_items")) {
      await json([item], 200, { "content-range": "0-0/1" });
      return;
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_prescription_sets")) {
      await json(prescriptionSets, 200, { "content-range": "0-1/2" });
      return;
    }
    if (method === "GET" && (
      pathname.includes("/rest/v1/workout_session_prescription_metric_targets")
      || pathname.includes("/rest/v1/workout_performance_metric_definitions")
      || pathname.includes("/rest/v1/exercise_logs")
      || pathname.includes("/rest/v1/user_exercise_alternatives")
      || pathname.includes("/rest/v1/user_progression_targets")
    )) {
      await json([], 200, { "content-range": "*/0" });
      return;
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {
      if (delayCanonical) await new Promise((resolve) => setTimeout(resolve, 3000));
      const payload = request.postDataJSON();
      await json({ saved: payload?.p_logs?.length ?? 1, deleted: 0 });
      return;
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/complete_workout_session_atomic")) {
      await json({ ...root, status: "completed", completed_at: "2026-07-27T09:00:00.000Z" });
      return;
    }
    if (pathname.includes("/rest/v1/user_app_settings") && (method === "GET" || method === "HEAD")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "content-range": "0-0/1",
          "x-plaivra-qa-fixture": "localized-settings"
        },
        body: method === "HEAD" ? "" : JSON.stringify(wantsObject ? settings : [settings])
      });
      return;
    }

    let body = {};
    if (method !== "GET" && method !== "HEAD") {
      try { body = request.postDataJSON(); } catch { body = {}; }
    }
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: {
        "content-range": "0-0/0",
        "x-plaivra-qa-fixture": "aw5-correction-empty"
      },
      body: method === "HEAD" ? "" : JSON.stringify(method === "GET" ? [] : body)
    });
  });
}

async function frameworkChrome(page) {
  return page.evaluate(() => {
    const details = [];
    let detected = false;
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot;
      if (!root) continue;
      const text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const overlay = root.querySelector(
        "nextjs-errors-dialog, nextjs-error-dialog, [data-nextjs-error-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]"
      );
      if (overlay || /(?:Build Error|Unhandled Runtime Error|Runtime Error|Failed to compile|\d+ Issue)/i.test(text)) {
        detected = true;
        details.push(text.slice(0, 500));
      }
    }
    return { detected, details };
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
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };
    const rects = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => {
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          right: value.right,
          top: value.top,
          bottom: value.bottom,
          width: value.width,
          height: value.height
        };
      });
    return {
      viewport: { width: innerWidth, height: innerHeight },
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
      headings: [...document.querySelectorAll("h1,h2")].filter(visible).map((element) => {
        const value = element.getBoundingClientRect();
        return {
          text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
          height: value.height,
          top: value.top
        };
      })
    };
  });
}

function geometryFailures(metrics, options = {}) {
  const failures = [];
  for (const [name, target] of [
    ["Mini Heat Map", metrics.heatMap],
    ["session title", metrics.sessionTitle],
    ["metadata", metrics.metadata],
    ["Pause/Resume", metrics.pause]
  ]) {
    if (overlaps(metrics.close, target)) failures.push(`close intersects ${name}`);
  }
  for (const [name, target] of [
    ["reps input", metrics.reps],
    ["weight input", metrics.weight],
    ["details trigger", metrics.details],
    ["set path", metrics.setPath],
    ["validation feedback", metrics.feedback]
  ]) {
    if (overlaps(metrics.sticky, target)) failures.push(`sticky intersects ${name}`);
  }
  if (options.restPresets) {
    metrics.restPresets.forEach((target, index) => {
      if (overlaps(metrics.sticky, target)) failures.push(`sticky intersects rest preset ${index + 1}`);
    });
  }
  if (options.initial320) {
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
  if (options.direct) {
    const routeHero = metrics.headings.some((heading) => /^Start\b/i.test(heading.text) && heading.height > 32);
    const exerciseHeadings = metrics.headings.filter((heading) => heading.text === exerciseName);
    if (routeHero) failures.push("loaded direct route contains a route-level Start heading");
    if (exerciseHeadings.length !== 1) {
      failures.push(`direct exercise heading count is ${exerciseHeadings.length}, expected 1`);
    }
  }
  if (options.keyboard && metrics.sticky && metrics[options.keyboard] && metrics[options.keyboard].bottom > metrics.sticky.top) {
    failures.push(`focused ${options.keyboard} input cannot be scrolled above the sticky CTA`);
  }
  if (metrics.horizontalOverflowPx > 1) failures.push(`horizontal overflow is ${metrics.horizontalOverflowPx}px`);
  return failures;
}

async function openSession({
  name,
  route = dayRoute,
  viewport,
  language = "en",
  theme = "light",
  delayCanonical = false
}) {
  const direct = route === directRoute;
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    colorScheme: theme
  });
  await installFixture(context, { direct, language, theme, delayCanonical });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await page.waitForSelector("[data-aw5-execution-shell]", { timeout: 30_000 });
  await page.waitForFunction(
    (expected) => document.documentElement.lang === expected,
    language,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(150);
  return {
    name,
    direct,
    context,
    page,
    response,
    pageErrors,
    consoleErrors,
    consoleWarnings
  };
}

async function record(session, options = {}) {
  const metrics = await geometry(session.page);
  const chrome = await frameworkChrome(session.page);
  const warnings = session.consoleWarnings.filter(
    (message) => !/Reduced Motion enabled on your device/i.test(message)
  );
  const failures = [
    ...geometryFailures(metrics, { ...options, direct: session.direct }),
    ...session.pageErrors.map((message) => `page error: ${message}`),
    ...session.consoleErrors.map((message) => `console error: ${message}`),
    ...warnings.map((message) => `console warning: ${message}`)
  ];
  if (chrome.detected) failures.push(`framework overlay detected: ${chrome.details.join(" | ")}`);
  const artifact = `${session.name}.png`;
  await session.page.screenshot({
    path: path.join(outputDir, artifact),
    fullPage: false
  });
  observations.push({
    name: session.name,
    route: session.page.url(),
    status: session.response?.status() ?? null,
    artifact,
    metrics,
    chrome,
    pageErrors: session.pageErrors,
    consoleErrors: session.consoleErrors,
    consoleWarnings: session.consoleWarnings,
    failures
  });
  await session.context.close();
}

function visiblePrimary(page) {
  return page.locator("[data-aw5-primary-action]:visible").first();
}

async function enterSet(page, reps = "8", weight = "80") {
  await page.locator("#active-set-reps").fill(reps);
  await page.locator("#active-set-weight").fill(weight);
}

for (const scenario of [
  { name: "plan-day-set-entry-en-320x568", viewport: { width: 320, height: 568 }, options: { initial320: true } },
  { name: "plan-day-set-entry-en-390x844", viewport: { width: 390, height: 844 } },
  { name: "direct-set-entry-en-390x844", route: directRoute, viewport: { width: 390, height: 844 } },
  { name: "direct-set-entry-en-1440x900", route: directRoute, viewport: { width: 1440, height: 900 } },
  { name: "plan-day-set-entry-ar-390x844", viewport: { width: 390, height: 844 }, language: "ar" },
  { name: "plan-day-set-entry-de-390x844", viewport: { width: 390, height: 844 }, language: "de" },
  { name: "plan-day-set-entry-dark-en-1440x900", viewport: { width: 1440, height: 900 }, theme: "dark" }
]) {
  const session = await openSession(scenario);
  if (session.direct) {
    const sessionTitle = await session.page.locator("[data-aw5-session-title]").innerText();
    if (sessionTitle.trim() !== "Workout session") {
      session.consoleErrors.push(`direct session label is ${JSON.stringify(sessionTitle.trim())}`);
    }
  }
  await record(session, scenario.options);
}

{
  const session = await openSession({
    name: "plan-day-paused-en-390x844",
    viewport: { width: 390, height: 844 }
  });
  await session.page.locator("[data-aw5-pause-resume]").click();
  await session.page.waitForSelector('[data-aw5-session-state="paused"]');
  await session.page.waitForFunction(() => /resume/i.test(
    document.querySelector("[data-aw5-primary-action]:not(.hidden)")?.textContent ?? ""
  ));
  await record(session);
}

{
  const session = await openSession({
    name: "plan-day-validation-error-en-390x844",
    viewport: { width: 390, height: 844 }
  });
  await session.page.locator("#active-set-reps").fill("");
  await session.page.locator("#active-set-weight").fill("40");
  const before = await session.page.locator("[data-active-set-state]").getAttribute("data-active-set-number");
  await visiblePrimary(session.page).click();
  await session.page.waitForFunction(() => (
    document.querySelector("[data-aw5-feedback]")?.textContent?.trim().length ?? 0
  ) > 0);
  const after = await session.page.locator("[data-active-set-state]").getAttribute("data-active-set-number");
  if (before !== after) session.consoleErrors.push("validation error advanced the canonical cursor");
  await record(session);
}

{
  const session = await openSession({
    name: "plan-day-busy-en-390x844",
    viewport: { width: 390, height: 844 },
    delayCanonical: true
  });
  await enterSet(session.page);
  await visiblePrimary(session.page).click();
  await session.page.waitForFunction(() => (
    document.querySelector("[data-aw5-sticky-actions]")?.getAttribute("aria-busy") === "true"
  ));
  const busySnapshot = await session.page.evaluate(() => ({
    repsDisabled: document.querySelector("#active-set-reps")?.disabled,
    weightDisabled: document.querySelector("#active-set-weight")?.disabled,
    text: document.querySelector("[data-aw5-execution-shell]")?.textContent ?? ""
  }));
  if (!busySnapshot.repsDisabled || !busySnapshot.weightDisabled) {
    session.consoleErrors.push("busy completion did not disable the primary editor");
  }
  if (/Saving\.\.\.|Saved/i.test(busySnapshot.text)) {
    session.consoleErrors.push("busy completion exposed rejected save-state chrome");
  }
  await record(session);
}

{
  const session = await openSession({
    name: "plan-day-rest-en-390x844",
    viewport: { width: 390, height: 844 }
  });
  await enterSet(session.page);
  await visiblePrimary(session.page).click();
  await session.page.waitForSelector('[data-aw5-session-state="rest"]', { timeout: 20_000 });
  await session.page.locator("[data-aw5-rest-presets]").evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await session.page.waitForTimeout(100);
  const restText = await visiblePrimary(session.page).innerText();
  if (!/skip/i.test(restText)) session.consoleErrors.push(`rest CTA is ${JSON.stringify(restText)}`);
  await record(session, { restPresets: true });
}

for (const scenario of [
  { name: "plan-day-details-ar-390x844", viewport: { width: 390, height: 844 }, language: "ar" },
  { name: "plan-day-details-dark-en-1440x900", viewport: { width: 1440, height: 900 }, theme: "dark" }
]) {
  const session = await openSession(scenario);
  await session.page.locator("[data-active-set-details-trigger]").click();
  await session.page.waitForSelector("[data-active-set-details-dialog]");
  await record(session);
}

{
  const session = await openSession({
    name: "plan-day-session-review-en-1440x900",
    viewport: { width: 1440, height: 900 }
  });
  await session.page.getByRole("button", { name: /^Finish$/i }).click();
  await session.page.waitForSelector("[data-aw5-session-review]");
  await record(session);
}

{
  const session = await openSession({
    name: "plan-day-completed-summary-en-1440x900",
    viewport: { width: 1440, height: 900 }
  });
  await enterSet(session.page, "8", "80");
  await visiblePrimary(session.page).click();
  await session.page.waitForSelector('[data-aw5-session-state="rest"]', { timeout: 20_000 });
  await visiblePrimary(session.page).click();
  await session.page.waitForSelector('[data-active-set-number="2"]', { timeout: 20_000 });
  await enterSet(session.page, "9", "82.5");
  await visiblePrimary(session.page).click();
  await session.page.waitForSelector('[data-aw5-session-state="completed"]', { timeout: 20_000 });
  await visiblePrimary(session.page).click();
  const review = session.page.locator("[data-aw5-session-review]");
  await review.waitFor();
  await review.getByRole("button", { name: /save.*finish/i }).click();
  await session.page.waitForSelector("[data-aw5-completed-summary]", { timeout: 20_000 });
  await record(session);
}

for (const keyboard of ["reps", "weight"]) {
  const session = await openSession({
    name: `plan-day-keyboard-${keyboard}-en-390x844`,
    viewport: { width: 390, height: 844 }
  });
  await session.page.setViewportSize({ width: 390, height: 464 });
  const input = session.page.locator(`#active-set-${keyboard}`);
  await input.focus();
  await input.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await session.page.waitForTimeout(100);
  await record(session, { keyboard });
}

await browser.close();

const failures = observations.flatMap((item) =>
  item.failures.map((failure) => `${item.name}: ${failure}`)
);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  requiredStates: {
    setEntry: observations.some((item) => item.name.includes("set-entry")),
    direct: observations.some((item) => item.name.startsWith("direct-set-entry")),
    busy: observations.some((item) => item.name.includes("busy")),
    validationError: observations.some((item) => item.name.includes("validation-error")),
    rest: observations.some((item) => item.name.includes("rest")),
    paused: observations.some((item) => item.name.includes("paused")),
    details: observations.some((item) => item.name.includes("details")),
    review: observations.some((item) => item.name.includes("session-review")),
    completed: observations.some((item) => item.name.includes("completed-summary"))
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
  console.log(
    `AW-5 correction layout QA passed with ${observations.length} clean rendered observations.`
  );
}
