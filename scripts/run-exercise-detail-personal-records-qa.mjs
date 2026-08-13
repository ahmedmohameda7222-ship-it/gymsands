import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.resolve(process.env.QA_EVIDENCE_DIR || path.join(tmpdir(), "plaivra-edpr-rendered-qa"));
const viewports = [
  [390, 844], [393, 852], [430, 932], [768, 1024],
  [1024, 768], [1280, 800], [1440, 900],
];
const locales = [
  { key: "en", locale: "en-GB", title: "Personal Records", exercise: "Barbell back squat", dir: "ltr" },
  { key: "de", locale: "de-DE", title: "Persönliche Rekorde", exercise: "Langhantel-Kniebeuge", dir: "ltr" },
  { key: "ar", locale: "ar-EG", title: "الأرقام الشخصية", exercise: "قرفصاء خلفية بالبار", dir: "rtl" },
];
const themes = [
  { key: "light", id: "olive" },
  { key: "dark", id: "elite-noir" },
];
const activityId = "ead598db-a7db-5cdd-9b10-512f0d353fc7";
const mockUserId = "10000000-0000-4000-8000-000000000001";

function event({ eventId, lineageId, name, sportDomain, sportName, key, label, value, unit, achievedAt, source, editable, context = [], sourceWorkoutId = null, notes = null }) {
  return {
    eventId, lineageId,
    subject: { identityKind: source === "verified" ? "verified_activity" : "custom_subject", identity: `${sportDomain}:${name}`, name, sportDomain, sportName },
    definition: { id: `${key}:v1`, key, version: "1", label, comparisonDirection: key === "fastest_time" ? "lower_better" : "higher_better", canonicalUnit: unit },
    value, context, achievedAt, rawAchievedAt: achievedAt, source, sourceWorkoutId, notes, editable,
    eventSemanticsVersion: source === "verified" ? "verified-set-event-v2" : "manual-event-time-v1",
    editAuthority: editable ? { catalogRevisionId: null, authoritySnapshot: {} } : null,
  };
}

function personalRecordsFixture() {
  const squat = event({ eventId: "pr-squat-2", lineageId: "lineage-squat", name: "Barbell back squat", sportDomain: "strength", sportName: "Strength", key: "highest_load", label: "Highest load", value: 142.5, unit: "kg", achievedAt: "2026-08-11T18:20:00Z", source: "verified", editable: false, sourceWorkoutId: "session-squat" });
  const squatPrevious = event({ eventId: "pr-squat-1", lineageId: "lineage-squat", name: "Barbell back squat", sportDomain: "strength", sportName: "Strength", key: "highest_load", label: "Highest load", value: 137.5, unit: "kg", achievedAt: "2026-07-20T18:00:00Z", source: "manual", editable: true, notes: "Competition standard depth" });
  const run = event({ eventId: "pr-run-2", lineageId: "lineage-run", name: "Park 5K", sportDomain: "running", sportName: "Running", key: "fastest_time", label: "Fastest time", value: 1192, unit: "seconds", achievedAt: "2026-08-09T07:30:00Z", source: "manual", editable: true, context: [{ key: "distance_meters", value: 5000, unit: "meters" }] });
  const legacy = event({ eventId: "pr-legacy", lineageId: "lineage-legacy", name: "Legacy row", sportDomain: null, sportName: null, key: "legacy_record", label: "Legacy record", value: 12, unit: "repetitions", achievedAt: "2026-06-01T12:00:00Z", source: "manual", editable: true });
  const summary = (currentBest, previousBest = null) => ({ lineageId: currentBest.lineageId, subject: currentBest.subject, definition: currentBest.definition, currentBest, previousBest });
  return {
    latestAchievement: squat,
    representedSports: [{ domain: "strength", name: "Strength" }, { domain: "running", name: "Running" }],
    groups: [
      { sportDomain: "strength", sportName: "Strength", records: [summary(squat, squatPrevious)] },
      { sportDomain: "running", sportName: "Running", records: [summary(run)] },
      { sportDomain: null, sportName: "Uncategorized", records: [summary(legacy)] },
    ],
    nextCursor: null,
    notices: [],
    detail: { lineage: summary(squat, squatPrevious), history: [squat, squatPrevious], selectedEventId: "pr-squat-2", nextCursor: null },
  };
}

function catalogFixture(language) {
  const names = { en: "Barbell back squat", de: "Langhantel-Kniebeuge", ar: "قرفصاء خلفية بالبار" };
  const detail = {
    id: activityId, revisionId: "revision-squat-v7", revisionNumber: 7, revisionLifecycle: "published", revisionChecksum: "revision-checksum",
    slug: "barbell-back-squat", name: names[language], shortDescription: "A controlled compound squat using a barbell across the upper back.",
    instructions: [{ order: 1, text: "Set the bar securely and brace your trunk." }, { order: 2, text: "Descend under control, then drive through the floor." }],
    difficulty: "Intermediate", movementPattern: "Squat", activityType: { slug: "strength_exercise", name: "Strength exercise" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true }, aliases: [],
    equipment: [{ slug: "barbell", name: "Barbell", requirement: "required" }, { slug: "rack", name: "Squat rack", requirement: "required" }],
    coverage: [{ role: "primary", name: "Quadriceps" }, { role: "primary", name: "Gluteus maximus" }, { role: "secondary", name: "Spinal erectors" }],
    executionProfiles: [], bodyEffects: [],
    prescriptionSchema: { id: "squat-prescription-v1", key: "strength_sets_reps", version: 1, checksum: "schema-checksum", fields: [{ key: "sets", label: "Sets", type: "integer", required: true, minimum: 1, maximum: 20 }, { key: "reps", label: "Repetitions", type: "text", required: true }] },
    performedMetricSchema: { id: "strength-metrics-v1", key: "strength_metrics", version: 1, checksum: "metrics-checksum", fields: [] },
    recordDefinitions: [{ id: "highest-load-v1", recordKey: "highest_load", comparisonDirection: "higher_better", canonicalUnit: "kg" }, { id: "estimated-1rm-v1", recordKey: "estimated_one_rep_max", comparisonDirection: "higher_better", canonicalUnit: "kg" }],
    heatMap: { mapping: [{ muscleName: "Quadriceps", role: "primary" }, { muscleName: "Gluteus maximus", role: "primary" }] },
    publicationPolicy: { id: "publication-v1", key: "member_visible", version: 1, checksum: "publication-checksum" },
    capabilityContract: { id: "capability-v1", version: "1", compatibleCatalogApiVersion: "v2", checksum: "capability-checksum" },
    authority: { libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum" }, catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" }, activityId, revisionId: "revision-squat-v7", revisionNumber: 7 },
  };
  const meta = { apiVersion: "v2", locale: language, libraryRelease: { id: "library-release", version: "2026.08", checksum: "library-checksum", publishedAt: "2026-08-01T00:00:00Z", strengthSemanticFingerprint: "strength-fingerprint" }, catalogRelease: { id: "catalog-release", version: "2026.08", checksum: "catalog-checksum" }, source: "library_v2", degraded: false };
  return { detail, meta };
}

async function createContext(browser, viewport, language, theme) {
  const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, locale: language.locale, colorScheme: theme.key === "dark" ? "dark" : "light", reducedMotion: "reduce" });
  await context.addInitScript(({ languageKey, themeId, userId }) => {
    localStorage.setItem("plaivra.language.v1", languageKey);
    localStorage.setItem("plaivra-theme-id", themeId);
    localStorage.setItem(`plaivra-exercise-favorites:${userId}`, JSON.stringify([]));
    localStorage.setItem(`plaivra-custom-exercises:${userId}`, JSON.stringify([]));
  }, { languageKey: language.key, themeId: theme.id, userId: mockUserId });
  await context.addCookies([{ name: "plaivra.language.v1", value: language.key, domain: "localhost", path: "/" }]);
  await context.route("**/api/billing/entitlements", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entitlements: [] }) }));
  await context.route("**/api/workouts/active-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: null }) }));
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    await route.fulfill({ status: method === "POST" ? 201 : 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: method === "HEAD" ? "" : "[]" });
  });
  const pr = personalRecordsFixture();
  await context.route("**/api/personal-records/exercise?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ performed: true, lastPerformedAt: "2026-08-11T18:20:00Z", highestLoad: pr.latestAchievement, estimatedOneRepMax: { ...pr.latestAchievement, eventId: "pr-estimated", definition: { ...pr.latestAchievement.definition, id: "estimated-1rm-v1", key: "estimated_one_rep_max", label: "Estimated 1RM" }, value: 160 }, recentWorkoutId: "session-squat" }) }));
  await context.route("**/api/personal-records/lineage-squat?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pr.detail) }));
  await context.route("**/api/personal-records?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ latestAchievement: pr.latestAchievement, representedSports: pr.representedSports, groups: pr.groups, nextCursor: null, notices: [] }) }));
  const catalog = catalogFixture(language.key);
  await context.route("**/api/activity-catalog/activities?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [], pagination: { limit: 100, offset: 0, total: 0 }, meta: catalog.meta }) }));
  await context.route("**/api/activity-catalog/library-domains?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ key: "strength", displayName: "Strength", coverageCount: 1, ownedMovementCanonicalCount: 1, archetypeCount: 1, membershipCount: 1, authorityKind: "canonical", checksum: "domain-checksum", tabs: [] }], meta: catalog.meta }) }));
  await context.route(`**/api/activity-catalog/library-domains/strength/activities/${activityId}/alternatives?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [], meta: catalog.meta }) }));
  await context.route(`**/api/activity-catalog/library-domains/strength/activities/${activityId}?**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: catalog.detail, meta: catalog.meta }) }));
  return context;
}

function validateMetrics(metrics, scenario) {
  if (!metrics.h1) throw new Error(`${scenario}: missing h1`);
  if (metrics.horizontalOverflowPx > 0) throw new Error(`${scenario}: ${metrics.horizontalOverflowPx}px horizontal overflow`);
  if (!metrics.hasMain) throw new Error(`${scenario}: missing main landmark`);
  if (metrics.unnamedInteractiveElements > 0) throw new Error(`${scenario}: ${metrics.unnamedInteractiveElements} unnamed controls`);
  if (!metrics.focusVisible) throw new Error(`${scenario}: keyboard focus was not visible`);
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of viewports) {
  for (const language of locales) {
    for (const theme of themes) {
      for (const routeSpec of [
        { key: "personal-records", path: "/personal-records", expected: language.title },
        { key: "exercise-detail", path: `/workouts/${activityId}`, expected: language.exercise },
      ]) {
        const context = await createContext(browser, viewport, language, theme);
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const response = await page.goto(`${baseUrl}${routeSpec.path}`, { waitUntil: "networkidle", timeout: 45_000 });
        await page.getByRole("heading", { level: 1, name: routeSpec.expected }).waitFor({ timeout: 20_000 });
        await page.keyboard.press("Tab");
        const metrics = await page.evaluate(() => {
          const root = document.documentElement;
          const active = document.activeElement;
          const activeStyle = active ? getComputedStyle(active) : null;
          const interactive = [...document.querySelectorAll("main button, main a, main input, main select, main textarea")].filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          });
          const unnamed = interactive.filter((element) => !String(element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "").trim());
          return {
            h1: document.querySelector("h1")?.textContent?.trim() || null,
            dir: document.querySelector("main[dir]")?.getAttribute("dir") || root.dir || "ltr",
            theme: root.dataset.theme || null,
            hasMain: Boolean(document.querySelector("main")),
            horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
            unnamedInteractiveElements: unnamed.length,
            focusVisible: Boolean(active && active !== document.body && activeStyle && (activeStyle.outlineStyle !== "none" || activeStyle.boxShadow !== "none")),
          };
        });
        const scenario = `${routeSpec.key}-${viewport[0]}x${viewport[1]}-${language.key}-${theme.key}`;
        validateMetrics(metrics, scenario);
        if (metrics.dir !== language.dir) throw new Error(`${scenario}: expected ${language.dir}, got ${metrics.dir}`);
        if (metrics.theme !== theme.id) throw new Error(`${scenario}: expected theme ${theme.id}, got ${metrics.theme}`);
        if (!response?.ok()) throw new Error(`${scenario}: HTTP ${response?.status()}`);
        if (pageErrors.length) throw new Error(`${scenario}: ${pageErrors.join(" | ")}`);
        if ((viewport[0] === 390 || viewport[0] === 1440) && (language.key === "en" || viewport[0] === 390)) {
          await page.screenshot({ path: path.join(evidenceDir, `${scenario}.png`), fullPage: true });
        }
        results.push({ scenario, ...metrics });
        await context.close();
      }
    }
  }
}

const zoomContext = await createContext(browser, [1280, 800], locales[0], themes[0]);
const zoomPage = await zoomContext.newPage();
await zoomPage.goto(`${baseUrl}/personal-records`, { waitUntil: "networkidle", timeout: 45_000 });
await zoomPage.getByRole("heading", { level: 1, name: locales[0].title }).waitFor();
await zoomPage.evaluate(() => { document.documentElement.style.zoom = "2"; });
const zoomOverflow = await zoomPage.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
if (zoomOverflow > 0) throw new Error(`personal-records-200-percent: ${zoomOverflow}px horizontal overflow`);
await zoomPage.screenshot({ path: path.join(evidenceDir, "personal-records-200-percent.png"), fullPage: true });
await zoomContext.close();

const keyboardContext = await createContext(browser, [390, 844], locales[0], themes[0]);
const keyboardPage = await keyboardContext.newPage();
await keyboardPage.goto(`${baseUrl}/personal-records`, { waitUntil: "networkidle", timeout: 45_000 });
await keyboardPage.getByRole("button", { name: "Add" }).click();
await keyboardPage.getByRole("dialog").waitFor();
await keyboardPage.keyboard.press("Tab");
await keyboardPage.keyboard.press("Escape");
await keyboardPage.getByRole("dialog").waitFor({ state: "hidden" });
await keyboardContext.close();

await browser.close();
await writeFile(path.join(evidenceDir, "results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results, zoomOverflow, keyboardDialog: "passed" }, null, 2));
console.log(`Exercise Detail + Personal Records rendered QA passed (${results.length} matrix scenarios).`);
console.log(`Evidence: ${evidenceDir}`);
