import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const baseOrigin = new URL(baseUrl).origin;
const evidenceDir = path.resolve(
  process.env.QA_ACTIVITY_CATALOG_EVIDENCE_DIR
    || path.join(process.cwd(), "quality-reports", "activity-catalog-qa-evidence")
);
const externalCatalogOrigin = "https://plaivra-activity-catalog-api.vercel.app";
const externalCatalogHostname = new URL(externalCatalogOrigin).hostname;
const requestTimeout = 45_000;
const fixtureDelayMs = 1_100;
const exposurePattern = /PLAIVRA_ACTIVITY_CATALOG_API_KEY|catalog[_ -]?(?:api[_ -]?)?(?:key|secret)|qa[_ -]?catalog[_ -]?secret/i;
const exposureReplacementPattern = new RegExp(exposurePattern.source, "gi");

const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
];

const externalActivityId = "7dce2b1d-9693-4bb6-9be3-6b1bb898f117";
const externalActivitySlug = "barbell_back_squat";
const legacyActivityId = "legacy-bench-press";
const activePlanId = "10000000-0000-4000-8000-000000000001";

const taxonomy = {
  strength: { id: "11111111-1111-4111-8111-111111111111", slug: "strength", name: "Strength" },
  exercise: { id: "22222222-2222-4222-8222-222222222222", slug: "exercise", name: "Exercise" },
  session: { id: "33333333-3333-4333-8333-333333333333", slug: "strength_session", name: "Strength session" },
  main: { id: "44444444-4444-4444-8444-444444444444", slug: "main", name: "Main" },
  barbell: { id: "55555555-5555-4555-8555-555555555555", slug: "barbell", name: "Barbell" },
  quadriceps: { id: "66666666-6666-4666-8666-666666666666", slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower body" },
  glutes: { id: "77777777-7777-4777-8777-777777777777", slug: "glutes", name: "Glutes", bodyRegion: "Lower body" },
  squat: { id: "88888888-8888-4888-8888-888888888888", slug: "squat", name: "Squat" }
};

const externalActivity = {
  id: externalActivityId,
  slug: externalActivitySlug,
  name: "Barbell Back Squat",
  shortDescription: "A controlled bilateral squat performed with a barbell.",
  instructions: [
    { order: 1, text: "Set the bar securely across the upper back." },
    { order: 2, text: "Brace, descend with control, then stand tall." }
  ],
  difficulty: "intermediate",
  movementPattern: "squat",
  version: 1,
  activityType: taxonomy.exercise,
  metricSchema: {
    slug: "strength_repetitions",
    name: "Strength repetitions",
    fields: [
      { key: "sets", label: "Sets", type: "integer", unit: "set", required: false },
      { key: "reps", label: "Repetitions", type: "integer", unit: "rep", required: false },
      { key: "weight", label: "Weight", type: "number", unit: "kg", required: false }
    ]
  },
  sports: [{ ...taxonomy.strength, isPrimary: true }],
  sessionTypes: [{ ...taxonomy.session, sportId: taxonomy.strength.id }],
  sessionPhases: [{ ...taxonomy.main, sportId: taxonomy.strength.id, isOptional: false }],
  equipment: [{ ...taxonomy.barbell, isRequired: true }],
  muscles: [
    { ...taxonomy.quadriceps, role: "primary" },
    { ...taxonomy.glutes, role: "secondary" }
  ],
  trainingGoals: [{ ...taxonomy.squat, relevanceWeight: 100 }],
  translations: {
    de: { name: "Langhantel-Kniebeuge", shortDescription: "Eine kontrollierte Kniebeuge mit Langhantel." },
    ar: { name: "قرفصاء بالبار", shortDescription: "قرفصاء ثنائية محكومة باستخدام البار." }
  },
  publishedAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-10T08:00:00.000Z"
};

const legacyActivity = {
  ...externalActivity,
  id: legacyActivityId,
  slug: "legacy_bench_press",
  name: "Legacy Bench Press",
  shortDescription: "Compatibility fixture for an exercise stored before catalog integration.",
  movementPattern: "horizontal-push",
  equipment: [{ ...taxonomy.barbell, isRequired: true }],
  muscles: [
    { id: "99999999-9999-4999-8999-999999999999", slug: "chest", name: "Chest", bodyRegion: "Upper body", role: "primary" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "triceps", name: "Triceps", bodyRegion: "Upper body", role: "secondary" }
  ],
  translations: {}
};

const filters = {
  sports: [taxonomy.strength],
  activityTypes: [taxonomy.exercise],
  sessionTypes: [{ ...taxonomy.session, sportId: taxonomy.strength.id }],
  sessionPhases: [{ ...taxonomy.main, sportId: taxonomy.strength.id, isOptional: false }],
  equipment: [taxonomy.barbell],
  trainingGoals: [taxonomy.squat],
  difficulties: ["beginner", "intermediate", "advanced"]
};

function result(data, { source = "external", degraded = false, pagination = null } = {}) {
  return {
    data,
    ...(pagination ? { pagination } : {}),
    meta: {
      source,
      degraded,
      apiVersion: "v1",
      locale: "en",
      requestId: `qa-${source}-${degraded ? "degraded" : "healthy"}`,
      ...(degraded ? { fallbackReason: "unavailable" } : {})
    }
  };
}

function fixtureForRequest(url, state) {
  const pathname = url.pathname;
  const source = state === "fallback" ? "legacy" : "external";
  const degraded = state === "fallback";

  if (state === "error" && pathname.endsWith("/activities")) {
    return {
      status: 503,
      body: {
        error: {
          message: "The activity catalog is temporarily unavailable.",
          code: "unavailable"
        }
      }
    };
  }

  if (pathname.endsWith("/filters")) {
    return { status: 200, body: result(filters, { source, degraded }) };
  }
  if (pathname.endsWith("/sports")) {
    return { status: 200, body: result([taxonomy.strength], { source, degraded }) };
  }
  if (pathname.endsWith("/session-template")) {
    return {
      status: 200,
      body: result({
        sport: { ...taxonomy.strength, description: "Strength training" },
        sessionTypes: [{ ...taxonomy.session, sportId: taxonomy.strength.id }],
        sessionPhases: [{ ...taxonomy.main, sportId: taxonomy.strength.id, isOptional: false }]
      }, { source, degraded })
    };
  }
  if (pathname.endsWith("/alternatives")) {
    const sourceId = pathname.includes(encodeURIComponent(legacyActivityId)) || pathname.includes(legacyActivityId)
      ? externalActivityId
      : externalActivityId;
    return {
      status: 200,
      body: result([{
        sourceActivityId: sourceId,
        alternativeActivityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        alternativeSlug: "front_squat",
        alternativeName: "Front Squat",
        alternativeActivityTypeSlug: "exercise",
        alternativeDifficulty: "intermediate",
        reasonCode: "same_pattern",
        differenceSummary: "Places more demand on the anterior trunk.",
        prescriptionTransfer: "partial",
        compatibilityScore: 0.9,
        priority: 1
      }], { source, degraded })
    };
  }
  if (pathname.endsWith("/activities")) {
    const items = state === "empty" ? [] : state === "fallback" ? [legacyActivity] : [externalActivity];
    return {
      status: 200,
      body: result(items, {
        source,
        degraded,
        pagination: { limit: 100, offset: 0, returned: items.length, nextOffset: null }
      })
    };
  }
  if (pathname.includes("/activities/")) {
    const identifier = decodeURIComponent(pathname.split("/activities/")[1] || "");
    const item = identifier === legacyActivityId ? legacyActivity : externalActivity;
    return { status: 200, body: result(item, { source: identifier === legacyActivityId ? "legacy" : source, degraded: identifier === legacyActivityId || degraded }) };
  }
  return { status: 404, body: { error: { message: "Catalog fixture route not found.", code: "not_found" } } };
}

function sanitizeText(value, limit = 1_600) {
  return String(value ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/gi, "[REDACTED]")
    .replace(exposurePattern, "[REDACTED]")
    .slice(0, limit);
}

function safeFilePart(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createContext(browser, { viewport, language, state }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "light" });
  const catalogRequests = [];
  const externalRequests = [];

  await context.addInitScript(({ languageValue }) => {
    localStorage.setItem("plaivra.language.v1", languageValue);
    localStorage.removeItem("plaivra-workout-browser-filters");
    localStorage.setItem("plaivra.qa.train-scenario", "rest");
  }, { languageValue: language });

  await context.route("**/api/activity-catalog/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== baseOrigin) {
      externalRequests.push({ origin: requestUrl.origin, path: requestUrl.pathname, reason: "catalog_api_not_same_origin" });
      await route.abort("blockedbyclient");
      return;
    }
    catalogRequests.push({ method: route.request().method(), path: requestUrl.pathname, queryKeys: [...requestUrl.searchParams.keys()].sort() });
    if (state === "loading" && requestUrl.pathname.endsWith("/activities")) await wait(fixtureDelayMs);
    const fixture = fixtureForRequest(requestUrl, state);
    await route.fulfill({
      status: fixture.status,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store", "x-plaivra-qa-fixture": `activity-catalog-${state}-v1` },
      body: JSON.stringify(fixture.body)
    });
  });

  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    let responseBody = [];
    if (method !== "GET" && method !== "HEAD") {
      try {
        const requestBody = route.request().postDataJSON();
        responseBody = Array.isArray(requestBody) ? requestBody[0] ?? {} : requestBody ?? {};
      } catch {
        responseBody = {};
      }
      if (new URL(route.request().url()).pathname.includes("/workout_sessions")) {
        responseBody = { id: "20000000-0000-4000-8000-000000000099", ...responseBody };
      }
    }
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0", "x-plaivra-qa-fixture": "empty-user-data-v1" },
      body: method === "HEAD" ? "" : JSON.stringify(responseBody)
    });
  });

  await context.route(`${externalCatalogOrigin}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    externalRequests.push({ origin: requestUrl.origin, path: requestUrl.pathname, reason: "direct_external_catalog_request" });
    await route.abort("blockedbyclient");
  });

  context.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.hostname === externalCatalogHostname && !externalRequests.some((entry) => entry.path === requestUrl.pathname)) {
      externalRequests.push({ origin: requestUrl.origin, path: requestUrl.pathname, reason: "direct_external_catalog_request" });
    }
  });

  return { context, catalogRequests, externalRequests };
}

async function openPicker(page, surface) {
  if (surface === "picker-builder") {
    await page.goto(`${baseUrl}/my-workout/plans/builder`, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    await page.locator('[data-builder-step="details"]').waitFor({ state: "visible", timeout: requestTimeout });
    await page.locator("[data-train-sticky-footer] button").last().click();
    await page.locator('[data-builder-step="days"]').waitFor({ state: "visible", timeout: requestTimeout });
  } else {
    await page.goto(`${baseUrl}/my-workout/plans/${activePlanId}/edit`, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    await page.locator("[data-train-editor]").waitFor({ state: "visible", timeout: requestTimeout });
  }
  const opener = page.locator("button", { hasText: /Add exercises|Übungen hinzufügen|إضافة تمارين/i }).first();
  await opener.waitFor({ state: "visible", timeout: requestTimeout });
  await opener.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));
  await opener.click();
  await page.locator("[data-train-exercise-picker]").waitFor({ state: "visible", timeout: requestTimeout });
  return opener;
}

function scenarioPath(surface) {
  if (surface === "library") return "/workouts?all=1";
  if (surface === "external-detail") return `/workouts/${externalActivityId}`;
  if (surface === "legacy-detail") return `/workouts/${legacyActivityId}`;
  if (surface === "session") return `/workouts/session/${externalActivityId}`;
  return null;
}

function expectedPrimaryAction(surface, state) {
  if (state === "error") return /Retry|Try again/i;
  if (surface.startsWith("picker-")) return /Add \d+ exercises|Übungen hinzufügen|إضافة/i;
  if (surface === "library" && state === "empty") return /Clear filters|Show all workouts/i;
  if (surface === "library") return /Start session|Details|Show all/i;
  if (surface.endsWith("detail")) return /Start session/i;
  if (surface === "session") return /Mark workout completed|Finish|Save/i;
  return /Back|Retry|Start/i;
}

async function pageMetrics(page, { surface, state, language, loadingObserved }) {
  const primaryPattern = expectedPrimaryAction(surface, state);
  const metrics = await page.evaluate(({ patternSource, patternFlags }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const pattern = new RegExp(patternSource, patternFlags);
    const primary = [...document.querySelectorAll("button, a")].find((element) => visible(element) && pattern.test(element.textContent || element.getAttribute("aria-label") || ""));
    const bodyText = document.body.innerText;
    const overlay = /Unhandled Runtime Error|Application error|Build Error|Next\.js.*error/i.test(bodyText);
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() || null,
      meaningfulText: bodyText.trim().length > 80,
      frameworkOverlay: overlay,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      primaryActionVisible: Boolean(primary),
      primaryActionText: primary?.textContent?.trim().slice(0, 100) || primary?.getAttribute("aria-label") || null,
      direction: document.documentElement.dir || document.querySelector("[dir]")?.getAttribute("dir") || "ltr",
      secretExposure: /PLAIVRA_ACTIVITY_CATALOG_API_KEY|catalog[_ -]?(?:api[_ -]?)?(?:key|secret)|qa[_ -]?catalog[_ -]?secret/i.test(bodyText),
      pickerVisible: Boolean(document.querySelector("[data-train-exercise-picker]")),
      loadingVisible: Boolean(document.querySelector(".animate-pulse,[aria-busy='true']")) || /Updating exercise results|Loading/i.test(bodyText)
    };
  }, { patternSource: primaryPattern.source, patternFlags: primaryPattern.flags });
  return {
    ...metrics,
    loadingObserved: loadingObserved || metrics.loadingVisible,
    expectedDirection: language === "ar" ? "rtl" : "ltr",
    directionCorrect: language !== "ar" || metrics.direction === "rtl"
  };
}

async function runScenario(browser, scenario) {
  const { context, catalogRequests, externalRequests } = await createContext(browser, scenario);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  let focusRestored = null;
  let loadingObserved = false;
  let opener = null;

  page.on("pageerror", (error) => pageErrors.push(sanitizeText(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(sanitizeText(message.text(), 800));
  });

  try {
    if (scenario.surface.startsWith("picker-")) {
      opener = await openPicker(page, scenario.surface);
    } else {
      const route = scenarioPath(scenario.surface);
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    }

    if (scenario.state === "loading") {
      await page.locator(".animate-pulse,[aria-busy='true']").first().waitFor({ state: "visible", timeout: 900 }).catch(() => undefined);
      loadingObserved = await page.locator(".animate-pulse,[aria-busy='true']").count() > 0
        || await page.getByText(/Updating exercise results|Loading/i).count() > 0;
      const loadingFileBase = [scenario.surface, scenario.state, scenario.language, scenario.viewport.name, "pending"].map(safeFilePart).join("-");
      await page.screenshot({ path: path.join(evidenceDir, `${loadingFileBase}.png`), fullPage: true });
    }

    if (scenario.surface.startsWith("picker-")) {
      await page.locator("[data-train-exercise-picker]").waitFor({ state: "visible", timeout: requestTimeout });
      await page.locator("[data-picker-results], [data-picker-scroll-region]").first().waitFor({ state: "visible", timeout: requestTimeout });
    } else if (scenario.state === "error") {
      await page.getByRole("button", { name: /Retry|Try again/i }).first().waitFor({ state: "visible", timeout: requestTimeout });
    } else if (scenario.surface === "library" && scenario.state === "empty") {
      await page.getByText(/No exercises found/i).first().waitFor({ state: "visible", timeout: requestTimeout });
    } else if (scenario.surface === "library") {
      const activityName = scenario.state === "fallback" ? legacyActivity.name : externalActivity.name;
      await page.getByText(activityName, { exact: true }).last().waitFor({ state: "visible", timeout: requestTimeout });
    } else if (scenario.surface.endsWith("detail")) {
      await page.getByText(/Exercise details/i).first().waitFor({ state: "visible", timeout: requestTimeout });
    } else if (scenario.surface === "session") {
      await page.getByText(/Log sets, reps, weight/i).first().waitFor({ state: "visible", timeout: requestTimeout });
    }

    await page.waitForTimeout(scenario.state === "loading" ? fixtureDelayMs : 150);
    const fileBase = [scenario.surface, scenario.state, scenario.language, scenario.viewport.name].map(safeFilePart).join("-");
    const screenshot = `${fileBase}.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });

    const metrics = await pageMetrics(page, { ...scenario, loadingObserved });
    if (opener) {
      await page.keyboard.press("Escape");
      await page.locator("[data-train-exercise-picker]").waitFor({ state: "hidden", timeout: requestTimeout });
      focusRestored = await opener.evaluate((element) => document.activeElement === element);
    }
    const unexpectedConsoleErrors = consoleErrors.filter((message) => {
      if (/favicon|Failed to load resource.*404|eval\(\) is not supported/i.test(message)) return false;
      if (scenario.state === "error" && /Failed to load resource.*503/i.test(message)) return false;
      return true;
    });
    const exposureMessages = [...pageErrors, ...consoleErrors].filter((message) => exposurePattern.test(message));
    const catalogRequired = scenario.surface !== "session" || scenario.state !== "loading";
    const failed = pageErrors.length > 0
      || unexpectedConsoleErrors.length > 0
      || externalRequests.length > 0
      || exposureMessages.length > 0
      || metrics.secretExposure
      || metrics.frameworkOverlay
      || !metrics.meaningfulText
      || metrics.horizontalOverflowPx > 1
      || !metrics.primaryActionVisible
      || !metrics.directionCorrect
      || (scenario.state === "loading" && !metrics.loadingObserved)
      || (scenario.surface.startsWith("picker-") && (!metrics.pickerVisible || focusRestored !== true))
      || (catalogRequired && catalogRequests.length === 0);

    return {
      surface: scenario.surface,
      state: scenario.state,
      language: scenario.language,
      viewport: scenario.viewport.name,
      requestedPath: scenario.surface.startsWith("picker-")
        ? scenario.surface === "picker-builder" ? "/my-workout/plans/builder" : `/my-workout/plans/${activePlanId}/edit`
        : scenarioPath(scenario.surface),
      finalPath: new URL(page.url()).pathname,
      screenshot,
      loadingScreenshot: scenario.state === "loading"
        ? `${[scenario.surface, scenario.state, scenario.language, scenario.viewport.name, "pending"].map(safeFilePart).join("-")}.png`
        : null,
      ...metrics,
      focusRestored,
      catalogRequests,
      externalRequests,
      pageErrors,
      consoleErrors,
      unexpectedConsoleErrors,
      failed
    };
  } catch (error) {
    const fileBase = ["failure", scenario.surface, scenario.state, scenario.language, scenario.viewport.name].map(safeFilePart).join("-");
    const screenshot = `${fileBase}.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true }).catch(() => undefined);
    return {
      surface: scenario.surface,
      state: scenario.state,
      language: scenario.language,
      viewport: scenario.viewport.name,
      requestedPath: scenario.surface.startsWith("picker-") ? "/my-workout/plans/builder" : scenarioPath(scenario.surface),
      screenshot,
      catalogRequests,
      externalRequests,
      pageErrors,
      consoleErrors,
      failureReason: sanitizeText(error instanceof Error ? error.message : error),
      failed: true
    };
  } finally {
    await context.close();
  }
}

function scenarioMatrix() {
  const scenarios = [];
  const surfaces = ["library", "picker-builder", "picker-editor", "external-detail", "legacy-detail", "session"];
  for (const viewport of viewports) {
    for (const surface of surfaces) {
      scenarios.push({ surface, state: surface === "legacy-detail" ? "fallback" : "success", language: "en", viewport });
    }
  }
  for (const language of ["de", "ar"]) {
    for (const viewport of viewports.filter((item) => item.name === "390x844" || item.name === "1440x900")) {
      for (const surface of surfaces) {
        scenarios.push({ surface, state: surface === "legacy-detail" ? "fallback" : "success", language, viewport });
      }
    }
  }
  for (const state of ["loading", "empty", "fallback", "error"]) {
    for (const viewport of viewports) {
      scenarios.push({ surface: "library", state, language: "en", viewport });
    }
  }
  return scenarios;
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  for (const scenario of scenarioMatrix()) observations.push(await runScenario(browser, scenario));
} finally {
  await browser.close();
}

const failures = observations.filter((observation) => observation.failed);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  fixtureContract: "activity-catalog-phase-0b-v1",
  productionAcceptanceEvidence: false,
  containsSecrets: false,
  viewports,
  languages: ["en", "de", "ar"],
  states: ["loading", "success", "empty", "fallback", "error"],
  surfaces: ["/workouts", "builder picker", "editor picker", "external detail", "legacy detail", "direct session"],
  checks: {
    sameOriginCatalogProxyOnly: true,
    externalCatalogRequestsFail: true,
    secretExposureFails: true,
    horizontalOverflowThresholdPx: 1,
    primaryActionsRequired: true,
    pickerFocusRestorationRequired: true,
    pageAndConsoleErrorsFail: true,
    arabicDirectionRequired: "rtl"
  },
  summary: { observations: observations.length, failures: failures.length, passed: failures.length === 0 },
  failures,
  observations
};
const serialized = `${JSON.stringify(report, null, 2)}\n`.replace(exposureReplacementPattern, "[REDACTED]");
await writeFile(path.join(evidenceDir, "activity-catalog-qa-results.json"), serialized, "utf8");
console.log(`Activity Catalog QA: ${report.summary.observations} observations, ${report.summary.failures} failures.`);
if (failures.length) process.exitCode = 1;
