import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.resolve(process.env.QA_EXERCISE_DETAIL_V2_EVIDENCE_DIR || path.join(tmpdir(), "plaivra-exercise-detail-v2-qa"));
const activityId = "ead598db-a7db-5cdd-9b10-512f0d353fc7";
const alternativeId = "11111111-1111-4111-8111-111111111111";
const mockUserId = "10000000-0000-4000-8000-000000000001";
const requiredViewports = [[390, 844], [393, 852], [430, 932], [412, 915], [768, 1024], [1024, 768], [1280, 800], [1440, 900]];
const locales = {
  en: { locale: "en-GB", dir: "ltr", exercise: "Barbell back squat", overview: "Overview", anatomy: "Anatomy & Target", technique: "Technique & Setup", performance: "Performance", alternatives: "Alternatives", details: "Exercise Details" },
  de: { locale: "de-DE", dir: "ltr", exercise: "Langhantel-Kniebeuge", overview: "Übersicht", anatomy: "Anatomie & Ziel", technique: "Technik & Einstellung", performance: "Leistung", alternatives: "Alternativen", details: "Übungsdetails" },
  ar: { locale: "ar-EG", dir: "rtl", exercise: "قرفصاء خلفية بالبار", overview: "نظرة عامة", anatomy: "التشريح والعضلات المستهدفة", technique: "الأسلوب والإعداد", performance: "الأداء", alternatives: "البدائل", details: "تفاصيل التمرين" },
};
const themes = [{ key: "light", id: "olive" }, { key: "dark", id: "elite-noir" }];
const childRoutes = ["anatomy", "technique", "performance", "alternatives", "details"];

function recordEvent(key, label, value, unit, lineageId) {
  return {
    eventId: `event-${key}`,
    lineageId,
    subject: { identityKind: "verified_activity", identity: `provider:plaivra_activity_catalog:${activityId}`, name: "Barbell back squat", sportDomain: "strength", sportName: "Strength" },
    definition: { id: `${key}:v1`, key, version: "1", label, comparisonDirection: "higher_better", canonicalUnit: unit },
    value,
    context: [],
    achievedAt: "2026-08-11T18:20:00.000Z",
    rawAchievedAt: "2026-08-11T18:20:00.000Z",
    source: "verified",
    sourceWorkoutId: "session-squat",
    notes: null,
    editable: false,
    eventSemanticsVersion: "verified-set-event-v2",
    editAuthority: null,
  };
}

function performanceFixture() {
  return {
    performed: true,
    lastPerformedAt: "2026-08-11T18:20:00.000Z",
    recentWorkoutId: "session-squat",
    recentSessions: [{
      activityId: "history-activity-squat",
      canonicalSessionId: "session-squat",
      title: "Lower body strength",
      effectiveAt: "2026-08-11T18:20:00.000Z",
      completedSetCount: 4,
      reliableVolume: 1860,
      resultKind: "strength",
      resultFacts: [],
    }],
    bests: [
      { key: "highest_load", event: recordEvent("highest_load", "Highest load", 142.5, "kg", "lineage-highest-load") },
      { key: "estimated_one_rep_max", event: recordEvent("estimated_one_rep_max", "Estimated 1RM", 160, "kg", "lineage-e1rm") },
      { key: "same_load_max_repetitions", event: recordEvent("same_load_max_repetitions", "Same-load max repetitions", 8, "repetitions", "lineage-reps") },
      { key: "exercise_session_volume", event: recordEvent("exercise_session_volume", "Exercise session volume", 1860, "kg_repetitions", "lineage-volume") },
    ],
  };
}

function catalogFixture(languageKey, id = activityId, nameOverride = null) {
  const language = locales[languageKey];
  const isAlternative = id === alternativeId;
  const name = nameOverride ?? (isAlternative ? (languageKey === "de" ? "Kurzhantel-Kniebeuge" : languageKey === "ar" ? "قرفصاء بالدمبل" : "Dumbbell squat") : language.exercise);
  return {
    id,
    domain: "strength",
    revisionId: isAlternative ? "revision-alt-v2" : "revision-squat-v7",
    revisionNumber: isAlternative ? 2 : 7,
    revisionLifecycle: "published",
    revisionChecksum: isAlternative ? "alt-revision-checksum" : "revision-checksum",
    slug: isAlternative ? "dumbbell-squat" : "barbell-back-squat",
    name,
    shortDescription: isAlternative ? "A squat variation using dumbbells." : "A controlled compound squat using a barbell across the upper back.",
    instructions: [{ order: 1, text: "Set your stance and brace your trunk." }, { order: 2, text: "Descend under control, then drive through the floor." }],
    difficulty: isAlternative ? "Beginner" : "Intermediate",
    movementPattern: "Squat",
    mechanics: "Compound",
    forceType: "Push",
    activityType: { slug: "strength_exercise", name: "Strength exercise" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
    aliases: [],
    equipment: isAlternative
      ? [{ slug: "dumbbell", name: "Dumbbell", requirement: "required" }]
      : [{ slug: "barbell", name: "Barbell", requirement: "required" }, { slug: "rack", name: "Squat rack", requirement: "optional" }],
    coverage: [
      { name: "Chest", role: "primary", atlasTargetId: "pectoralis.middle" },
      { name: "Triceps", role: "secondary", atlasTargetId: "triceps.lateral_head" },
      { name: "Serratus", role: "stabilizer", atlasTargetId: "serratus.anterior" },
    ],
    executionProfiles: [],
    bodyEffects: [],
    prescriptionSchema: { id: "prescription-v1", key: "strength_sets_reps", version: 1, checksum: "schema-checksum", fields: [{ key: "sets", label: "Sets", type: "integer", required: true, minimum: 1, maximum: 20 }, { key: "reps", label: "Repetitions", type: "integer", required: true, minimum: 1, maximum: 100 }] },
    performedMetricSchema: { id: "metrics-v1", key: "strength_metrics", version: 1, checksum: "metrics-checksum", fields: [{ key: "external_load_kg", label: "Load", type: "number", unit: "kg" }, { key: "repetitions", label: "Repetitions", type: "integer" }] },
    recordDefinitions: [
      { id: "highest-load-v1", recordKey: "highest_load", comparisonDirection: "higher_better", canonicalUnit: "kg" },
      { id: "estimated-1rm-v1", recordKey: "estimated_one_rep_max", comparisonDirection: "higher_better", canonicalUnit: "kg" },
      { id: "same-load-reps-v1", recordKey: "same_load_max_repetitions", comparisonDirection: "higher_better", canonicalUnit: "repetitions" },
      { id: "session-volume-v1", recordKey: "exercise_session_volume", comparisonDirection: "higher_better", canonicalUnit: "kg_repetitions" },
    ],
    heatMap: { mapping: [{ muscleName: "Chest", atlasTargetId: "pectoralis.middle", role: "primary" }, { muscleName: "Triceps", atlasTargetId: "triceps.lateral_head", role: "secondary" }, { muscleName: "Serratus", atlasTargetId: "serratus.anterior", role: "stabilizer" }] },
    publicationPolicy: { id: "publication-v1", key: "member_visible", version: 1, checksum: "publication-checksum" },
    capabilityContract: { id: "capability-v1", version: "1", compatibleCatalogApiVersion: "v2", checksum: "capability-checksum" },
    authority: { libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum" }, catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" }, activityId: id, revisionId: isAlternative ? "revision-alt-v2" : "revision-squat-v7", revisionNumber: isAlternative ? 2 : 7 },
  };
}

function providerMeta(languageKey) {
  return {
    apiVersion: "v2",
    locale: languageKey,
    libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum", publishedAt: "2026-08-01T00:00:00.000Z", strengthSemanticFingerprint: "strength-fingerprint" },
    catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" },
    source: "library_v2",
    degraded: false,
  };
}

async function createContext(browser, { viewport, languageKey, theme, motion = "no-preference" }) {
  const language = locales[languageKey];
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    locale: language.locale,
    colorScheme: theme.key === "dark" ? "dark" : "light",
    reducedMotion: motion,
  });
  await context.addInitScript(({ key, themeId, userId }) => {
    localStorage.setItem("plaivra.language.v1", key);
    localStorage.setItem("plaivra-theme-id", themeId);
    localStorage.setItem(`plaivra-exercise-favorites:${userId}`, JSON.stringify([]));
    localStorage.setItem(`plaivra-custom-exercises:${userId}`, JSON.stringify([]));
  }, { key: languageKey, themeId: theme.id, userId: mockUserId });
  await context.addCookies([{ name: "plaivra.language.v1", value: languageKey, domain: "localhost", path: "/" }]);

  const requests = [];
  context.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  await context.route("**/api/billing/entitlements", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entitlements: [] }) }));
  await context.route("**/api/workouts/active-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: null }) }));
  await context.route("**/api/exercise-detail/performance?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(performanceFixture()) }));
  await context.route(`**/api/activity-catalog/library-activities/${activityId}?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: catalogFixture(languageKey), meta: providerMeta(languageKey) }) }));
  await context.route(`**/api/activity-catalog/library-domains/strength/activities/${activityId}/alternatives?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ relationshipType: "equipment_substitution", rationale: "Same training purpose with different equipment.", prescriptionTransfer: null, activity: catalogFixture(languageKey, alternativeId) }], meta: providerMeta(languageKey) }) }));
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (url.includes("exercise_setup_notes")) {
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: method === "HEAD" ? "" : "null" });
    }
    return route.fulfill({ status: method === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: method === "HEAD" ? "" : "[]" });
  });
  return { context, requests };
}

function expectedTitle(languageKey, route) {
  return route === "overview" ? locales[languageKey].exercise : locales[languageKey][route];
}

async function semanticMetrics(page) {
  return page.evaluate(() => {
    const bodyText = document.body.innerText;
    const interactive = [...document.querySelectorAll("a[href],button,input,select,textarea")].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const unnamed = interactive.filter((element) => {
      const aria = element.getAttribute("aria-label")?.trim();
      const labelledBy = element.getAttribute("aria-labelledby")?.trim();
      const text = element.textContent?.trim();
      const placeholder = element.getAttribute("placeholder")?.trim();
      const id = element.getAttribute("id");
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      return !aria && !labelledBy && !text && !placeholder && !label;
    });
    const appShell = document.querySelector("[data-app-shell]");
    const globalHeader = appShell?.querySelector(":scope > header");
    const globalHeaderVisible = globalHeader ? getComputedStyle(globalHeader).display !== "none" : false;
    const detailTopbars = document.querySelectorAll("[data-exercise-detail-topbar]").length;
    const surfaceCount = document.querySelectorAll("[data-detail-surface]").length;
    const emptyMetrics = [...document.querySelectorAll("[data-detail-metric] dd")].filter((node) => !(node.textContent || "").trim()).length;
    const emptyDefinitions = [...document.querySelectorAll("main dd")].filter((node) => !(node.textContent || "").trim()).length;
    const emptyNamedSurfaces = [...document.querySelectorAll("[data-detail-surface][aria-labelledby]")].filter((surface) => {
      const id = surface.getAttribute("aria-labelledby");
      const heading = id ? document.getElementById(id) : null;
      return !heading || !(heading.textContent || "").trim();
    }).length;
    return {
      h1Count: document.querySelectorAll("main h1").length,
      hasMain: Boolean(document.querySelector("main#main-content")),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      unnamedInteractiveElements: unnamed.length,
      dir: document.documentElement.dir || document.body.dir || appShell?.closest("[dir]")?.getAttribute("dir") || document.querySelector("[dir]")?.getAttribute("dir"),
      focusedDetail: appShell?.getAttribute("data-focused-exercise-detail") === "true",
      globalHeaderVisible,
      floatingNavCount: document.querySelectorAll("[data-mobile-floating-nav]").length,
      desktopSidebarVisible: Boolean(appShell?.querySelector("aside") && getComputedStyle(appShell.querySelector("aside")).display !== "none"),
      detailTopbars,
      surfaceCount,
      emptyMetrics,
      emptyDefinitions,
      emptyNamedSurfaces,
      forbiddenText: ["Demo Video", "Explore More", "revision-squat-v7", "library-release", "catalog-release", "schema-checksum", "metrics-checksum"].filter((value) => bodyText.includes(value)),
      startVisible: [...document.querySelectorAll("a,button")].some((node) => /Start Workout|Training starten|بدء التمرين/.test(node.textContent || "")),
    };
  });
}

async function focusProof(page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    try { return active.matches(":focus-visible"); } catch { return true; }
  });
}

function assertMetrics(metrics, { scenario, viewport, route, languageKey, expectedSurfaces }) {
  if (metrics.h1Count !== 1) throw new Error(`${scenario}: expected one H1, got ${metrics.h1Count}`);
  if (!metrics.hasMain) throw new Error(`${scenario}: missing main landmark`);
  if (metrics.horizontalOverflowPx > 0) throw new Error(`${scenario}: ${metrics.horizontalOverflowPx}px horizontal overflow`);
  if (metrics.unnamedInteractiveElements > 0) throw new Error(`${scenario}: ${metrics.unnamedInteractiveElements} unnamed interactive controls`);
  if (metrics.dir !== locales[languageKey].dir) throw new Error(`${scenario}: expected dir ${locales[languageKey].dir}, got ${metrics.dir}`);
  if (!metrics.focusedDetail) throw new Error(`${scenario}: focused Detail shell marker missing`);
  if (metrics.detailTopbars !== 1) throw new Error(`${scenario}: expected one Detail top bar, got ${metrics.detailTopbars}`);
  if (metrics.floatingNavCount !== 0) throw new Error(`${scenario}: competing mobile floating nav rendered`);
  if (viewport[0] < 1024 && metrics.globalHeaderVisible) throw new Error(`${scenario}: global Plaivra mobile masthead is visible`);
  if (viewport[0] >= 1024 && !metrics.desktopSidebarVisible) throw new Error(`${scenario}: desktop sidebar is not visible`);
  if (metrics.emptyMetrics || metrics.emptyDefinitions || metrics.emptyNamedSurfaces) throw new Error(`${scenario}: empty metric/definition/authoritative surface detected`);
  if (metrics.forbiddenText.length) throw new Error(`${scenario}: leaked forbidden/internal text: ${metrics.forbiddenText.join(", ")}`);
  if (metrics.startVisible) throw new Error(`${scenario}: unsupported native V2 Start action is visible`);
  if (expectedSurfaces !== null && metrics.surfaceCount !== expectedSurfaces) throw new Error(`${scenario}: expected ${expectedSurfaces} Detail surfaces for ${route}, got ${metrics.surfaceCount}`);
}

async function verifyRoute(page, { viewport, languageKey, route, scenario, expectedSurfaces, screenshot = false, zoom = 1 }) {
  const title = expectedTitle(languageKey, route);
  await page.getByRole("heading", { level: 1, name: title }).waitFor({ timeout: 20_000 });
  if (zoom !== 1) await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
  const focusVisible = await focusProof(page);
  if (!focusVisible) throw new Error(`${scenario}: keyboard focus was not visible`);
  const metrics = await semanticMetrics(page);
  assertMetrics(metrics, { scenario, viewport, route, languageKey, expectedSurfaces });
  if (screenshot) await page.screenshot({ path: path.join(evidenceDir, `${scenario}.png`), fullPage: true });
  return { ...metrics, focusVisible };
}

async function gotoOverview(page) {
  const response = await page.goto(`${baseUrl}/workouts/${activityId}`, { waitUntil: "networkidle", timeout: 45_000 });
  if (!response || !response.ok()) throw new Error(`Overview navigation failed: ${response?.status() ?? "no response"}`);
}

function surfaceCountFor(route) {
  if (route === "overview") return 4;
  if (route === "anatomy") return 2;
  if (route === "technique") return 2;
  if (route === "performance") return 3;
  if (route === "alternatives") return 1;
  if (route === "details") return 1;
  return null;
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

// Preserve the existing responsive footprint and add Android coverage on Overview.
for (const viewport of requiredViewports) {
  for (const languageKey of Object.keys(locales)) {
    for (const theme of themes) {
      const scenario = `overview-${languageKey}-${theme.key}-${viewport[0]}x${viewport[1]}`;
      const { context, requests } = await createContext(browser, { viewport, languageKey, theme });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await gotoOverview(page);
        const metrics = await verifyRoute(page, { viewport, languageKey, route: "overview", scenario, expectedSurfaces: 4, screenshot: (viewport[0] === 390 || viewport[0] === 412 || viewport[0] === 1440) && languageKey === "en" && theme.key === "light" });
        const alternativeCalls = requests.filter((entry) => entry.url.includes("/alternatives")).length;
        const videoCalls = requests.filter((entry) => entry.url.includes("user_exercise_videos") || entry.url.includes("exercise_videos")).length;
        if (alternativeCalls) throw new Error(`${scenario}: Overview eagerly requested alternatives`);
        if (videoCalls) throw new Error(`${scenario}: Overview eagerly requested video data`);
        if (pageErrors.length) throw new Error(`${scenario}: page errors: ${pageErrors.join(" | ")}`);
        results.push({ scenario, route: "overview", viewport, languageKey, theme: theme.key, motion: "no-preference", zoom: 1, requests: requests.length, metrics });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      } finally { await context.close(); }
    }
  }
}

// Prove all six real routes, persistent provider state, route-scoped secondary reads, both motion modes, RTL, mobile/Android/desktop, and 200% scaling.
const routeMatrices = [
  { key: "iphone-en-light-normal", viewport: [390, 844], languageKey: "en", theme: themes[0], motion: "no-preference", zoom: 1 },
  { key: "android-de-dark-normal", viewport: [412, 915], languageKey: "de", theme: themes[1], motion: "no-preference", zoom: 1 },
  { key: "iphone-ar-dark-reduced", viewport: [393, 852], languageKey: "ar", theme: themes[1], motion: "reduce", zoom: 1 },
  { key: "desktop-en-light-normal", viewport: [1440, 900], languageKey: "en", theme: themes[0], motion: "no-preference", zoom: 1 },
  { key: "zoom200-ar-light", viewport: [768, 1024], languageKey: "ar", theme: themes[0], motion: "no-preference", zoom: 2 },
];

for (const matrix of routeMatrices) {
  const { context, requests } = await createContext(browser, matrix);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await gotoOverview(page);
    await verifyRoute(page, { ...matrix, route: "overview", scenario: `${matrix.key}-overview`, expectedSurfaces: surfaceCountFor("overview"), screenshot: true });
    const initialCoreCalls = requests.filter((entry) => entry.url.includes(`/api/activity-catalog/library-activities/${activityId}`)).length;
    if (initialCoreCalls !== 1) throw new Error(`${matrix.key}: expected one initial semantic core request, got ${initialCoreCalls}`);

    for (const route of childRoutes) {
      const linkName = locales[matrix.languageKey][route];
      await page.getByRole("link", { name: linkName }).click();
      await page.waitForURL(new RegExp(`/workouts/${activityId}/${route}`), { timeout: 15_000 });
      const scenario = `${matrix.key}-${route}`;
      const before = requests.length;
      const metrics = await verifyRoute(page, { ...matrix, route, scenario, expectedSurfaces: surfaceCountFor(route), screenshot: route === "anatomy" || route === "performance" || route === "alternatives", zoom: matrix.zoom });
      await page.waitForLoadState("networkidle");
      const afterEntries = requests.slice(before);
      const coreCalls = requests.filter((entry) => entry.url.includes(`/api/activity-catalog/library-activities/${activityId}`)).length;
      if (coreCalls !== 1) throw new Error(`${scenario}: nested navigation refetched core semantic detail (${coreCalls} calls)`);
      if (route !== "alternatives" && afterEntries.some((entry) => entry.url.includes("/alternatives"))) throw new Error(`${scenario}: non-Alternatives route requested alternatives`);
      if (route !== "technique" && afterEntries.some((entry) => entry.url.includes("exercise_setup_notes"))) throw new Error(`${scenario}: non-Technique route requested setup notes`);
      if (route !== "performance" && route !== "overview" && afterEntries.some((entry) => entry.url.includes("/api/exercise-detail/performance"))) throw new Error(`${scenario}: unrelated child route requested Performance data`);
      results.push({ scenario, route, viewport: matrix.viewport, languageKey: matrix.languageKey, theme: matrix.theme.key, motion: matrix.motion, zoom: matrix.zoom, requests: afterEntries.length, metrics });
      await page.getByRole("link", { name: locales[matrix.languageKey].overview }).click();
      await page.waitForURL(new RegExp(`/workouts/${activityId}(?:\\?.*)?$`), { timeout: 15_000 });
    }
    if (pageErrors.length) throw new Error(`${matrix.key}: page errors: ${pageErrors.join(" | ")}`);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally { await context.close(); }
}

await browser.close();
const report = {
  authority: "exercise-detail-v2-rendered-authority",
  generatedAt: new Date().toISOString(),
  headSha: process.env.QA_HEAD_SHA || null,
  workflowRunId: process.env.QA_WORKFLOW_RUN_ID || null,
  requiredViewports,
  routeCoverage: ["overview", ...childRoutes],
  localeCoverage: Object.keys(locales),
  themeCoverage: themes.map((theme) => theme.key),
  motionCoverage: ["no-preference", "reduce"],
  zoomCoverage: [1, 2],
  scenarios: results.length,
  failures,
  results,
};
await writeFile(path.join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ authority: report.authority, scenarios: report.scenarios, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ authority: report.authority, scenarios: report.scenarios, failures: 0, routeCoverage: report.routeCoverage, localeCoverage: report.localeCoverage, themeCoverage: report.themeCoverage, motionCoverage: report.motionCoverage, zoomCoverage: report.zoomCoverage }, null, 2));
}
