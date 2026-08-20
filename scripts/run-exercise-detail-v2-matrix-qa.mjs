import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve(process.env.QA_EXERCISE_DETAIL_V2_EVIDENCE_DIR || "ci-reports/exercise-detail-v2-evidence");
const activityId = "ead598db-a7db-5cdd-9b10-512f0d353fc7";
const alternativeId = "11111111-1111-4111-8111-111111111111";
const mockUserId = "10000000-0000-4000-8000-000000000001";
const routes = ["overview", "anatomy", "technique", "performance", "alternatives", "details"];
const viewports = [
  [390, 844],
  [393, 852],
  [430, 932],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
];
const languages = {
  en: { locale: "en-GB", dir: "ltr", exercise: "Barbell back squat", anatomy: "Anatomy & Target", technique: "Technique & Setup", performance: "Performance", alternatives: "Alternatives", details: "Exercise Details" },
  de: { locale: "de-DE", dir: "ltr", exercise: "Langhantel-Kniebeuge", anatomy: "Anatomie & Ziel", technique: "Technik & Einstellung", performance: "Leistung", alternatives: "Alternativen", details: "Übungsdetails" },
  ar: { locale: "ar-EG", dir: "rtl", exercise: "قرفصاء خلفية بالبار", anatomy: "التشريح والعضلات المستهدفة", technique: "الأسلوب والإعداد", performance: "الأداء", alternatives: "البدائل", details: "تفاصيل التمرين" },
};
const themes = [{ key: "light", id: "olive" }, { key: "dark", id: "elite-noir" }];
const viewportProfiles = [
  { languageKey: "en", theme: themes[0], motion: "no-preference" },
  { languageKey: "de", theme: themes[1], motion: "reduce" },
  { languageKey: "ar", theme: themes[0], motion: "no-preference" },
  { languageKey: "en", theme: themes[1], motion: "reduce" },
  { languageKey: "de", theme: themes[0], motion: "no-preference" },
  { languageKey: "ar", theme: themes[1], motion: "reduce" },
  { languageKey: "en", theme: themes[0], motion: "reduce" },
  { languageKey: "de", theme: themes[1], motion: "no-preference" },
];

function activityName(languageKey, alternative = false) {
  if (!alternative) return languages[languageKey].exercise;
  if (languageKey === "de") return "Kurzhantel-Kniebeuge";
  if (languageKey === "ar") return "قرفصاء بالدمبل";
  return "Dumbbell squat";
}

function catalogActivity(languageKey, id = activityId) {
  const alternative = id === alternativeId;
  return {
    id,
    domain: "strength",
    revisionId: alternative ? "revision-alt-v2" : "revision-squat-v7",
    revisionNumber: alternative ? 2 : 7,
    revisionLifecycle: "published",
    revisionChecksum: alternative ? "alt-revision-checksum" : "revision-checksum",
    slug: alternative ? "dumbbell-squat" : "barbell-back-squat",
    name: activityName(languageKey, alternative),
    shortDescription: alternative ? "A squat variation using dumbbells." : "A controlled compound squat using a barbell across the upper back.",
    instructions: [{ order: 1, text: "Set your stance and brace your trunk." }, { order: 2, text: "Descend under control, then drive through the floor." }],
    difficulty: alternative ? "beginner" : "intermediate",
    movementPattern: "squat",
    mechanics: "compound",
    forceType: "push",
    activityType: { slug: "strength_exercise", name: "Strength exercise" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
    aliases: [],
    equipment: alternative
      ? [{ slug: "dumbbell", name: "Dumbbell", requirement: "required" }]
      : [{ slug: "barbell", name: "Barbell", requirement: "required" }, { slug: "rack", name: "Squat rack", requirement: "optional" }],
    coverage: [
      { name: "Chest", muscleName: "Chest", role: "primary", atlasTargetId: "pectoralis.middle" },
      { name: "Triceps", muscleName: "Triceps", role: "secondary", atlasTargetId: "triceps.lateral_head" },
      { name: "Serratus", muscleName: "Serratus", role: "stabilizer", atlasTargetId: "serratus.anterior" },
    ],
    executionProfiles: [],
    bodyEffects: [],
    prescriptionSchema: {
      id: "prescription-v1",
      key: "strength_sets_reps",
      version: 1,
      checksum: "prescription-checksum",
      fields: [
        { key: "sets", label: "Sets", type: "integer", required: true, minimum: 1, maximum: 20 },
        { key: "reps", label: "Repetitions", type: "integer", required: true, minimum: 1, maximum: 100 },
      ],
    },
    performedMetricSchema: {
      id: "metrics-v1",
      key: "strength_metrics",
      version: 1,
      checksum: "metrics-checksum",
      fields: [
        { key: "external_load_kg", label: "Load", type: "number", unit: "kg" },
        { key: "repetitions", label: "Repetitions", type: "integer" },
      ],
    },
    recordDefinitions: [
      { id: "highest-load-v1", recordKey: "highest_load", comparisonDirection: "higher_better", canonicalUnit: "kg" },
      { id: "estimated-1rm-v1", recordKey: "estimated_one_rep_max", comparisonDirection: "higher_better", canonicalUnit: "kg" },
      { id: "same-load-reps-v1", recordKey: "same_load_max_repetitions", comparisonDirection: "higher_better", canonicalUnit: "repetitions" },
      { id: "session-volume-v1", recordKey: "exercise_session_volume", comparisonDirection: "higher_better", canonicalUnit: "kg_repetitions" },
    ],
    heatMap: { mapping: [
      { muscleName: "Chest", atlasTargetId: "pectoralis.middle", role: "primary" },
      { muscleName: "Triceps", atlasTargetId: "triceps.lateral_head", role: "secondary" },
      { muscleName: "Serratus", atlasTargetId: "serratus.anterior", role: "stabilizer" },
    ] },
    publicationPolicy: { id: "publication-v1", key: "member_visible", version: 1, checksum: "publication-checksum" },
    capabilityContract: { id: "capability-v1", version: "1", compatibleCatalogApiVersion: "v2", checksum: "capability-checksum" },
    authority: {
      libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum" },
      catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" },
      activityId: id,
      revisionId: alternative ? "revision-alt-v2" : "revision-squat-v7",
      revisionNumber: alternative ? 2 : 7,
    },
  };
}

function meta(languageKey) {
  return {
    apiVersion: "v2",
    locale: languageKey,
    libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum", publishedAt: "2026-08-01T00:00:00.000Z", strengthSemanticFingerprint: "strength-fingerprint" },
    catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" },
    source: "library_v2",
    degraded: false,
  };
}

function recordEvent(key, label, value, unit) {
  return {
    eventId: `event-${key}`,
    lineageId: `lineage-${key}`,
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

function performance() {
  return {
    performed: true,
    lastPerformedAt: "2026-08-11T18:20:00.000Z",
    recentWorkoutId: "session-squat",
    recentSessions: [{ activityId: "history-activity-squat", canonicalSessionId: "session-squat", title: "Lower body strength", effectiveAt: "2026-08-11T18:20:00.000Z", completedSetCount: 4, reliableVolume: 1860, resultKind: "strength", resultFacts: [] }],
    bests: [
      { key: "highest_load", event: recordEvent("highest_load", "Highest load", 142.5, "kg") },
      { key: "estimated_one_rep_max", event: recordEvent("estimated_one_rep_max", "Estimated 1RM", 160, "kg") },
      { key: "same_load_max_repetitions", event: recordEvent("same_load_max_repetitions", "Same-load max repetitions", 8, "repetitions") },
      { key: "exercise_session_volume", event: recordEvent("exercise_session_volume", "Exercise session volume", 1860, "kg_repetitions") },
    ],
  };
}

function routePath(route) {
  return route === "overview" ? `/workouts/${activityId}` : `/workouts/${activityId}/${route}`;
}

function expectedHeading(languageKey, route) {
  return route === "overview" ? languages[languageKey].exercise : languages[languageKey][route];
}

async function makeContext(browser, viewport, profile) {
  const language = languages[profile.languageKey];
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    locale: language.locale,
    colorScheme: profile.theme.key === "dark" ? "dark" : "light",
    reducedMotion: profile.motion,
  });
  await context.addInitScript(({ languageKey, themeId, userId }) => {
    localStorage.setItem("plaivra.language.v1", languageKey);
    localStorage.setItem("plaivra-theme-id", themeId);
    localStorage.setItem(`plaivra-exercise-favorites:${userId}`, "[]");
    localStorage.setItem(`plaivra-custom-exercises:${userId}`, "[]");
  }, { languageKey: profile.languageKey, themeId: profile.theme.id, userId: mockUserId });
  await context.addCookies([{ name: "plaivra.language.v1", value: profile.languageKey, domain: "localhost", path: "/" }]);
  const requests = [];
  context.on("request", (request) => requests.push(request.url()));
  await context.route("**/api/billing/entitlements", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"entitlements":[]}' }));
  await context.route("**/api/workouts/active-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"session":null}' }));
  await context.route("**/api/exercise-detail/performance?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(performance()) }));
  await context.route(`**/api/activity-catalog/library-activities/${activityId}?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: catalogActivity(profile.languageKey), meta: meta(profile.languageKey) }) }));
  await context.route(`**/api/activity-catalog/library-domains/strength/activities/${activityId}/alternatives?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ relationshipType: "equipment_substitution", rationale: "Same purpose with different equipment.", prescriptionTransfer: null, activity: catalogActivity(profile.languageKey, alternativeId) }], meta: meta(profile.languageKey) }) }));
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes("exercise_setup_notes")) return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    return route.fulfill({ status: request.method() === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: request.method() === "HEAD" ? "" : "[]" });
  });
  return { context, requests };
}

async function inspect(page, profile, viewport, route, zoom = 1) {
  await page.getByRole("heading", { level: 1, name: expectedHeading(profile.languageKey, route) }).waitFor({ timeout: 20_000 });
  if (zoom !== 1) await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
  await page.keyboard.press("Tab");
  return page.evaluate(({ expectedDir, expectedReduced }) => {
    const detailRoot = document.querySelector("[data-detail-platform]");
    const appShell = document.querySelector("[data-app-shell]");
    const header = appShell?.querySelector(":scope > header");
    const aside = appShell?.querySelector(":scope > aside");
    const visible = (node) => Boolean(node && getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden");
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea")].filter(visible);
    const unnamed = controls.filter((node) => {
      const id = node.getAttribute("id");
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      return !(node.getAttribute("aria-label")?.trim() || node.getAttribute("aria-labelledby")?.trim() || node.textContent?.trim() || node.getAttribute("placeholder")?.trim() || label);
    });
    const bodyText = document.body.innerText;
    return {
      h1Count: document.querySelectorAll("main h1").length,
      hasMain: Boolean(document.querySelector("main#main-content")),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      unnamed: unnamed.length,
      focusVisible: Boolean(document.activeElement && document.activeElement !== document.body && document.activeElement.matches(":focus-visible")),
      dir: detailRoot?.getAttribute("dir") || detailRoot?.closest("[dir]")?.getAttribute("dir") || null,
      expectedDir,
      focused: appShell?.getAttribute("data-focused-exercise-detail") === "true",
      headerVisible: visible(header),
      sidebarVisible: visible(aside),
      floatingNav: document.querySelectorAll("[data-mobile-floating-nav]").length,
      topbars: document.querySelectorAll("[data-exercise-detail-topbar]").length,
      surfaces: document.querySelectorAll("[data-detail-surface]").length,
      emptyMetrics: [...document.querySelectorAll("[data-detail-metric] dd")].filter((node) => !node.textContent?.trim()).length,
      emptyDefinitions: [...document.querySelectorAll("main dd")].filter((node) => !node.textContent?.trim()).length,
      forbidden: ["Demo Video", "Explore More", "revision-squat-v7", "library-release", "catalog-release", "prescription-checksum", "metrics-checksum"].filter((value) => bodyText.includes(value)),
      startVisible: [...document.querySelectorAll("a,button")].some((node) => /Start Workout|Training starten|بدء التمرين/.test(node.textContent || "")),
      reducedMedia: matchMedia("(prefers-reduced-motion: reduce)").matches,
      expectedReduced,
    };
  }, { expectedDir: languages[profile.languageKey].dir, expectedReduced: profile.motion === "reduce" });
}

function assertMetrics(metrics, viewport, scenario) {
  if (metrics.h1Count !== 1) throw new Error(`${scenario}: expected one H1, got ${metrics.h1Count}`);
  if (!metrics.hasMain) throw new Error(`${scenario}: main landmark missing`);
  if (metrics.overflow > 0) throw new Error(`${scenario}: ${metrics.overflow}px horizontal overflow`);
  if (metrics.unnamed) throw new Error(`${scenario}: ${metrics.unnamed} unnamed controls`);
  if (!metrics.focusVisible) throw new Error(`${scenario}: focus-visible proof failed`);
  if (metrics.dir !== metrics.expectedDir) throw new Error(`${scenario}: expected ${metrics.expectedDir}, got ${metrics.dir}`);
  if (!metrics.focused) throw new Error(`${scenario}: focused Detail shell missing`);
  if (metrics.topbars !== 1) throw new Error(`${scenario}: expected one Detail topbar, got ${metrics.topbars}`);
  if (metrics.floatingNav) throw new Error(`${scenario}: competing floating nav rendered`);
  if (viewport[0] < 1024 && metrics.headerVisible) throw new Error(`${scenario}: mobile global masthead is visible`);
  if (viewport[0] >= 1024 && !metrics.sidebarVisible) throw new Error(`${scenario}: desktop sidebar is not visible`);
  if (metrics.emptyMetrics || metrics.emptyDefinitions) throw new Error(`${scenario}: empty metric/definition row rendered`);
  if (metrics.forbidden.length) throw new Error(`${scenario}: internal/placeholder text leaked: ${metrics.forbidden.join(", ")}`);
  if (metrics.startVisible) throw new Error(`${scenario}: unsupported native V2 Start action rendered`);
  if (metrics.reducedMedia !== metrics.expectedReduced) throw new Error(`${scenario}: motion media mismatch`);
}

function assertRequests(requests, route, scenario) {
  const core = requests.filter((url) => url.includes(`/api/activity-catalog/library-activities/${activityId}`)).length;
  const alternatives = requests.filter((url) => url.includes(`/library-domains/strength/activities/${activityId}/alternatives`)).length;
  const setupNotes = requests.filter((url) => url.includes("exercise_setup_notes")).length;
  const performanceCalls = requests.filter((url) => url.includes("/api/exercise-detail/performance")).length;
  const domainScans = requests.filter((url) => /\/api\/activity-catalog\/library-domains(?:\?|$)/.test(url)).length;
  const videoCalls = requests.filter((url) => url.includes("user_exercise_videos") || url.includes("exercise_videos")).length;
  if (core !== 1) throw new Error(`${scenario}: expected one semantic core request, got ${core}`);
  if (domainScans) throw new Error(`${scenario}: serial domain discovery request detected`);
  if (videoCalls) throw new Error(`${scenario}: eager video request detected`);
  if (alternatives !== (route === "alternatives" ? 1 : 0)) throw new Error(`${scenario}: Alternatives request boundary violated (${alternatives})`);
  if (setupNotes > 0 && route !== "technique") throw new Error(`${scenario}: setup-note request escaped Technique`);
  if (performanceCalls > 0 && route !== "overview" && route !== "performance") throw new Error(`${scenario}: Performance request escaped Overview/Performance`);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

for (let index = 0; index < viewports.length; index += 1) {
  const viewport = viewports[index];
  const profile = viewportProfiles[index];
  for (const route of routes) {
    const scenario = `${route}-${profile.languageKey}-${profile.theme.key}-${profile.motion}-${viewport[0]}x${viewport[1]}`;
    const { context, requests } = await makeContext(browser, viewport, profile);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      const response = await page.goto(`${baseUrl}${routePath(route)}`, { waitUntil: "networkidle", timeout: 45_000 });
      if (!response?.ok()) throw new Error(`${scenario}: navigation returned ${response?.status() ?? "no response"}`);
      const metrics = await inspect(page, profile, viewport, route);
      assertMetrics(metrics, viewport, scenario);
      assertRequests(requests, route, scenario);
      if (pageErrors.length) throw new Error(`${scenario}: page errors: ${pageErrors.join(" | ")}`);
      const screenshot = (viewport[0] === 390 || viewport[0] === 412 || viewport[0] === 1440) && ["overview", "anatomy", "technique", "performance", "alternatives"].includes(route);
      if (screenshot) await page.screenshot({ path: path.join(outputDir, `${scenario}.png`), fullPage: true });
      results.push({ scenario, route, viewport, ...profile, metrics, requestCount: requests.length });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      await context.close();
    }
  }
}

// Explicit 200% scaling proof across all six routes.
for (const route of routes) {
  const viewport = [768, 1024];
  const profile = { languageKey: "ar", theme: themes[0], motion: "reduce" };
  const scenario = `zoom200-${route}-ar-light-768x1024`;
  const { context, requests } = await makeContext(browser, viewport, profile);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${routePath(route)}`, { waitUntil: "networkidle", timeout: 45_000 });
    const metrics = await inspect(page, profile, viewport, route, 2);
    assertMetrics(metrics, viewport, scenario);
    assertRequests(requests, route, scenario);
    results.push({ scenario, route, viewport, ...profile, zoom: 2, metrics, requestCount: requests.length });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

// Client-navigation proof: the shared [id] provider must persist and core detail must not refetch.
for (const navCase of [
  { key: "mobile", viewport: [390, 844], profile: { languageKey: "en", theme: themes[0], motion: "no-preference" } },
  { key: "desktop-rtl", viewport: [1440, 900], profile: { languageKey: "ar", theme: themes[1], motion: "reduce" } },
]) {
  const { context, requests } = await makeContext(browser, navCase.viewport, navCase.profile);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${routePath("overview")}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("heading", { level: 1, name: expectedHeading(navCase.profile.languageKey, "overview") }).waitFor();
    for (const route of routes.slice(1)) {
      const start = requests.length;
      await page.locator(`a[href="${routePath(route)}"]`).first().click();
      await page.waitForURL(new RegExp(`${routePath(route)}(?:\\?.*)?$`));
      await page.waitForLoadState("networkidle");
      const metrics = await inspect(page, navCase.profile, navCase.viewport, route);
      assertMetrics(metrics, navCase.viewport, `${navCase.key}-nav-${route}`);
      const delta = requests.slice(start);
      if (delta.some((url) => url.includes(`/api/activity-catalog/library-activities/${activityId}`))) throw new Error(`${navCase.key}-nav-${route}: shared provider refetched core detail`);
      await page.locator(`a[href="${routePath("overview")}"]`).first().click();
      await page.waitForURL(new RegExp(`${routePath("overview")}(?:\\?.*)?$`));
      await page.getByRole("heading", { level: 1, name: expectedHeading(navCase.profile.languageKey, "overview") }).waitFor();
    }
    const totalCore = requests.filter((url) => url.includes(`/api/activity-catalog/library-activities/${activityId}`)).length;
    if (totalCore !== 1) throw new Error(`${navCase.key}: expected one core request across nested navigation, got ${totalCore}`);
    results.push({ scenario: `${navCase.key}-persistent-provider`, route: "navigation", viewport: navCase.viewport, ...navCase.profile, totalCore });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

await browser.close();
const report = {
  authority: "exercise-detail-v2-rendered-matrix",
  generatedAt: new Date().toISOString(),
  headSha: process.env.QA_HEAD_SHA || null,
  workflowRunId: process.env.QA_WORKFLOW_RUN_ID || null,
  routes,
  viewports,
  localeCoverage: Object.keys(languages),
  themeCoverage: themes.map((theme) => theme.key),
  motionCoverage: ["no-preference", "reduce"],
  scalingCoverage: [1, 2],
  scenarioCount: results.length,
  failures,
  results,
};
await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ authority: report.authority, scenarioCount: report.scenarioCount, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ authority: report.authority, scenarioCount: report.scenarioCount, routes, viewports, localeCoverage: report.localeCoverage, themeCoverage: report.themeCoverage, motionCoverage: report.motionCoverage, scalingCoverage: report.scalingCoverage }, null, 2));
}
