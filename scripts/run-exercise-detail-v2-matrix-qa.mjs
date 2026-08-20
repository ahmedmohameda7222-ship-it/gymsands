import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve(process.env.QA_EXERCISE_DETAIL_V2_EVIDENCE_DIR || "ci-reports/exercise-detail-v2-evidence");
const activityId = "ead598db-a7db-5cdd-9b10-512f0d353fc7";
const alternativeId = "11111111-1111-4111-8111-111111111111";
const mockUserId = "10000000-0000-4000-8000-000000000001";
const routes = ["overview", "anatomy", "technique", "performance", "alternatives", "details"];
const themes = [{ key: "light", id: "olive" }, { key: "dark", id: "elite-noir" }];

const languages = {
  en: {
    locale: "en-GB", dir: "ltr", exercise: "Barbell back squat",
    description: "A controlled compound squat using a barbell across the upper back.",
    instructions: ["Set your stance and brace your trunk.", "Descend under control, then drive through the floor."],
    activityType: "Strength exercise", difficulty: "Intermediate",
    equipment: ["Barbell", "Squat Rack"], muscles: ["Quadriceps", "Glutes", "Hamstrings"],
    anatomy: "Anatomy & Target", technique: "Technique & Setup", performance: "Performance", alternatives: "Alternatives", details: "Exercise Details",
    allSessions: "All Sessions", view: "View", replace: "Replace",
    reasons: ["Machine taken", "Equipment unavailable", "Too hard", "Want harder", "Pain / discomfort", "No spotter / support", "Not confident with technique", "Want variation"],
  },
  de: {
    locale: "de-DE", dir: "ltr", exercise: "Langhantel-Kniebeuge",
    description: "Eine kontrollierte mehrgelenkige Kniebeuge mit der Langhantel auf dem oberen Rücken.",
    instructions: ["Stelle deinen Stand ein und spanne den Rumpf an.", "Gehe kontrolliert nach unten und drücke dich über den Boden wieder hoch."],
    activityType: "Kraftübung", difficulty: "Fortgeschritten",
    equipment: ["Langhantel", "Kniebeugenständer"], muscles: ["Quadrizeps", "Gesäß", "Beinbeuger"],
    anatomy: "Anatomie & Ziel", technique: "Technik & Einstellung", performance: "Leistung", alternatives: "Alternativen", details: "Übungsdetails",
    allSessions: "Alle Einheiten", view: "Anzeigen", replace: "Ersetzen",
    reasons: ["Gerät belegt", "Ausrüstung nicht verfügbar", "Zu schwer", "Schwieriger gewünscht", "Schmerz / Beschwerden", "Keine Sicherung / Unterstützung", "Unsicher bei der Technik", "Variation gewünscht"],
  },
  ar: {
    locale: "ar-EG", dir: "rtl", exercise: "قرفصاء خلفية بالبار",
    description: "قرفصاء مركبة بتحكم باستخدام البار على أعلى الظهر.",
    instructions: ["اضبط وقفتك وثبّت عضلات الجذع.", "انزل بتحكم ثم ادفع عبر الأرض للعودة للأعلى."],
    activityType: "تمرين قوة", difficulty: "متوسط",
    equipment: ["بار حديد", "حامل السكوات"], muscles: ["عضلات الفخذ الأمامية", "عضلات المؤخرة", "عضلات الفخذ الخلفية"],
    anatomy: "التشريح والعضلات المستهدفة", technique: "الأسلوب والإعداد", performance: "الأداء", alternatives: "البدائل", details: "تفاصيل التمرين",
    allSessions: "كل الجلسات", view: "عرض", replace: "استبدال",
    reasons: ["الجهاز مشغول", "المعدات غير متاحة", "صعب جدًا", "أريد أصعب", "ألم / انزعاج", "لا يوجد مساعدة / دعم", "غير واثق من الأسلوب", "أريد تنويعًا"],
  },
};

const iphoneUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const androidUserAgent = "Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP2A.250705.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

const profiles = [
  { key: "ios-en", platform: "ios", viewport: [390, 844], languageKey: "en", theme: themes[0], motion: "no-preference", userAgent: iphoneUserAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { key: "ios-de-dark-reduced", platform: "ios", viewport: [393, 852], languageKey: "de", theme: themes[1], motion: "reduce", userAgent: iphoneUserAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { key: "ios-ar-rtl", platform: "ios", viewport: [430, 932], languageKey: "ar", theme: themes[0], motion: "no-preference", userAgent: iphoneUserAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { key: "android-en-dark-reduced", platform: "android", viewport: [412, 915], languageKey: "en", theme: themes[1], motion: "reduce", userAgent: androidUserAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 2.75 },
  { key: "android-de", platform: "android", viewport: [430, 932], languageKey: "de", theme: themes[0], motion: "no-preference", userAgent: androidUserAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 2.75 },
  { key: "web-ar-tablet", platform: "web", viewport: [768, 1024], languageKey: "ar", theme: themes[1], motion: "reduce" },
  { key: "web-en-desktop", platform: "web", viewport: [1280, 800], languageKey: "en", theme: themes[0], motion: "reduce" },
  { key: "web-de-desktop", platform: "web", viewport: [1440, 900], languageKey: "de", theme: themes[1], motion: "no-preference" },
];

const englishCatalogLeakValues = [
  "Barbell back squat",
  "A controlled compound squat using a barbell across the upper back.",
  "Set your stance and brace your trunk.",
  "Descend under control, then drive through the floor.",
  "Strength exercise",
  "Intermediate",
  "Barbell",
  "Squat Rack",
  "Quadriceps",
  "Glutes",
  "Hamstrings",
];

function activityName(languageKey, alternative = false) {
  if (!alternative) return languages[languageKey].exercise;
  if (languageKey === "de") return "Kurzhantel-Kniebeuge";
  if (languageKey === "ar") return "قرفصاء بالدمبل";
  return "Dumbbell squat";
}

function alternativeDescription(languageKey) {
  if (languageKey === "de") return "Eine Kniebeugenvariante mit Kurzhanteln.";
  if (languageKey === "ar") return "تنويع للقرفصاء باستخدام الدمبل.";
  return "A squat variation using dumbbells.";
}

function catalogActivity(languageKey, id = activityId) {
  const alternative = id === alternativeId;
  const language = languages[languageKey];
  return {
    id,
    domain: "strength",
    revisionId: alternative ? "revision-alt-v2" : "revision-squat-v7",
    revisionNumber: alternative ? 2 : 7,
    revisionLifecycle: "published",
    revisionChecksum: alternative ? "alt-revision-checksum" : "revision-checksum",
    slug: alternative ? "dumbbell-squat" : "barbell-back-squat",
    name: activityName(languageKey, alternative),
    shortDescription: alternative ? alternativeDescription(languageKey) : language.description,
    instructions: language.instructions.map((step, index) => ({ order: index + 1, text: step })),
    difficulty: alternative ? "beginner" : "intermediate",
    movementPattern: "squat",
    mechanics: "compound",
    forceType: "push",
    // Semantic names stay canonical/English in the fixture on purpose; the Main
    // view-model must present them through reviewed locale mappings.
    activityType: { slug: "strength_exercise", name: "Strength exercise" },
    membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
    aliases: [],
    equipment: alternative
      ? [{ slug: "dumbbell", name: "Dumbbell", requirement: "required" }]
      : [{ slug: "barbell", name: "Barbell", requirement: "required" }, { slug: "squat_rack", name: "Squat rack", requirement: "optional" }],
    coverage: [
      { slug: "quadriceps", name: "Quadriceps", muscleName: "Quadriceps", role: "primary", atlasTargetId: "quadriceps.vastus_lateralis" },
      { slug: "gluteus_maximus", name: "Gluteus maximus", muscleName: "Gluteus maximus", role: "secondary", atlasTargetId: "gluteus_maximus.middle" },
      { slug: "hamstrings", name: "Hamstrings", muscleName: "Hamstrings", role: "stabilizer", atlasTargetId: "hamstrings.biceps_femoris_long_head" },
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
      { muscleName: "Quadriceps", atlasTargetId: "quadriceps.vastus_lateralis", role: "primary" },
      { muscleName: "Gluteus maximus", atlasTargetId: "gluteus_maximus.middle", role: "secondary" },
      { muscleName: "Hamstrings", atlasTargetId: "hamstrings.biceps_femoris_long_head", role: "stabilizer" },
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

async function makeContext(browser, profile) {
  const language = languages[profile.languageKey];
  const context = await browser.newContext({
    viewport: { width: profile.viewport[0], height: profile.viewport[1] },
    locale: language.locale,
    colorScheme: profile.theme.key === "dark" ? "dark" : "light",
    reducedMotion: profile.motion,
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    ...(profile.isMobile ? { isMobile: true } : {}),
    ...(profile.hasTouch ? { hasTouch: true } : {}),
    ...(profile.deviceScaleFactor ? { deviceScaleFactor: profile.deviceScaleFactor } : {}),
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

async function inspect(page, profile, route, zoom = 1) {
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
      platform: detailRoot?.getAttribute("data-detail-platform") ?? null,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      focused: appShell?.getAttribute("data-focused-exercise-detail") === "true",
      headerVisible: visible(header),
      sidebarVisible: visible(aside),
      floatingNav: document.querySelectorAll("[data-mobile-floating-nav]").length,
      topbars: document.querySelectorAll("[data-exercise-detail-topbar]").length,
      surfaces: document.querySelectorAll("[data-detail-surface]").length,
      surfacePlatforms: [...new Set([...document.querySelectorAll("[data-detail-surface-platform]")].map((node) => node.getAttribute("data-detail-surface-platform")))],
      emptyMetrics: [...document.querySelectorAll("[data-detail-metric] dd")].filter((node) => !node.textContent?.trim()).length,
      emptyDefinitions: [...document.querySelectorAll("main dd")].filter((node) => !node.textContent?.trim()).length,
      forbidden: ["Demo Video", "Explore More", "revision-squat-v7", "library-release", "catalog-release", "prescription-checksum", "metrics-checksum"].filter((value) => bodyText.includes(value)),
      startVisible: [...document.querySelectorAll("a,button")].some((node) => /Start Workout|Training starten|بدء التمرين/.test(node.textContent || "")),
      reducedMedia: matchMedia("(prefers-reduced-motion: reduce)").matches,
      expectedReduced,
    };
  }, { expectedDir: languages[profile.languageKey].dir, expectedReduced: profile.motion === "reduce" });
}

function assertMetrics(metrics, profile, scenario) {
  const viewport = profile.viewport;
  if (metrics.h1Count !== 1) throw new Error(`${scenario}: expected one H1, got ${metrics.h1Count}`);
  if (!metrics.hasMain) throw new Error(`${scenario}: main landmark missing`);
  if (metrics.overflow > 0) throw new Error(`${scenario}: ${metrics.overflow}px horizontal overflow`);
  if (metrics.unnamed) throw new Error(`${scenario}: ${metrics.unnamed} unnamed controls`);
  if (!metrics.focusVisible) throw new Error(`${scenario}: focus-visible proof failed`);
  if (metrics.dir !== metrics.expectedDir) throw new Error(`${scenario}: expected ${metrics.expectedDir}, got ${metrics.dir}`);
  if (metrics.platform !== profile.platform) throw new Error(`${scenario}: expected platform ${profile.platform}, got ${metrics.platform}`);
  if (metrics.surfacePlatforms.some((value) => value !== profile.platform)) throw new Error(`${scenario}: Detail surface platform drift: ${metrics.surfacePlatforms.join(",")}`);
  if (profile.platform === "ios" && !/iPhone|iPad|iPod/i.test(metrics.userAgent)) throw new Error(`${scenario}: iOS user agent emulation missing`);
  if (profile.platform === "android" && !/Android/i.test(metrics.userAgent)) throw new Error(`${scenario}: Android user agent emulation missing`);
  if ((profile.platform === "ios" || profile.platform === "android") && metrics.maxTouchPoints < 1) throw new Error(`${scenario}: mobile touch context missing`);
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

async function assertLocalizedOverview(page, profile, scenario) {
  if (profile.languageKey === "en") return;
  const language = languages[profile.languageKey];
  const bodyText = await page.locator("main").innerText();
  const required = [
    language.exercise,
    language.description,
    ...language.instructions,
    language.activityType,
    language.difficulty,
    ...language.equipment,
    ...language.muscles,
  ];
  const missing = required.filter((value) => !bodyText.includes(value));
  if (missing.length) throw new Error(`${scenario}: localized Catalog content missing: ${missing.join(" | ")}`);
  const leaked = englishCatalogLeakValues.filter((value) => bodyText.includes(value));
  if (leaked.length) throw new Error(`${scenario}: English Catalog fixture leaked into ${profile.languageKey}: ${leaked.join(" | ")}`);
}

async function assertRouteContracts(page, profile, route, scenario) {
  if (route === "overview") await assertLocalizedOverview(page, profile, scenario);
  if (route === "performance") {
    const href = await page.getByRole("link", { name: languages[profile.languageKey].allSessions }).getAttribute("href");
    const expected = `/workout-history?exerciseId=provider%3Aplaivra_activity_catalog%3A${activityId}`;
    if (href !== expected) throw new Error(`${scenario}: All Sessions lost exercise context (${href ?? "missing"})`);
  }
  if (route === "alternatives") {
    const trigger = page.locator("#exercise-alternative-reason");
    await trigger.click();
    const optionText = (await page.locator('[role="option"]').allTextContents()).map((value) => value.trim());
    for (const label of languages[profile.languageKey].reasons) {
      if (!optionText.includes(label)) throw new Error(`${scenario}: replacement reason missing: ${label}`);
    }
    if (optionText.some((value) => /^Other$|^Sonstiges$|^أخرى$/i.test(value))) throw new Error(`${scenario}: legacy Other reason exposed`);
    await page.keyboard.press("Escape");
    if (await page.getByRole("link", { name: languages[profile.languageKey].view }).count() < 1) throw new Error(`${scenario}: Detail alternative View action missing`);
    if (await page.getByRole("button", { name: languages[profile.languageKey].replace }).count() > 0) throw new Error(`${scenario}: Detail alternatives exposed a mutation action`);
  }
}

function shouldScreenshot(profile, route) {
  if (profile.key === "ios-en" && ["overview", "anatomy", "technique", "performance", "alternatives"].includes(route)) return true;
  if (profile.key === "android-en-dark-reduced" && ["overview", "alternatives"].includes(route)) return true;
  if (profile.key === "web-en-desktop" && ["overview", "performance"].includes(route)) return true;
  if ((profile.key === "ios-de-dark-reduced" || profile.key === "ios-ar-rtl") && route === "overview") return true;
  return false;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
const screenshotFiles = [];

for (const profile of profiles) {
  for (const route of routes) {
    const scenario = `${profile.platform}-${route}-${profile.languageKey}-${profile.theme.key}-${profile.motion}-${profile.viewport[0]}x${profile.viewport[1]}`;
    const { context, requests } = await makeContext(browser, profile);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      const response = await page.goto(`${baseUrl}${routePath(route)}`, { waitUntil: "networkidle", timeout: 45_000 });
      if (!response?.ok()) throw new Error(`${scenario}: navigation returned ${response?.status() ?? "no response"}`);
      const metrics = await inspect(page, profile, route);
      assertMetrics(metrics, profile, scenario);
      assertRequests(requests, route, scenario);
      await assertRouteContracts(page, profile, route, scenario);
      if (pageErrors.length) throw new Error(`${scenario}: page errors: ${pageErrors.join(" | ")}`);
      if (shouldScreenshot(profile, route)) {
        const fileName = `${scenario}.png`;
        await page.screenshot({ path: path.join(outputDir, fileName), fullPage: true });
        screenshotFiles.push(fileName);
      }
      results.push({ scenario, route, platform: profile.platform, viewport: profile.viewport, languageKey: profile.languageKey, theme: profile.theme, motion: profile.motion, metrics, requestCount: requests.length });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      await context.close();
    }
  }
}

// Explicit 200% scaling proof across all six routes, still with a Web UA/context.
for (const route of routes) {
  const profile = { key: "web-ar-zoom200", platform: "web", viewport: [768, 1024], languageKey: "ar", theme: themes[0], motion: "reduce" };
  const scenario = `web-zoom200-${route}-ar-light-768x1024`;
  const { context, requests } = await makeContext(browser, profile);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${routePath(route)}`, { waitUntil: "networkidle", timeout: 45_000 });
    const metrics = await inspect(page, profile, route, 2);
    assertMetrics(metrics, profile, scenario);
    assertRequests(requests, route, scenario);
    await assertRouteContracts(page, profile, route, scenario);
    if (["overview", "anatomy"].includes(route)) {
      const fileName = `${scenario}.png`;
      await page.screenshot({ path: path.join(outputDir, fileName), fullPage: true });
      screenshotFiles.push(fileName);
    }
    results.push({ scenario, route, platform: profile.platform, viewport: profile.viewport, languageKey: profile.languageKey, theme: profile.theme, motion: profile.motion, zoom: 2, metrics, requestCount: requests.length });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

// Client-navigation proof: the shared [id] provider must persist and core detail must not refetch.
for (const navCase of [
  { key: "ios-mobile", profile: profiles.find((item) => item.key === "ios-en") },
  { key: "desktop-rtl", profile: { key: "web-ar-nav", platform: "web", viewport: [1440, 900], languageKey: "ar", theme: themes[1], motion: "reduce" } },
]) {
  const profile = navCase.profile;
  const { context, requests } = await makeContext(browser, profile);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${routePath("overview")}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("heading", { level: 1, name: expectedHeading(profile.languageKey, "overview") }).waitFor();
    for (const route of routes.slice(1)) {
      const start = requests.length;
      await page.locator(`a[href="${routePath(route)}"]`).first().click();
      await page.waitForURL(new RegExp(`${routePath(route)}(?:\\?.*)?$`));
      await page.waitForLoadState("networkidle");
      const metrics = await inspect(page, profile, route);
      assertMetrics(metrics, profile, `${navCase.key}-nav-${route}`);
      await assertRouteContracts(page, profile, route, `${navCase.key}-nav-${route}`);
      const delta = requests.slice(start);
      if (delta.some((url) => url.includes(`/api/activity-catalog/library-activities/${activityId}`))) throw new Error(`${navCase.key}-nav-${route}: shared provider refetched core detail`);
      await page.locator(`a[href="${routePath("overview")}"]`).first().click();
      await page.waitForURL(new RegExp(`${routePath("overview")}(?:\\?.*)?$`));
      await page.getByRole("heading", { level: 1, name: expectedHeading(profile.languageKey, "overview") }).waitFor();
    }
    const totalCore = requests.filter((url) => url.includes(`/api/activity-catalog/library-activities/${activityId}`)).length;
    if (totalCore !== 1) throw new Error(`${navCase.key}: expected one core request across nested navigation, got ${totalCore}`);
    results.push({ scenario: `${navCase.key}-persistent-provider`, route: "navigation", platform: profile.platform, viewport: profile.viewport, languageKey: profile.languageKey, theme: profile.theme, motion: profile.motion, totalCore });
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
  profiles: profiles.map(({ userAgent, ...profile }) => ({ ...profile, userAgentClass: profile.platform === "ios" ? "iPhone/iOS" : profile.platform === "android" ? "Android" : "Chromium Web" })),
  localeCoverage: Object.keys(languages),
  platformCoverage: [...new Set(profiles.map((profile) => profile.platform))],
  themeCoverage: themes.map((theme) => theme.key),
  motionCoverage: ["no-preference", "reduce"],
  scalingCoverage: [1, 2],
  screenshotFiles,
  scenarioCount: results.length,
  failures,
  results,
};
await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ authority: report.authority, scenarioCount: report.scenarioCount, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ authority: report.authority, scenarioCount: report.scenarioCount, routes, platformCoverage: report.platformCoverage, localeCoverage: report.localeCoverage, themeCoverage: report.themeCoverage, motionCoverage: report.motionCoverage, scalingCoverage: report.scalingCoverage, screenshotCount: screenshotFiles.length }, null, 2));
}
