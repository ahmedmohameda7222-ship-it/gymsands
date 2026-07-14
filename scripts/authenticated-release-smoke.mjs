import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const MIGRATION_VERSION = /^\d{12,14}$/;
const RECORD_UUID = /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi;
const UUID_SEGMENT = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LONG_NUMERIC_SEGMENT = /^\d{8,}$/;
const PATH_IN_TEXT = /(?<![:/])(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+(?:\?[^\s"'`<>]*)?(?:#[^\s"'`<>]*)?/g;
const URL_IN_TEXT = /https?:\/\/[^\s"'`<>]+/gi;
const STANDALONE_OPAQUE_TOKEN = /(?<![A-Za-z0-9_./:-])([A-Za-z0-9_-]{20,128})(?![A-Za-z0-9_./-])/g;
const runtimeEvidence = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [], routes: [], screenshots: [], requestMetrics: {} };
const ROUTES = [
  { id: "dashboard", path: "/dashboard" },
  { id: "train", path: "/my-workout/plans" },
  { id: "active-workout", path: "/today-workout", optional: true },
  { id: "eat", path: "/calories" },
  { id: "meal-plan", path: "/my-meal-plan" },
  { id: "progress", path: "/progress" },
  { id: "settings", path: "/settings" },
  { id: "privacy-controls", path: "/settings/data-privacy" }
];
const BOUNDARY_TEXT = [
  "Something went wrong",
  "This page could not load properly",
  "This Plaivra view could not load",
  "Plaivra could not continue",
  "Plaivra could not start"
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function baseUrl(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Authenticated smoke URL must use HTTPS except for localhost.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function segmentEntropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function isOpaquePathSegment(rawSegment) {
  if (!rawSegment) return false;
  let segment;
  try {
    segment = decodeURIComponent(rawSegment);
  } catch {
    return true;
  }
  if (!/^[A-Za-z0-9._~-]+$/.test(segment)) return true;
  const candidate = segment.replace(/\.[a-z0-9]{1,8}$/i, "");
  if (UUID_SEGMENT.test(candidate) || LONG_NUMERIC_SEGMENT.test(candidate)) return true;
  if (candidate.length < 20) return false;
  if (/^[a-z]+(?:-[a-z]+)+$/.test(candidate)) return false;
  if (/^[a-z]{2,16}_[A-Za-z0-9_-]{12,}$/i.test(candidate)) return true;
  const categories = [/[a-z]/.test(candidate), /[A-Z]/.test(candidate), /\d/.test(candidate), /[_-]/.test(candidate)].filter(Boolean).length;
  return categories >= 3 || (categories >= 2 && segmentEntropy(candidate) >= 3.25) || segmentEntropy(candidate) >= 3.75;
}

export function sanitizeEvidencePath(value, limit = 180) {
  try {
    const url = new URL(String(value), "https://plaivra.invalid");
    const segments = url.pathname.split("/").map((segment) => isOpaquePathSegment(segment) ? "id" : segment);
    return segments.join("/").replace(/\/+/g, "/").slice(0, limit) || "/";
  } catch {
    return "/unknown";
  }
}

export function sanitizeEvidenceUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.origin}${sanitizeEvidencePath(url.pathname)}`;
  } catch {
    return "invalid-url";
  }
}

export function sanitizeEvidenceArtifactPath(value) {
  const normalized = String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  return sanitizeEvidencePath(`/${normalized}`, 240).slice(1);
}

export function sanitizedText(value, limit = 500) {
  return String(value ?? "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b(authorization|cookie|set-cookie|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(URL_IN_TEXT, (url) => sanitizeEvidenceUrl(url))
    .replace(PATH_IN_TEXT, (path) => sanitizeEvidencePath(path))
    .replace(STANDALONE_OPAQUE_TOKEN, (token) => isOpaquePathSegment(token) ? "[REDACTED]" : token)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(RECORD_UUID, "[REDACTED]")
    .replace(/\bKey\s*\([^)\r\n]{1,200}\)\s*=\s*\([^)\r\n]{1,500}\)/gi, "Key [REDACTED]")
    .replace(/"[^"\r\n]{1,200}"/g, '"[REDACTED]"')
    .replace(/'[^'\r\n]{1,200}'/g, "'[REDACTED]'")
    .replace(/`[^`\r\n]{1,200}`/g, "`[REDACTED]`")
    .slice(0, limit);
}

function safePath(value) {
  return sanitizeEvidencePath(value);
}

function safeUrl(value) {
  return sanitizeEvidenceUrl(value);
}

export function sanitizeEvidence(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeEvidence(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeEvidence(childValue, childKey)]));
  }
  if (typeof value !== "string") return value;
  if (/^(?:expectedCommit|commitSha)$/i.test(key) && EXACT_SHA.test(value)) return value.toLowerCase();
  if (/screenshot/i.test(key)) return sanitizeEvidenceArtifactPath(value);
  if (/url$/i.test(key)) return /^https?:\/\//i.test(value) ? sanitizeEvidenceUrl(value) : sanitizedText(value, 1000);
  if (/(?:path|route)$/i.test(key)) return sanitizeEvidencePath(value);
  return sanitizedText(value, 1000);
}

function responseCount(data) {
  if (Array.isArray(data)) return data.length;
  return data && typeof data === "object" ? 1 : 0;
}

async function login(page, origin, email, password) {
  await page.goto(new URL("/login", origin).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  if (page.url().includes("/login")) throw new Error("Authentication redirect persisted after successful login attempt.");
}

async function assertNoBoundary(page) {
  const body = await page.locator("body").innerText().catch(() => "");
  const found = BOUNDARY_TEXT.find((text) => body.includes(text));
  if (found) throw new Error(`Route error-boundary UI detected: ${found}`);
}

async function visitRoute(page, origin, route, routeEvidence, screenshotDirectory) {
  const startedAt = Date.now();
  let response;
  try {
    response = await page.goto(new URL(route.path, origin).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("main#main-content").waitFor({ state: "visible", timeout: 30_000 }).catch(async () => {
      await page.locator("main").first().waitFor({ state: "visible", timeout: 10_000 });
    });
    await assertNoBoundary(page);
    if (page.url().includes("/login")) throw new Error(`Authentication was lost while opening ${route.path}.`);
    const rawFinalPath = new URL(page.url()).pathname;
    const optionalRedirect = Boolean(route.optional && rawFinalPath !== route.path);
    await page.screenshot({ path: resolve(screenshotDirectory, `${route.id}.png`), fullPage: true });
    routeEvidence.push({ id: route.id, path: safePath(route.path), finalPath: safePath(rawFinalPath), status: response?.status() ?? null, applicable: !optionalRedirect, durationMs: Date.now() - startedAt, screenshot: sanitizeEvidenceArtifactPath(`screenshots/${route.id}.png`), passed: true });
  } catch (error) {
    const screenshot = sanitizeEvidenceArtifactPath(`screenshots/failure-${route.id}.png`);
    await page.screenshot({ path: resolve(screenshotDirectory, `failure-${route.id}.png`), fullPage: true }).catch(() => {});
    runtimeEvidence.screenshots.push(screenshot);
    routeEvidence.push({ id: route.id, path: safePath(route.path), finalPath: safePath(page.url()), status: response?.status() ?? null, durationMs: Date.now() - startedAt, screenshot, passed: false, error: sanitizedText(error instanceof Error ? error.message : error, 300) });
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.mode || "local";
  if (!new Set(["local", "preview", "production"]).has(mode)) throw new Error("--mode must be local, preview, or production.");
  const account = options.account || "populated";
  if (!new Set(["populated", "empty"]).has(account)) throw new Error("--account must be populated or empty.");
  const origin = baseUrl(options.url || process.env.PLAIVRA_DEPLOYMENT_URL);
  const expectedCommit = (options["expected-commit"] || process.env.PLAIVRA_EXPECTED_COMMIT_SHA || "").trim().toLowerCase();
  const expectedMigration = (options["expected-migration"] || process.env.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION || "").trim();
  if (!EXACT_SHA.test(expectedCommit)) throw new Error("Authenticated smoke requires an exact 40-character expected commit SHA.");
  if (!MIGRATION_VERSION.test(expectedMigration)) throw new Error("Authenticated smoke requires an expected database migration version.");

  const prefix = account === "populated" ? "PLAIVRA_SMOKE_POPULATED" : "PLAIVRA_SMOKE_EMPTY";
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`Protected synthetic credentials are missing for the ${account} account.`);

  const outputDirectory = resolve(options.output || `quality-reports/authenticated-smoke-${account}`);
  const screenshotDirectory = resolve(outputDirectory, "screenshots");
  mkdirSync(screenshotDirectory, { recursive: true });

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const serverErrors = [];
  const routeEvidence = [];
  const requestMetrics = { total: 0, dashboard: 0, transferredBytes: 0 };
  const incidentState = { foodLogCount: null, targetRowCount: null, remainingValuesRendered: false };
  let dashboardActive = false;

  const browser = await chromium.launch({ headless: true });
  Object.assign(runtimeEvidence, { mode, accountState: account, deploymentUrl: safeUrl(origin.toString()), expectedCommit, expectedMigration, pageErrors, consoleErrors, failedRequests, serverErrors, routes: routeEvidence, requestMetrics, incidentState });
  try {
    const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/Berlin" });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    page.on("pageerror", (error) => pageErrors.push(sanitizedText(error.stack || error.message, 1600)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(sanitizedText(message.text(), 800));
    });
    page.on("request", () => {
      requestMetrics.total += 1;
      if (dashboardActive) requestMetrics.dashboard += 1;
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "request failed";
      if (!/ERR_ABORTED/i.test(failure)) failedRequests.push({ url: safeUrl(request.url()), error: sanitizedText(failure, 200) });
    });
    page.on("response", async (response) => {
      const url = new URL(response.url());
      const contentLength = Number(response.headers()["content-length"] ?? "0");
      if (Number.isFinite(contentLength) && contentLength > 0) requestMetrics.transferredBytes += contentLength;
      if (response.status() >= 500) serverErrors.push({ url: safeUrl(response.url()), status: response.status() });
      const table = url.pathname.split("/").at(-1);
      if (!new Set(["food_logs", "calorie_targets", "user_nutrition_target_profiles", "user_nutrition_target_date_overrides", "user_workout_plans"]).has(table)) return;
      try {
        const data = await response.json();
        const count = responseCount(data);
        if (table === "food_logs") incidentState.foodLogCount = Math.max(incidentState.foodLogCount ?? 0, count);
        else if (table === "user_workout_plans") incidentState.workoutPlanRowCount = Math.max(incidentState.workoutPlanRowCount ?? 0, count);
        else incidentState.targetRowCount = Math.max(incidentState.targetRowCount ?? 0, count);
      } catch {
        // The final populated/empty state assertions remain fail-closed.
      }
    });

    const versionResponse = await page.request.get(new URL("/api/version", origin).toString());
    const version = await versionResponse.json();
    runtimeEvidence.version = {
      status: versionResponse.status(),
      commitSha: version.commitSha,
      buildTimestamp: version.buildTimestamp,
      environment: version.environment,
      expectedDatabaseMigrationVersion: version.expectedDatabaseMigrationVersion,
      artifactIdentityValid: version.artifactIdentityValid,
      releaseReady: version.releaseReady
    };
    if (version.commitSha !== expectedCommit) throw new Error(`Deployed SHA ${version.commitSha || "missing"} does not match the reviewed SHA.`);
    if (version.expectedDatabaseMigrationVersion !== expectedMigration) throw new Error("Artifact migration identity does not match the expected migration.");
    if (!version.buildTimestamp || Number.isNaN(Date.parse(version.buildTimestamp))) throw new Error("Deployment build timestamp is invalid.");
    if (mode === "production" && (versionResponse.status() !== 200 || version.releaseReady !== true)) {
      throw new Error("Production version endpoint is not release-ready.");
    }

    await login(page, origin, email, password);
    for (const route of ROUTES) {
      dashboardActive = route.id === "dashboard";
      await visitRoute(page, origin, route, routeEvidence, screenshotDirectory);
      if (route.id === "dashboard") {
        const progress = page.locator('section[aria-labelledby="today-progress"]');
        await progress.waitFor({ state: "visible" });
        const state = await progress.evaluate((element) => ({
          nutritionLoaded: element.getAttribute("data-nutrition-loaded") === "true",
          foodLogCount: Number(element.getAttribute("data-food-log-count")),
          activeTarget: element.getAttribute("data-active-target") === "true",
          remainingCalculated: element.getAttribute("data-remaining-calculated") === "true"
        }));
        incidentState.nutritionLoaded = state.nutritionLoaded;
        incidentState.foodLogCount = Number.isFinite(state.foodLogCount) ? state.foodLogCount : null;
        incidentState.activeTarget = state.activeTarget;
        incidentState.remainingValuesRendered = state.remainingCalculated;
      }
      dashboardActive = false;
    }

    if (account === "populated") {
      if ((incidentState.foodLogCount ?? 0) < 1) throw new Error("Populated synthetic account did not expose at least one food log for the tested date.");
      if (!incidentState.nutritionLoaded || !incidentState.activeTarget) throw new Error("Populated synthetic account did not expose a loaded active nutrition target source.");
      if (!incidentState.remainingValuesRendered) throw new Error("Dashboard did not render calculated remaining values for the populated incident state.");
    } else if ((incidentState.foodLogCount ?? 0) !== 0) {
      throw new Error("Empty synthetic account unexpectedly returned food logs.");
    }

    const maxDashboardRequests = Number(options["max-dashboard-requests"] || process.env.PLAIVRA_SMOKE_MAX_DASHBOARD_REQUESTS || "80");
    const maxTotalRequests = Number(options["max-total-requests"] || process.env.PLAIVRA_SMOKE_MAX_TOTAL_REQUESTS || "350");
    if (requestMetrics.dashboard > maxDashboardRequests) throw new Error(`Dashboard request budget exceeded: ${requestMetrics.dashboard}/${maxDashboardRequests}.`);
    if (requestMetrics.total > maxTotalRequests) throw new Error(`Total smoke request budget exceeded: ${requestMetrics.total}/${maxTotalRequests}.`);
    if (pageErrors.length) throw new Error(`Browser page errors detected: ${pageErrors.length}.`);
    if (consoleErrors.length) throw new Error(`Unexpected console errors detected: ${consoleErrors.length}.`);
    if (failedRequests.length) throw new Error(`Critical failed requests detected: ${failedRequests.length}.`);
    if (serverErrors.length) throw new Error(`HTTP 5xx responses detected: ${serverErrors.length}.`);

    const evidence = {
      checkedAt: new Date().toISOString(),
      mode,
      accountState: account,
      deploymentUrl: safeUrl(origin.toString()),
      expectedCommit,
      expectedMigration,
      version: {
        commitSha: version.commitSha,
        buildTimestamp: version.buildTimestamp,
        environment: version.environment,
        releaseReady: version.releaseReady
      },
      incidentState,
      routes: routeEvidence,
      requestMetrics,
      budgets: { maxDashboardRequests, maxTotalRequests },
      pageErrors,
      consoleErrors,
      failedRequests,
      serverErrors,
      credentialsLogged: false,
      syntheticDataOnly: true,
      passed: true
    };
    writeFileSync(resolve(outputDirectory, "summary.json"), `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`, "utf8");
    console.log("Authenticated smoke summary written.");
  } finally {
    await browser.close();
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
  const argv = process.argv.slice(2);
  const outputIndex = argv.indexOf("--output");
  const accountIndex = argv.indexOf("--account");
  const account = accountIndex >= 0 ? argv[accountIndex + 1] : "unknown";
  const outputDirectory = resolve(outputIndex >= 0 ? argv[outputIndex + 1] : `quality-reports/authenticated-smoke-${account}`);
  mkdirSync(outputDirectory, { recursive: true });
  const summary = {
    checkedAt: new Date().toISOString(),
    ...runtimeEvidence,
    accountState: runtimeEvidence.accountState || account,
    passed: false,
    failureCode: "AUTHENTICATED_SMOKE_FAILED",
    failure: sanitizedText(error instanceof Error ? error.message : error, 500),
    credentialsLogged: false,
    syntheticDataOnly: true
  };
    const safeSummary = sanitizeEvidence(summary);
    writeFileSync(resolve(outputDirectory, "summary.json"), `${JSON.stringify(safeSummary, null, 2)}\n`, "utf8");
    console.error(safeSummary.failureCode);
    process.exitCode = 1;
  }
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  await run();
}
