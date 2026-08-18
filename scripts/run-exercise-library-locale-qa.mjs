import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.resolve(process.env.QA_EXERCISE_LIBRARY_EVIDENCE_DIR || path.join(tmpdir(), "plaivra-exercise-library-locale-qa"));
const mockUserId = "10000000-0000-4000-8000-000000000001";
const supportedCatalogLocales = new Set(["en", "de", "ar"]);
const scenarios = [
  { key: "en", expectedCatalogLocale: "en", dir: "ltr", viewport: { width: 390, height: 844 }, label: "english-mobile" },
  { key: "de", expectedCatalogLocale: "de", dir: "ltr", viewport: { width: 390, height: 844 }, label: "german-mobile" },
  { key: "ar", expectedCatalogLocale: "ar", dir: "rtl", viewport: { width: 390, height: 844 }, label: "arabic-mobile" },
  { key: "en", expectedCatalogLocale: "en", dir: "ltr", viewport: { width: 1280, height: 800 }, label: "english-desktop" }
];

function libraryMeta(locale) {
  return {
    apiVersion: "v2",
    locale,
    libraryRelease: {
      id: "qa-library-release",
      version: "2026.08.qa",
      checksum: "qa-library-checksum",
      publishedAt: "2026-08-18T00:00:00Z",
      strengthSemanticFingerprint: "qa-strength-fingerprint"
    },
    catalogRelease: { id: "qa-catalog-release", version: "2026.08.qa", checksum: "qa-catalog-checksum" },
    source: "library_v2",
    degraded: false
  };
}

function activity(name, id = "9fd807ef-bd6b-4bba-874d-0d2624b1e90a", revisionId = "b9b5345f-44e0-4736-8948-0b05ae26f508") {
  return {
    id,
    revisionId,
    revisionNumber: 4,
    revisionLifecycle: "published",
    revisionChecksum: "qa-revision-checksum",
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    shortDescription: "QA strength exercise",
    instructions: [{ order: 1, text: "Lower under control and press." }],
    difficulty: "intermediate",
    movementPattern: "horizontal_press",
    activityType: { slug: "strength_exercise", name: "Strength" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
    aliases: [],
    equipment: [{ slug: "barbell", name: "Barbell", requirement: "required" }],
    coverage: [
      { role: "primary", name: "Chest", bodyRegion: "Upper body" },
      { role: "secondary", name: "Triceps", bodyRegion: "Upper body" }
    ],
    executionProfiles: [],
    bodyEffects: []
  };
}

async function createContext(browser, spec) {
  const context = await browser.newContext({ viewport: spec.viewport, reducedMotion: "reduce" });
  const state = {
    activityName: "QA Bench Press",
    activities: null,
    failActivities: false,
    libraryRequests: [],
    rejectedLocales: []
  };

  await context.addInitScript(({ languageKey, userId, favoriteIds }) => {
    localStorage.setItem("plaivra.language.v1", languageKey);
    localStorage.setItem("plaivra-theme-id", "olive");
    localStorage.setItem(`plaivra-exercise-favorites:${userId}`, JSON.stringify(favoriteIds));
    localStorage.setItem(`plaivra-custom-exercises:${userId}`, JSON.stringify([]));
  }, { languageKey: spec.key, userId: mockUserId, favoriteIds: spec.favoriteIds || [] });
  await context.addCookies([{ name: "plaivra.language.v1", value: spec.key, domain: "localhost", path: "/" }]);

  await context.route("**/api/billing/entitlements", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entitlements: [] }) }));
  await context.route("**/api/workouts/active-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: null }) }));
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === "GET" && url.pathname.includes("/rest/v1/user_exercise_favorites")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: JSON.stringify((spec.favoriteIds || []).map((exerciseId) => ({ exercise_id: exerciseId })))
      });
      return;
    }
    await route.fulfill({ status: method === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: method === "HEAD" ? "" : "[]" });
  });

  await context.route("**/api/activity-catalog/library-domains/strength/**", async (route) => {
    const url = new URL(route.request().url());
    const locale = (url.searchParams.get("locale") || "en").toLowerCase();
    const record = { pathname: url.pathname, locale, query: url.searchParams.get("query") || "" };
    state.libraryRequests.push(record);

    if (!supportedCatalogLocales.has(locale)) {
      state.rejectedLocales.push(locale);
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "catalog_bad_request", error: "Unsupported Library locale." }) });
      return;
    }

    if (url.pathname.endsWith("/filters")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [], meta: libraryMeta(locale) }) });
      return;
    }

    if (url.pathname.endsWith("/activities")) {
      if (state.failActivities) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "catalog_unavailable", error: "Exercise search is temporarily unavailable." }) });
        return;
      }
      const responseActivities = state.activities || [activity(state.activityName)];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: responseActivities,
          pagination: { limit: 50, returned: responseActivities.length, nextCursor: null },
          meta: libraryMeta(locale),
          restarted: false
        })
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "catalog_not_found", error: "QA route not configured." }) });
  });

  return { context, state };
}

async function pageMetrics(page) {
  return page.evaluate(() => ({
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    bodyOverflowPx: Math.max(0, document.body.scrollWidth - window.innerWidth),
    rtlNodes: document.querySelectorAll('[dir="rtl"]').length
  }));
}

async function waitForLibraryRequest(state, predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const request = state.libraryRequests.find(predicate);
    if (request) return request;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

function activitiesRequestCount(state) {
  return state.libraryRequests.filter((entry) => entry.pathname.endsWith("/activities")).length;
}

function assertStrictRequests(label, requests, expectedLocale) {
  const filters = requests.filter((entry) => entry.pathname.endsWith("/filters"));
  const activities = requests.filter((entry) => entry.pathname.endsWith("/activities"));
  if (!filters.length) throw new Error(`${label}: no real Library filter request was observed`);
  if (!activities.length) throw new Error(`${label}: no real Library activities request was observed`);
  const wrong = requests.filter((entry) => entry.locale !== expectedLocale);
  if (wrong.length) throw new Error(`${label}: expected Catalog locale ${expectedLocale}, observed ${JSON.stringify(wrong)}`);
}

async function openShowAll(page, label, expectedExercise = "QA Bench Press") {
  const response = await page.goto(`${baseUrl}/workouts?all=1`, { waitUntil: "networkidle", timeout: 45_000 });
  if (!response?.ok()) throw new Error(`${label}: /workouts returned ${response?.status() ?? "no response"}`);
  await page.getByText(expectedExercise, { exact: true }).first().waitFor({ timeout: 20_000 });
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const spec of scenarios) {
    const { context, state } = await createContext(browser, spec);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openShowAll(page, spec.label);
    assertStrictRequests(spec.label, state.libraryRequests, spec.expectedCatalogLocale);
    if (state.rejectedLocales.length) throw new Error(`${spec.label}: strict route rejected locales ${state.rejectedLocales.join(", ")}`);

    const metrics = await pageMetrics(page);
    if (metrics.horizontalOverflowPx > 0 || metrics.bodyOverflowPx > 0) {
      throw new Error(`${spec.label}: horizontal overflow detected ${JSON.stringify(metrics)}`);
    }
    if (spec.dir === "rtl" && metrics.rtlNodes < 1) throw new Error(`${spec.label}: Arabic rendered without an RTL surface`);
    if (pageErrors.length) throw new Error(`${spec.label}: page errors: ${pageErrors.join(" | ")}`);

    if (spec.label === "english-mobile") {
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      await searchInput.fill("bench");
      await page.waitForFunction(() => new URLSearchParams(window.location.search).get("q") === "bench", undefined, { timeout: 10_000 });
      const searchRequest = await waitForLibraryRequest(state, (entry) => entry.pathname.endsWith("/activities") && entry.query === "bench");
      if (!searchRequest || searchRequest.locale !== "en") throw new Error("english-mobile: search did not reach Library route with locale=en");
      await page.getByText("QA Bench Press", { exact: true }).first().waitFor({ timeout: 10_000 });
    }

    const screenshotPath = path.join(evidenceDir, `${spec.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      scenario: spec.label,
      viewport: spec.viewport,
      uiLanguage: spec.key,
      expectedCatalogLocale: spec.expectedCatalogLocale,
      observedCatalogLocales: [...new Set(state.libraryRequests.map((entry) => entry.locale))],
      libraryRequestCount: state.libraryRequests.length,
      exerciseRendered: true,
      horizontalOverflowPx: metrics.horizontalOverflowPx,
      rtl: spec.dir === "rtl" ? metrics.rtlNodes > 0 : null,
      screenshot: screenshotPath
    });
    await context.close();
  }

  {
    const spec = scenarios[0];
    const { context, state } = await createContext(browser, spec);
    const page = await context.newPage();
    await openShowAll(page, "error-recovery");

    state.failActivities = true;
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill("failure probe");
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.waitFor({ timeout: 20_000 });

    if (await retry.count() !== 1) throw new Error(`error-recovery: expected one Try again control, found ${await retry.count()}`);
    if (await page.getByText("Exercise search failed", { exact: true }).count() !== 1) throw new Error("error-recovery: expected exactly one persistent Exercise search failed title");
    if (await page.getByText("Search failed", { exact: true }).count() !== 0) throw new Error("error-recovery: duplicate Search failed status surface remains");
    if (await page.getByText("Could not load workouts", { exact: true }).count() !== 0) throw new Error("error-recovery: duplicate result-load toast remains");
    if (await page.getByText("QA Bench Press", { exact: true }).count() < 1) throw new Error("error-recovery: previous results were cleared by the failed request");
    if (await searchInput.inputValue() !== "failure probe") throw new Error("error-recovery: query was not preserved");
    const reset = page.getByRole("button", { name: "Reset", exact: true });
    if (await reset.isDisabled()) throw new Error("error-recovery: active Show All/query state unexpectedly disabled Reset");

    state.failActivities = false;
    state.activityName = "Failure Probe Recovered Bench Press";
    await retry.click();
    await page.getByText("Failure Probe Recovered Bench Press", { exact: true }).waitFor({ timeout: 20_000 });
    if (await page.getByText("Exercise search failed", { exact: true }).count() !== 0) throw new Error("error-recovery: persistent error surface remained after successful retry");
    if (await searchInput.inputValue() !== "failure probe") throw new Error("error-recovery: retry changed the query");
    assertStrictRequests("error-recovery", state.libraryRequests, "en");

    const screenshotPath = path.join(evidenceDir, "error-recovery-after-retry.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      scenario: "error-recovery",
      persistentErrorSurfaces: 1,
      retryVisible: true,
      previousResultsPreserved: true,
      queryPreserved: true,
      duplicateToast: false,
      recovered: true,
      catalogLocale: "en",
      screenshot: screenshotPath
    });
    await context.close();
  }

  {
    const favoriteId = "9fd807ef-bd6b-4bba-874d-0d2624b1e90a";
    const regularId = "9fd807ef-bd6b-4bba-874d-0d2624b1e90b";
    const spec = { ...scenarios[0], favoriteIds: [favoriteId] };
    const { context, state } = await createContext(browser, spec);
    state.activities = [
      activity("QA Favorite Press", favoriteId, "b9b5345f-44e0-4736-8948-0b05ae26f508"),
      activity("QA Regular Press", regularId, "b9b5345f-44e0-4736-8948-0b05ae26f509")
    ];
    const page = await context.newPage();
    await openShowAll(page, "favorites-local-filter-no-refetch", "QA Favorite Press");
    await page.getByText("QA Regular Press", { exact: true }).first().waitFor({ timeout: 20_000 });

    const favorites = page.getByRole("button", { name: "Favorites", exact: true });
    const baselineActivitiesRequestCount = activitiesRequestCount(state);
    if (baselineActivitiesRequestCount !== 1) throw new Error(`favorites-local-filter-no-refetch: expected one initial activities request, observed ${baselineActivitiesRequestCount}`);

    await favorites.click();
    await page.waitForTimeout(350);
    const afterFavoritesOnRequestCount = activitiesRequestCount(state);
    if (afterFavoritesOnRequestCount !== baselineActivitiesRequestCount) throw new Error(`favorites-local-filter-no-refetch: Favorites ON refetched activities ${baselineActivitiesRequestCount} -> ${afterFavoritesOnRequestCount}`);
    if (await page.getByText("QA Favorite Press", { exact: true }).count() < 1) throw new Error("favorites-local-filter-no-refetch: favorite exercise disappeared with Favorites ON");
    if (await page.getByText("QA Regular Press", { exact: true }).count() !== 0) throw new Error("favorites-local-filter-no-refetch: non-favorite exercise remained visible with Favorites ON");

    await favorites.click();
    await page.waitForTimeout(350);
    const afterFavoritesOffRequestCount = activitiesRequestCount(state);
    if (afterFavoritesOffRequestCount !== baselineActivitiesRequestCount) throw new Error(`favorites-local-filter-no-refetch: Favorites OFF refetched activities ${baselineActivitiesRequestCount} -> ${afterFavoritesOffRequestCount}`);
    if (await page.getByText("QA Favorite Press", { exact: true }).count() < 1 || await page.getByText("QA Regular Press", { exact: true }).count() < 1) {
      throw new Error("favorites-local-filter-no-refetch: both exercises were not restored with Favorites OFF");
    }

    state.failActivities = true;
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill("failure probe");
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.waitFor({ timeout: 20_000 });
    const afterFailedSearchRequestCount = activitiesRequestCount(state);
    if (afterFailedSearchRequestCount !== baselineActivitiesRequestCount + 1) {
      throw new Error(`favorites-local-filter-no-refetch: failed semantic search request count ${afterFailedSearchRequestCount}, expected ${baselineActivitiesRequestCount + 1}`);
    }
    if (await page.getByText("Exercise search failed", { exact: true }).count() !== 1) throw new Error("favorites-local-filter-no-refetch: expected one persistent recovery surface after failed search");
    if (await searchInput.inputValue() !== "failure probe") throw new Error("favorites-local-filter-no-refetch: failed query was not preserved");

    await favorites.click();
    await page.waitForTimeout(350);
    const recoveryFavoritesOnRequestCount = activitiesRequestCount(state);
    if (recoveryFavoritesOnRequestCount !== afterFailedSearchRequestCount) throw new Error(`favorites-local-filter-no-refetch: Favorites ON during recovery refetched activities ${afterFailedSearchRequestCount} -> ${recoveryFavoritesOnRequestCount}`);
    if (await page.getByText("QA Favorite Press", { exact: true }).count() < 1) throw new Error("favorites-local-filter-no-refetch: favorite prior result missing during recovery");
    if (await page.getByText("QA Regular Press", { exact: true }).count() !== 0) throw new Error("favorites-local-filter-no-refetch: non-favorite prior result remained visible during recovery Favorites ON");
    if (await page.getByText("Exercise search failed", { exact: true }).count() !== 1) throw new Error("favorites-local-filter-no-refetch: recovery surface changed while toggling Favorites");

    await favorites.click();
    await page.waitForTimeout(350);
    const recoveryFavoritesOffRequestCount = activitiesRequestCount(state);
    if (recoveryFavoritesOffRequestCount !== afterFailedSearchRequestCount) throw new Error(`favorites-local-filter-no-refetch: Favorites OFF during recovery refetched activities ${afterFailedSearchRequestCount} -> ${recoveryFavoritesOffRequestCount}`);
    if (await page.getByText("QA Favorite Press", { exact: true }).count() < 1 || await page.getByText("QA Regular Press", { exact: true }).count() < 1) {
      throw new Error("favorites-local-filter-no-refetch: prior results were not restored with Favorites OFF during recovery");
    }

    const metrics = await pageMetrics(page);
    if (metrics.horizontalOverflowPx > 0 || metrics.bodyOverflowPx > 0) throw new Error(`favorites-local-filter-no-refetch: horizontal overflow detected ${JSON.stringify(metrics)}`);
    assertStrictRequests("favorites-local-filter-no-refetch", state.libraryRequests, "en");

    const screenshotPath = path.join(evidenceDir, "favorites-local-filter-no-refetch-390x844.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      scenario: "favorites-local-filter-no-refetch-390x844",
      viewport: spec.viewport,
      baselineActivitiesRequestCount,
      afterFavoritesOnRequestCount,
      afterFavoritesOffRequestCount,
      afterFailedSearchRequestCount,
      recoveryFavoritesOnRequestCount,
      recoveryFavoritesOffRequestCount,
      favoriteVisibleWithFavoritesOn: true,
      nonFavoriteHiddenWithFavoritesOn: true,
      recoveryFavoriteVisible: true,
      recoveryNonFavoriteHidden: true,
      persistentErrorSurfaces: 1,
      failedQueryPreserved: true,
      horizontalOverflowPx: metrics.horizontalOverflowPx,
      screenshot: screenshotPath
    });
    await context.close();
  }

  {
    const spec = scenarios[0];
    const { context, state } = await createContext(browser, spec);
    const page = await context.newPage();
    await openShowAll(page, "reset-show-all");
    const reset = page.getByRole("button", { name: "Reset", exact: true });
    if (await reset.isDisabled()) throw new Error("reset-show-all: Reset remained disabled while Show All was active");
    await reset.click();
    await page.waitForFunction(() => !new URLSearchParams(window.location.search).has("all"), undefined, { timeout: 10_000 });
    if (!(await reset.isDisabled())) throw new Error("reset-show-all: Reset did not return to disabled neutral state");
    if (await page.getByText("QA Bench Press", { exact: true }).count() !== 0) throw new Error("reset-show-all: Show All results remained after Reset");
    assertStrictRequests("reset-show-all", state.libraryRequests, "en");

    const screenshotPath = path.join(evidenceDir, "reset-neutral.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      scenario: "reset-show-all",
      resetEnabledWithShowAll: true,
      showAllCleared: true,
      neutralStateRestored: true,
      screenshot: screenshotPath
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  status: "pass",
  gate: "EXERCISE-LIBRARY-RUNTIME-LOCALE",
  strictRawCatalogLocales: [...supportedCatalogLocales],
  scenarios: results
};
await writeFile(path.join(evidenceDir, "exercise-library-locale-qa.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));