import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

import {
  sanitizeEvidence,
  sanitizeEvidenceArtifactPath,
  sanitizeEvidenceUrl,
  sanitizedText,
} from "./authenticated-release-smoke.mjs";

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const MIGRATION_VERSION = /^\d{12,14}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VERCEL_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/i;
const APPROVED_PRODUCTION_HOSTS = new Set([
  "plaivra.com",
  "app.plaivra.com",
  "www.plaivra.com",
]);
const ALLOWED_OPTIONS = new Set([
  "mode",
  "url",
  "expected-commit",
  "expected-migration",
  "samples",
  "warmups",
  "account",
  "output",
]);
const TODAY_DIRECT_TABLES = new Set([
  "user_workout_plans",
  "user_workout_plan_days",
  "user_workout_plan_exercises",
  "workout_sessions",
  "user_workout_sessions",
  "user_meal_plan_items",
  "food_logs",
  "calorie_targets",
  "user_nutrition_target_profiles",
  "user_nutrition_target_date_overrides",
  "water_logs",
  "user_grocery_items",
  "fitness_habits",
  "supplement_logs",
  "sleep_recovery_logs",
  "onboarding_answers",
  "user_nutrition_preference_profiles",
  "user_fitness_constraints",
  "progress_entries",
]);
const BOUNDARY_TEXT = [
  "Something went wrong",
  "This page could not load properly",
  "This Plaivra view could not load",
  "Plaivra could not continue",
  "Plaivra could not start",
];
const REQUIRED_DISCLAIMER = `These measurements describe the reviewed Production deployment and approved
synthetic fixtures at the recorded time. They are not a general user-latency
SLA and do not establish final launch budgets.`;
const DEFAULT_OUTPUT = "quality-reports/pcs3-production-measurement";
const SETTLEMENT_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 30_000;

export function parseCliArgs(argv) {
  const raw = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!ALLOWED_OPTIONS.has(key)) throw new Error(`Unknown option --${key}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      throw new Error(`Duplicate option --${key}.`);
    }
    raw[key] = value;
    index += 1;
  }
  return raw;
}

function boundedInteger(value, label, minimum, maximum, fallback) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be an integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function normalizeMeasurementOrigin(value, mode) {
  if (!value) throw new Error("--url is required.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--url must be a valid absolute URL.");
  }
  if (url.username || url.password) {
    throw new Error("Measurement URL must not contain credentials.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (mode === "production") {
    if (url.protocol !== "https:") {
      throw new Error("Production measurement requires HTTPS.");
    }
    if (
      !APPROVED_PRODUCTION_HOSTS.has(url.hostname) &&
      !SAFE_VERCEL_HOST.test(url.hostname)
    ) {
      throw new Error("Production measurement origin is not approved.");
    }
  } else if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Preview measurement requires HTTPS except for localhost.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function validateMeasurementOptions(raw) {
  if (!raw.mode || !new Set(["preview", "production"]).has(raw.mode)) {
    throw new Error("--mode must be preview or production.");
  }
  const account = raw.account ?? "both";
  if (!new Set(["populated", "empty", "both"]).has(account)) {
    throw new Error("--account must be populated, empty, or both.");
  }
  const expectedCommit = String(raw["expected-commit"] ?? "")
    .trim()
    .toLowerCase();
  if (!EXACT_SHA.test(expectedCommit)) {
    throw new Error("--expected-commit must be an exact 40-character SHA.");
  }
  const expectedMigration = String(raw["expected-migration"] ?? "").trim();
  if (!MIGRATION_VERSION.test(expectedMigration)) {
    throw new Error("--expected-migration must contain 12 to 14 digits.");
  }
  const samples = boundedInteger(raw.samples, "--samples", 10, 40, 20);
  const warmups = boundedInteger(raw.warmups, "--warmups", 0, 5, 2);
  const origin = normalizeMeasurementOrigin(raw.url, raw.mode);
  return {
    mode: raw.mode,
    origin,
    expectedCommit,
    expectedMigration,
    samples,
    warmups,
    account,
    output: resolve(raw.output ?? DEFAULT_OUTPUT),
  };
}

export function nearestRankPercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Percentiles require at least one valid sample.");
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new Error("Percentile must be greater than 0 and at most 100.");
  }
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length !== values.length) {
    throw new Error("Percentile samples must all be finite numbers.");
  }
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarizeMetric(values) {
  if (!values.length) throw new Error("Metric summary requires samples.");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    min: sorted[0],
    p50: nearestRankPercentile(sorted, 50),
    p95: nearestRankPercentile(sorted, 95),
    max: sorted.at(-1),
  };
}

export function parseServerTiming(value) {
  if (!value || !String(value).trim()) return null;
  const metrics = {};
  for (const part of String(value).split(",")) {
    const match = part.trim().match(/^([A-Za-z][A-Za-z0-9_-]*)\s*;\s*dur=([0-9]+(?:\.[0-9]+)?)$/);
    if (!match) return null;
    const duration = Number(match[2]);
    if (!Number.isFinite(duration) || duration < 0 || duration > 60_000) return null;
    if (Object.prototype.hasOwnProperty.call(metrics, match[1])) return null;
    metrics[match[1]] = Math.round(duration * 10) / 10;
  }
  return metrics;
}

function isSupabaseHost(hostname) {
  return (
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".supabase.in") ||
    hostname === "127.0.0.1" ||
    hostname === "localhost"
  );
}

export function classifySupabaseTable(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return null;
  }
  if (!isSupabaseHost(url.hostname)) return null;
  const match = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (!match) return null;
  return TODAY_DIRECT_TABLES.has(match[1]) ? match[1] : null;
}

export function classifyRequest(value, applicationOrigin) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return { category: "other" };
  }
  const expectedOrigin =
    applicationOrigin instanceof URL
      ? applicationOrigin.origin
      : new URL(String(applicationOrigin)).origin;
  if (url.origin === expectedOrigin && url.pathname === "/api/dashboard/today") {
    return { category: "today_projection" };
  }
  if (url.origin === expectedOrigin && url.pathname === "/api/workouts/history") {
    return {
      category: url.searchParams.has("cursor")
        ? "history_cursor"
        : "history_first_page",
    };
  }
  if (
    url.origin === expectedOrigin &&
    /^\/api\/workouts\/history\/(?:scheduled\/)?[^/]+$/.test(url.pathname)
  ) {
    return { category: "history_detail" };
  }
  if (
    /\/rpc\/get_private_app_bootstrap_v1$/.test(url.pathname) ||
    (url.origin === expectedOrigin && url.pathname.includes("private-app-bootstrap"))
  ) {
    return { category: "pcs2_bootstrap" };
  }
  const table = classifySupabaseTable(url);
  if (table) return { category: "today_supabase_read", table };
  return { category: "other" };
}

function contentLength(headers) {
  const raw = headers["content-length"];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function hasPrivateNoStore(headers) {
  const value = String(headers["cache-control"] ?? "").toLowerCase();
  return value.includes("private") && value.includes("no-store");
}

function variesAuthorization(headers) {
  return String(headers.vary ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase() === "authorization");
}

function hasNoSniff(headers) {
  return String(headers["x-content-type-options"] ?? "").toLowerCase() === "nosniff";
}

function hasValidRequestId(headers) {
  return REQUEST_ID.test(String(headers["x-request-id"] ?? ""));
}

export function safeResponseRecord({
  category,
  status,
  durationMs,
  decodedBodyBytes,
  headers,
}) {
  const timing = parseServerTiming(headers["server-timing"]);
  return {
    category,
    status,
    browserObservedDurationMs: Math.max(0, Math.round(durationMs * 10) / 10),
    decodedBodyBytes,
    contentLengthHeaderBytes: contentLength(headers),
    timing,
    headers: {
      privateNoStore: hasPrivateNoStore(headers),
      varyAuthorization: variesAuthorization(headers),
      noSniff: hasNoSniff(headers),
      requestIdPresent: hasValidRequestId(headers),
      todayContract:
        category === "today_projection"
          ? headers["x-plaivra-today-contract"] === "1"
          : undefined,
    },
  };
}

function assertCommonResponse(record, requiredTiming) {
  if (record.status !== 200) throw new Error("MEASUREMENT_HTTP_STATUS_INVALID");
  if (!record.headers.privateNoStore) throw new Error("MEASUREMENT_CACHE_HEADERS_INVALID");
  if (!record.headers.varyAuthorization) throw new Error("MEASUREMENT_VARY_HEADER_INVALID");
  if (!record.headers.noSniff) throw new Error("MEASUREMENT_NOSNIFF_HEADER_INVALID");
  if (!record.headers.requestIdPresent) throw new Error("MEASUREMENT_REQUEST_ID_MISSING");
  if (!record.timing) throw new Error("MEASUREMENT_SERVER_TIMING_INVALID");
  for (const metric of requiredTiming) {
    if (!Number.isFinite(record.timing[metric])) {
      throw new Error(`MEASUREMENT_SERVER_TIMING_${metric.toUpperCase()}_MISSING`);
    }
  }
}

function assertNoRuntimeFailures(capture) {
  if (capture.pageErrors.length) throw new Error("MEASUREMENT_PAGE_ERROR");
  if (capture.consoleErrors.length) throw new Error("MEASUREMENT_CONSOLE_ERROR");
  if (capture.requestFailures.length) throw new Error("MEASUREMENT_REQUEST_FAILURE");
  if (capture.http5xx > 0) throw new Error("MEASUREMENT_HTTP_5XX");
  if (capture.errorBoundary) throw new Error("MEASUREMENT_ERROR_BOUNDARY");
}

export function evaluateCapturedOperation(route, capture) {
  assertNoRuntimeFailures(capture);
  if (route === "today") {
    if (capture.counts.todayProjection !== 1) {
      throw new Error("TODAY_PROJECTION_REQUEST_COUNT_INVALID");
    }
    if (capture.counts.todayDirectSupabase !== 0) {
      throw new Error("TODAY_DIRECT_SUPABASE_READ_DETECTED");
    }
    const record = capture.responses.find(
      (response) => response.category === "today_projection",
    );
    if (!record) throw new Error("TODAY_PROJECTION_RESPONSE_MISSING");
    assertCommonResponse(record, ["total"]);
    if (!record.headers.todayContract) throw new Error("TODAY_CONTRACT_HEADER_INVALID");
    return {
      route: "today",
      requestCounts: {
        projection: 1,
        directSupabaseReads: 0,
        bootstrap: capture.counts.bootstrap,
      },
      status: record.status,
      browserObservedDurationMs: record.browserObservedDurationMs,
      serverTotalDurationMs: record.timing.total,
      domainTimingsMs: Object.fromEntries(
        Object.entries(record.timing).filter(([name]) => name !== "total"),
      ),
      decodedBodyBytes: record.decodedBodyBytes,
      contentLengthHeaderBytes: record.contentLengthHeaderBytes,
      headers: record.headers,
      failures: {
        pageErrors: 0,
        consoleErrors: 0,
        requestFailures: 0,
        http5xx: 0,
        errorBoundary: false,
      },
      passed: true,
    };
  }
  if (capture.counts.historyFirstPage !== 1) {
    throw new Error("HISTORY_FIRST_PAGE_REQUEST_COUNT_INVALID");
  }
  if (capture.counts.historyCursor !== 0) {
    throw new Error("HISTORY_INITIAL_CURSOR_REQUEST_DETECTED");
  }
  const record = capture.responses.find(
    (response) => response.category === "history_first_page",
  );
  if (!record) throw new Error("HISTORY_FIRST_PAGE_RESPONSE_MISSING");
  assertCommonResponse(record, ["total", "list", "filters"]);
  return {
    route: "history",
    requestCounts: {
      firstPage: 1,
      cursor: 0,
      detail: capture.counts.historyDetail,
    },
    status: record.status,
    browserObservedDurationMs: record.browserObservedDurationMs,
    serverTotalDurationMs: record.timing.total,
    serverListDurationMs: record.timing.list,
    serverFiltersDurationMs: record.timing.filters,
    decodedBodyBytes: record.decodedBodyBytes,
    contentLengthHeaderBytes: record.contentLengthHeaderBytes,
    headers: record.headers,
    failures: {
      pageErrors: 0,
      consoleErrors: 0,
      requestFailures: 0,
      http5xx: 0,
      errorBoundary: false,
    },
    passed: true,
  };
}

export function runInjectedHarness({ today, history }) {
  return {
    today: evaluateCapturedOperation("today", today),
    history: evaluateCapturedOperation("history", history),
  };
}

function emptyCapture() {
  return {
    responses: [],
    counts: {
      todayProjection: 0,
      todayDirectSupabase: 0,
      bootstrap: 0,
      historyFirstPage: 0,
      historyCursor: 0,
      historyDetail: 0,
    },
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    http5xx: 0,
    errorBoundary: false,
  };
}

function createCapture(page, origin) {
  const capture = emptyCapture();
  const starts = new WeakMap();
  const responseTasks = [];
  const onRequest = (request) => {
    starts.set(request, performance.now());
    const classified = classifyRequest(request.url(), origin);
    if (classified.category === "today_projection") capture.counts.todayProjection += 1;
    if (classified.category === "today_supabase_read") capture.counts.todayDirectSupabase += 1;
    if (classified.category === "pcs2_bootstrap") capture.counts.bootstrap += 1;
    if (classified.category === "history_first_page") capture.counts.historyFirstPage += 1;
    if (classified.category === "history_cursor") capture.counts.historyCursor += 1;
    if (classified.category === "history_detail") capture.counts.historyDetail += 1;
  };
  const onResponse = (response) => {
    if (response.status() >= 500) capture.http5xx += 1;
    const classified = classifyRequest(response.url(), origin);
    if (
      !new Set([
        "today_projection",
        "history_first_page",
        "history_cursor",
        "history_detail",
      ]).has(classified.category)
    ) {
      return;
    }
    const task = (async () => {
      const headers = await response.allHeaders();
      let decodedBodyBytes = 0;
      try {
        decodedBodyBytes = (await response.body()).byteLength;
      } catch {
        capture.requestFailures.push("response_body_unavailable");
      }
      capture.responses.push(
        safeResponseRecord({
          category: classified.category,
          status: response.status(),
          durationMs: performance.now() - (starts.get(response.request()) ?? performance.now()),
          decodedBodyBytes,
          headers,
        }),
      );
    })();
    responseTasks.push(task);
  };
  const onPageError = () => capture.pageErrors.push("page_error");
  const onConsole = (message) => {
    if (message.type() === "error") capture.consoleErrors.push("console_error");
  };
  const onRequestFailed = (request) => {
    const error = request.failure()?.errorText ?? "request_failed";
    if (!/ERR_ABORTED/i.test(error)) capture.requestFailures.push("request_failed");
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  return {
    capture,
    async finish() {
      await Promise.all(responseTasks);
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
      page.off("requestfailed", onRequestFailed);
    },
  };
}

async function assertNoBoundary(page, capture) {
  const body = await page.locator("body").innerText().catch(() => "");
  capture.errorBoundary = BOUNDARY_TEXT.some((text) => body.includes(text));
}

async function settlePage(page) {
  await page.locator("main#main-content, main").first().waitFor({
    state: "visible",
    timeout: REQUEST_TIMEOUT_MS,
  });
  await page.waitForTimeout(SETTLEMENT_DELAY_MS);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

async function measurePage(page, origin, route) {
  const tracker = createCapture(page, origin);
  const path = route === "today" ? "/dashboard" : "/workout-history";
  try {
    const expectedCategory = route === "today" ? "today_projection" : "history_first_page";
    const expectedResponse = page.waitForResponse(
      (response) => classifyRequest(response.url(), origin).category === expectedCategory,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.goto(new URL(path, origin).toString(), {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    await expectedResponse;
    await settlePage(page);
    if (page.url().includes("/login")) throw new Error("MEASUREMENT_AUTH_LOST");
    if (route === "history") {
      await page.locator("[data-workout-history-page]").waitFor({
        state: "visible",
        timeout: REQUEST_TIMEOUT_MS,
      });
    }
    await assertNoBoundary(page, tracker.capture);
  } finally {
    await tracker.finish();
  }
  return evaluateCapturedOperation(route, tracker.capture);
}

async function login(page, origin, email, password) {
  await page.goto(new URL("/login", origin).toString(), {
    waitUntil: "domcontentloaded",
    timeout: REQUEST_TIMEOUT_MS,
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login", {
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (new URL(page.url()).pathname === "/login") {
    throw new Error("SYNTHETIC_AUTHENTICATION_FAILED");
  }
}

function credentialFor(account) {
  const prefix = account === "populated" ? "PLAIVRA_SMOKE_POPULATED" : "PLAIVRA_SMOKE_EMPTY";
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`SYNTHETIC_CREDENTIALS_MISSING_${account.toUpperCase()}`);
  return { email, password };
}

export function validateVersionIdentity(version, options, status = 200) {
  if (status !== 200) throw new Error("DEPLOYED_IDENTITY_HTTP_INVALID");
  if (version.commitSha !== options.expectedCommit) throw new Error("DEPLOYED_COMMIT_MISMATCH");
  if (version.expectedDatabaseMigrationVersion !== options.expectedMigration) {
    throw new Error("DEPLOYED_EXPECTED_MIGRATION_MISMATCH");
  }
  if (version.databaseMigrationVersion !== options.expectedMigration) {
    throw new Error("DEPLOYED_DATABASE_MIGRATION_MISMATCH");
  }
  if (version.artifactIdentityValid !== true) throw new Error("DEPLOYED_ARTIFACT_IDENTITY_INVALID");
  if (version.releaseReady !== true) throw new Error("DEPLOYED_RELEASE_NOT_READY");
  if (version.schemaCompatible !== true) throw new Error("DEPLOYED_SCHEMA_INCOMPATIBLE");
  if (version.pendingMigrationCount !== 0) throw new Error("DEPLOYED_PENDING_MIGRATIONS");
  if (version.schemaAppliedUntrackedCount !== 0) throw new Error("DEPLOYED_UNTRACKED_APPLICATIONS");
  if (version.unresolvedMigrationCount !== 0) throw new Error("DEPLOYED_UNRESOLVED_MIGRATIONS");
  return {
    commitSha: version.commitSha,
    expectedDatabaseMigrationVersion: version.expectedDatabaseMigrationVersion,
    databaseMigrationVersion: version.databaseMigrationVersion,
    artifactIdentityValid: true,
    releaseReady: true,
    schemaCompatible: true,
    pendingMigrationCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 0,
  };
}

async function identityGate(browser, options) {
  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "Europe/Berlin",
  });
  try {
    const response = await context.request.get(
      new URL("/api/version", options.origin).toString(),
      { timeout: REQUEST_TIMEOUT_MS, maxRedirects: 0 },
    );
    if (new URL(response.url()).origin !== options.origin.origin) {
      throw new Error("DEPLOYED_IDENTITY_REDIRECT_ORIGIN_INVALID");
    }
    const version = await response.json();
    return validateVersionIdentity(version, options, response.status());
  } finally {
    await context.close();
  }
}

function metricSummary(samples, key) {
  return summarizeMetric(samples.map((sample) => sample[key]));
}

function nullableMetricSummary(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => value !== null);
  return values.length ? summarizeMetric(values) : null;
}

export function aggregateSamples(samples) {
  if (!samples.length || samples.some((sample) => sample.passed !== true)) {
    throw new Error("AGGREGATION_REQUIRES_COMPLETE_VALID_SAMPLES");
  }
  return {
    sampleCount: samples.length,
    browserObservedDurationMs: metricSummary(samples, "browserObservedDurationMs"),
    serverTotalDurationMs: metricSummary(samples, "serverTotalDurationMs"),
    decodedBodyBytes: metricSummary(samples, "decodedBodyBytes"),
    contentLengthHeaderBytes: nullableMetricSummary(samples, "contentLengthHeaderBytes"),
  };
}

async function measureInteractions(page, origin) {
  const evidence = {
    filterPanel: { status: "not_applicable", additionalFirstPageRequests: null },
    selectedOnly: {
      status: "not_applicable",
      additionalFirstPageRequests: null,
      detailRequests: null,
    },
    loadMore: {
      status: "not_applicable",
      firstPageRequests: null,
      cursorRequests: null,
    },
  };
  const filterButton = page.getByRole("button", { name: /filter/i }).first();
  if (await filterButton.isVisible().catch(() => false)) {
    const tracker = createCapture(page, origin);
    try {
      await filterButton.click();
      await page.getByRole("dialog").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
    } finally {
      await tracker.finish();
    }
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_FILTER_PANEL_REFETCHED_FIRST_PAGE");
    }
    evidence.filterPanel = { status: "passed", additionalFirstPageRequests: 0 };
  }

  const selectable = page.locator("[data-workout-history-card] a").first();
  if (await selectable.isVisible().catch(() => false)) {
    const tracker = createCapture(page, origin);
    try {
      await selectable.click();
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
    } finally {
      await tracker.finish();
    }
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_SELECTED_ONLY_REFETCHED_FIRST_PAGE");
    }
    evidence.selectedOnly = {
      status: "passed",
      additionalFirstPageRequests: 0,
      detailRequests: tracker.capture.counts.historyDetail,
    };
  }

  const loadMore = page.getByRole("button", { name: /load more/i }).first();
  if (await loadMore.isVisible().catch(() => false)) {
    const tracker = createCapture(page, origin);
    try {
      await loadMore.click();
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    } finally {
      await tracker.finish();
    }
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_LOAD_MORE_REFETCHED_FIRST_PAGE");
    }
    if (tracker.capture.counts.historyCursor !== 1) {
      throw new Error("HISTORY_LOAD_MORE_CURSOR_COUNT_INVALID");
    }
    evidence.loadMore = {
      status: "passed",
      firstPageRequests: 0,
      cursorRequests: 1,
    };
  }
  return evidence;
}

async function measureAccount(browser, options, account) {
  const credential = credentialFor(account);
  const directory = resolve(options.output, account);
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(REQUEST_TIMEOUT_MS);
  const samples = { today: [], history: [] };
  let interactionEvidence = {
    filterPanel: { status: "not_applicable", additionalFirstPageRequests: null },
    selectedOnly: { status: "not_applicable", additionalFirstPageRequests: null, detailRequests: null },
    loadMore: { status: "not_applicable", firstPageRequests: null, cursorRequests: null },
  };
  try {
    await login(page, options.origin, credential.email, credential.password);
    for (let index = 0; index < options.warmups + options.samples; index += 1) {
      const measured = index >= options.warmups;
      const today = await measurePage(page, options.origin, "today");
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
      const history = await measurePage(page, options.origin, "history");
      if (measured) {
        samples.today.push({ sample: index - options.warmups + 1, ...today });
        samples.history.push({ sample: index - options.warmups + 1, ...history });
      }
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
    }
    if (account === "populated") {
      interactionEvidence = await measureInteractions(page, options.origin);
    }
    const evidence = {
      account,
      warmups: options.warmups,
      samples: options.samples,
      syntheticDataOnly: true,
      credentialsLogged: false,
      today: samples.today,
      history: samples.history,
      interactionEvidence,
      passed: true,
    };
    writeFileSync(
      resolve(directory, "samples.json"),
      `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`,
      "utf8",
    );
    return evidence;
  } catch (error) {
    const screenshot = sanitizeEvidenceArtifactPath(`${account}/failure.png`);
    await page.screenshot({ path: resolve(options.output, screenshot), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

export function buildSummary({ options, identity, accounts }) {
  const combinedToday = accounts.flatMap((account) => account.today);
  const combinedHistory = accounts.flatMap((account) => account.history);
  return {
    checkedAt: new Date().toISOString(),
    mode: options.mode,
    origin: sanitizeEvidenceUrl(options.origin.toString()),
    expectedCommit: options.expectedCommit,
    observedCommit: identity.commitSha,
    expectedMigration: options.expectedMigration,
    identity,
    sampleCountPerAccount: options.samples,
    warmupCountPerAccount: options.warmups,
    accounts: accounts.map((account) => ({
      account: account.account,
      today: aggregateSamples(account.today),
      history: aggregateSamples(account.history),
      interactionEvidence: account.interactionEvidence,
    })),
    combined: {
      today: aggregateSamples(combinedToday),
      history: aggregateSamples(combinedHistory),
    },
    requestCountHardGates: {
      todayProjectionPerOperation: 1,
      todayDirectSupabaseReadsPerOperation: 0,
      historyFirstPagePerInitialOperation: 1,
      historyCursorPerInitialOperation: 0,
    },
    failures: {
      pageErrors: 0,
      consoleErrors: 0,
      requestFailures: 0,
      http5xx: 0,
      errorBoundaries: 0,
    },
    syntheticDataOnly: true,
    credentialsLogged: false,
    passed: true,
    failureCode: null,
  };
}

export function renderSummaryMarkdown(summary) {
  const accountSections = summary.accounts
    .map(
      (account) => `## ${account.account}\n\n- Today samples: ${account.today.sampleCount}\n- Today browser p50/p95: ${account.today.browserObservedDurationMs.p50} / ${account.today.browserObservedDurationMs.p95} ms\n- Today server total p50/p95: ${account.today.serverTotalDurationMs.p50} / ${account.today.serverTotalDurationMs.p95} ms\n- History samples: ${account.history.sampleCount}\n- History browser p50/p95: ${account.history.browserObservedDurationMs.p50} / ${account.history.browserObservedDurationMs.p95} ms\n- History server total p50/p95: ${account.history.serverTotalDurationMs.p50} / ${account.history.serverTotalDurationMs.p95} ms\n- Filter panel: ${account.interactionEvidence.filterPanel.status}\n- Selected-only: ${account.interactionEvidence.selectedOnly.status}\n- Load more: ${account.interactionEvidence.loadMore.status}`,
    )
    .join("\n\n");
  return `# PCS-3 Production Request Measurement\n\n## Measured deployment facts\n\n- Checked at: ${summary.checkedAt}\n- Mode: ${summary.mode}\n- Origin: ${summary.origin}\n- Expected/observed commit: ${summary.expectedCommit}\n- Expected migration: ${summary.expectedMigration}\n- Synthetic fixtures only: yes\n- Credentials logged: no\n- Overall result: PASS\n\n${accountSections}\n\n## Combined measured samples\n\n- Today browser p50/p95: ${summary.combined.today.browserObservedDurationMs.p50} / ${summary.combined.today.browserObservedDurationMs.p95} ms\n- Today server total p50/p95: ${summary.combined.today.serverTotalDurationMs.p50} / ${summary.combined.today.serverTotalDurationMs.p95} ms\n- History browser p50/p95: ${summary.combined.history.browserObservedDurationMs.p50} / ${summary.combined.history.browserObservedDurationMs.p95} ms\n- History server total p50/p95: ${summary.combined.history.serverTotalDurationMs.p50} / ${summary.combined.history.serverTotalDurationMs.p95} ms\n\n## Test-only architecture facts\n\nAutomated tests protect request classification, exact count invariants, timing parsing, sanitization, and failure handling. Test facts are not substituted for measured Production facts.\n\n## Unavailable or not applicable\n\nContent-Length remains null when the server does not provide it. Fixture-dependent interactions are recorded as not_applicable rather than claimed as proof.\n\n${REQUIRED_DISCLAIMER}\n`;
}

async function main() {
  const options = validateMeasurementOptions(parseCliArgs(process.argv.slice(2)));
  mkdirSync(options.output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const identity = await identityGate(browser, options);
    const accountNames =
      options.account === "both" ? ["populated", "empty"] : [options.account];
    const accounts = [];
    for (const account of accountNames) {
      accounts.push(await measureAccount(browser, options, account));
    }
    const summary = buildSummary({ options, identity, accounts });
    const safeSummary = sanitizeEvidence(summary);
    writeFileSync(
      resolve(options.output, "summary.json"),
      `${JSON.stringify(safeSummary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      resolve(options.output, "summary.md"),
      renderSummaryMarkdown(safeSummary),
      "utf8",
    );
    process.stdout.write("PCS3_PRODUCTION_MEASUREMENT_PASSED\n");
  } finally {
    await browser.close();
  }
}

async function run() {
  let output = resolve(DEFAULT_OUTPUT);
  try {
    const raw = parseCliArgs(process.argv.slice(2));
    output = resolve(raw.output ?? DEFAULT_OUTPUT);
    await main();
  } catch (error) {
    mkdirSync(output, { recursive: true });
    const failure = sanitizeEvidence({
      checkedAt: new Date().toISOString(),
      passed: false,
      failureCode: "PCS3_PRODUCTION_MEASUREMENT_FAILED",
      failure: sanitizedText(error instanceof Error ? error.message : error, 300),
      syntheticDataOnly: true,
      credentialsLogged: false,
    });
    writeFileSync(
      resolve(output, "summary.json"),
      `${JSON.stringify(failure, null, 2)}\n`,
      "utf8",
    );
    process.stderr.write("PCS3_PRODUCTION_MEASUREMENT_FAILED\n");
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) await run();
