import {
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

import {
  sanitizeEvidence,
  sanitizeEvidenceUrl,
} from "./authenticated-release-smoke.mjs";

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const MIGRATION_VERSION = /^\d{12,14}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VERCEL_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/i;
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
  "reviewed-vercel-host",
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
const MEASURED_RESPONSE_CATEGORIES = new Set([
  "today_projection",
  "history_first_page",
  "history_cursor",
  "history_detail",
]);
const CRITICAL_REQUEST_CATEGORIES = new Set([
  ...MEASURED_RESPONSE_CATEGORIES,
  "today_supabase_read",
  "pcs2_bootstrap",
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
const MAX_PENDING_RESPONSE_TASKS = 32;
const SAFE_FAILURE_CODES = new Set([
  "PCS3_PRODUCTION_MEASUREMENT_FAILED",
  "PCS3_OUTPUT_FILESYSTEM_ROOT_FORBIDDEN",
  "PCS3_OUTPUT_REPOSITORY_ROOT_FORBIDDEN",
  "PCS3_OUTPUT_QUALITY_REPORTS_ROOT_FORBIDDEN",
  "PCS3_OUTPUT_OUTSIDE_QUALITY_REPORTS_FORBIDDEN",
  "PCS3_OUTPUT_SYMLINK_ESCAPE_FORBIDDEN",
  "MEASUREMENT_REDIRECT_ORIGIN_INVALID",
  "MEASUREMENT_AUTH_LOST",
  "SYNTHETIC_AUTHENTICATION_FAILED",
  "SYNTHETIC_CREDENTIALS_MISSING_POPULATED",
  "SYNTHETIC_CREDENTIALS_MISSING_EMPTY",
  "DEPLOYED_IDENTITY_HTTP_INVALID",
  "DEPLOYED_COMMIT_MISMATCH",
  "DEPLOYED_EXPECTED_MIGRATION_MISMATCH",
  "DEPLOYED_DATABASE_MIGRATION_MISMATCH",
  "DEPLOYED_ARTIFACT_IDENTITY_INVALID",
  "DEPLOYED_RELEASE_NOT_READY",
  "DEPLOYED_SCHEMA_INCOMPATIBLE",
  "DEPLOYED_PENDING_MIGRATIONS",
  "DEPLOYED_UNTRACKED_APPLICATIONS",
  "DEPLOYED_UNRESOLVED_MIGRATIONS",
  "MEASUREMENT_PAGE_ERROR",
  "MEASUREMENT_CONSOLE_ERROR",
  "MEASUREMENT_REQUEST_FAILURE",
  "MEASUREMENT_HTTP_5XX",
  "MEASUREMENT_ERROR_BOUNDARY",
  "MEASUREMENT_HTTP_STATUS_INVALID",
  "MEASUREMENT_CACHE_HEADERS_INVALID",
  "MEASUREMENT_VARY_HEADER_INVALID",
  "MEASUREMENT_NOSNIFF_HEADER_INVALID",
  "MEASUREMENT_REQUEST_ID_MISSING",
  "MEASUREMENT_SERVER_TIMING_INVALID",
  "MEASUREMENT_SERVER_TIMING_TOTAL_MISSING",
  "MEASUREMENT_SERVER_TIMING_LIST_MISSING",
  "MEASUREMENT_SERVER_TIMING_FILTERS_MISSING",
  "TODAY_PROJECTION_REQUEST_COUNT_INVALID",
  "TODAY_DIRECT_SUPABASE_READ_DETECTED",
  "TODAY_PROJECTION_RESPONSE_MISSING",
  "TODAY_CONTRACT_HEADER_INVALID",
  "HISTORY_FIRST_PAGE_REQUEST_COUNT_INVALID",
  "HISTORY_INITIAL_CURSOR_REQUEST_DETECTED",
  "HISTORY_FIRST_PAGE_RESPONSE_MISSING",
  "HISTORY_FILTER_PANEL_REFETCHED_FIRST_PAGE",
  "HISTORY_SELECTED_ONLY_REFETCHED_FIRST_PAGE",
  "HISTORY_DETAIL_STATUS_INVALID",
  "HISTORY_LOAD_MORE_REFETCHED_FIRST_PAGE",
  "HISTORY_LOAD_MORE_CURSOR_COUNT_INVALID",
  "HISTORY_CURSOR_RESPONSE_MISSING",
  "HISTORY_CURSOR_FILTERS_TIMING_FABRICATED",
  "AGGREGATION_REQUIRES_COMPLETE_VALID_SAMPLES",
]);
const KNOWN_EVIDENCE_ENTRIES = [
  "summary.json",
  "summary.md",
  "populated",
  "empty",
  "screenshots",
  "traces",
  "videos",
  "storage-state.json",
  "trace.zip",
  "measurement.har",
  "recording.webm",
];

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

export function normalizeReviewedVercelHost(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const host = String(value).trim().toLowerCase();
  if (
    /[\s*:/?#@]/u.test(host) ||
    !SAFE_VERCEL_HOST.test(host) ||
    host.startsWith(".") ||
    host.endsWith(".")
  ) {
    throw new Error(
      "--reviewed-vercel-host must be one exact .vercel.app hostname.",
    );
  }
  return host;
}

export function normalizeMeasurementOrigin(
  value,
  mode,
  reviewedVercelHost = null,
) {
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
  const hostname = url.hostname.toLowerCase();
  const reviewedHost = normalizeReviewedVercelHost(reviewedVercelHost);
  if (mode === "production") {
    if (url.protocol !== "https:") {
      throw new Error("Production measurement requires HTTPS.");
    }
    if (!APPROVED_PRODUCTION_HOSTS.has(hostname)) {
      if (!SAFE_VERCEL_HOST.test(hostname)) {
        throw new Error("Production measurement origin is not approved.");
      }
      if (!reviewedHost) {
        throw new Error(
          "Production Vercel measurement requires --reviewed-vercel-host.",
        );
      }
      if (hostname !== reviewedHost) {
        throw new Error("Reviewed Vercel hostname does not match --url.");
      }
    }
  } else if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Preview measurement requires HTTPS except for localhost.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function isInside(parent, candidate, strict = false) {
  const path = relative(parent, candidate);
  if (path === "") return !strict;
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function deepestExistingAncestor(value) {
  let current = value;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

export function validateOutputDirectory(value, repositoryRoot = process.cwd()) {
  const repository = realpathSync(resolve(repositoryRoot));
  const requested = String(value ?? DEFAULT_OUTPUT);
  const output = isAbsolute(requested)
    ? resolve(requested)
    : resolve(repository, requested);
  const filesystemRoot = parse(output).root;
  const qualityReportsRoot = resolve(repository, "quality-reports");

  if (output === filesystemRoot) {
    throw new Error("PCS3_OUTPUT_FILESYSTEM_ROOT_FORBIDDEN");
  }
  if (output === repository) {
    throw new Error("PCS3_OUTPUT_REPOSITORY_ROOT_FORBIDDEN");
  }
  if (output === qualityReportsRoot) {
    throw new Error("PCS3_OUTPUT_QUALITY_REPORTS_ROOT_FORBIDDEN");
  }
  if (!isInside(qualityReportsRoot, output, true)) {
    throw new Error("PCS3_OUTPUT_OUTSIDE_QUALITY_REPORTS_FORBIDDEN");
  }

  if (existsSync(qualityReportsRoot)) {
    const realQualityReportsRoot = realpathSync(qualityReportsRoot);
    if (realQualityReportsRoot !== qualityReportsRoot) {
      throw new Error("PCS3_OUTPUT_SYMLINK_ESCAPE_FORBIDDEN");
    }
    const existingAncestor = deepestExistingAncestor(output);
    if (existingAncestor) {
      const realExistingAncestor = realpathSync(existingAncestor);
      if (!isInside(realQualityReportsRoot, realExistingAncestor)) {
        throw new Error("PCS3_OUTPUT_SYMLINK_ESCAPE_FORBIDDEN");
      }
    }
  }

  return output;
}

export function preflightOutputDirectory(argv, repositoryRoot = process.cwd()) {
  let outputValue = DEFAULT_OUTPUT;
  let outputSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--output") continue;
    if (outputSeen) throw new Error("Duplicate option --output.");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --output.");
    }
    outputSeen = true;
    outputValue = value;
    index += 1;
  }
  return validateOutputDirectory(outputValue, repositoryRoot);
}

export function cleanOutputEvidence(value, repositoryRoot = process.cwd()) {
  const output = validateOutputDirectory(value, repositoryRoot);
  mkdirSync(output, { recursive: true });
  for (const entry of KNOWN_EVIDENCE_ENTRIES) {
    rmSync(resolve(output, entry), { recursive: true, force: true });
  }
  return output;
}

export function validateMeasurementOptions(
  raw,
  repositoryRoot = process.cwd(),
) {
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
  const reviewedVercelHost = normalizeReviewedVercelHost(
    raw["reviewed-vercel-host"],
  );
  return {
    mode: raw.mode,
    origin: normalizeMeasurementOrigin(
      raw.url,
      raw.mode,
      reviewedVercelHost,
    ),
    reviewedVercelHost,
    expectedCommit,
    expectedMigration,
    samples: boundedInteger(raw.samples, "--samples", 10, 40, 20),
    warmups: boundedInteger(raw.warmups, "--warmups", 0, 5, 2),
    account,
    output: validateOutputDirectory(
      raw.output ?? DEFAULT_OUTPUT,
      repositoryRoot,
    ),
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
  return sorted[Math.max(1, Math.ceil((percentile / 100) * sorted.length)) - 1];
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
    const match = part
      .trim()
      .match(/^([A-Za-z][A-Za-z0-9_-]*)\s*;\s*dur=([0-9]+(?:\.[0-9]+)?)$/);
    if (!match) return null;
    const duration = Number(match[2]);
    if (!Number.isFinite(duration) || duration < 0 || duration > 60_000) {
      return null;
    }
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
  const match = url.pathname.match(/^\/rest\/v1\/([^/]+)\/?$/);
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

export function createCapture(
  page,
  origin,
  {
    now = () => performance.now(),
    maxPendingResponseTasks = MAX_PENDING_RESPONSE_TASKS,
  } = {},
) {
  const capture = emptyCapture();
  const starts = new WeakMap();
  const countedRequests = new WeakSet();
  const acceptedResponseRequests = new WeakSet();
  const failedRequests = new WeakSet();
  const pendingResponseTasks = new Set();
  let acceptingResponses = true;
  let responseTaskCleanupCount = 0;

  const recordRequestFailure = (request) => {
    if (failedRequests.has(request)) return;
    failedRequests.add(request);
    capture.requestFailures.push("request_failed");
  };

  const onRequest = (request) => {
    if (!acceptingResponses || countedRequests.has(request)) return;
    countedRequests.add(request);
    starts.set(request, now());
    const classified = classifyRequest(request.url(), origin);
    if (classified.category === "today_projection") capture.counts.todayProjection += 1;
    if (classified.category === "today_supabase_read") capture.counts.todayDirectSupabase += 1;
    if (classified.category === "pcs2_bootstrap") capture.counts.bootstrap += 1;
    if (classified.category === "history_first_page") capture.counts.historyFirstPage += 1;
    if (classified.category === "history_cursor") capture.counts.historyCursor += 1;
    if (classified.category === "history_detail") capture.counts.historyDetail += 1;
  };

  const onResponse = (response) => {
    if (!acceptingResponses) return;
    const classified = classifyRequest(response.url(), origin);
    const request = response.request();
    if (
      MEASURED_RESPONSE_CATEGORIES.has(classified.category) &&
      acceptedResponseRequests.has(request)
    ) {
      return;
    }
    if (MEASURED_RESPONSE_CATEGORIES.has(classified.category)) {
      acceptedResponseRequests.add(request);
    }
    if (
      response.status() >= 500 &&
      (MEASURED_RESPONSE_CATEGORIES.has(classified.category) ||
        request.resourceType() === "document")
    ) {
      capture.http5xx += 1;
    }
    if (!MEASURED_RESPONSE_CATEGORIES.has(classified.category)) return;
    if (pendingResponseTasks.size >= maxPendingResponseTasks) {
      recordRequestFailure(request);
      return;
    }

    const task = Promise.resolve().then(async () => {
      try {
        const startedAt = starts.get(request);
        if (!Number.isFinite(startedAt)) {
          throw new Error("missing_request_start");
        }
        const finishError = await response.finished();
        if (finishError) throw new Error("response_finish_failed");
        const responseHeaders = await response.allHeaders();
        const decodedBody = await response.body();
        const completedAt = now();
        capture.responses.push(
          safeResponseRecord({
            category: classified.category,
            status: response.status(),
            durationMs: completedAt - startedAt,
            decodedBodyBytes: decodedBody.byteLength,
            headers: responseHeaders,
          }),
        );
      } catch {
        recordRequestFailure(request);
      }
    });
    pendingResponseTasks.add(task);
    task.finally(() => {
      if (pendingResponseTasks.delete(task)) {
        responseTaskCleanupCount += 1;
      }
    });
  };

  const onPageError = () => capture.pageErrors.push("page_error");
  const onConsole = (message) => {
    if (message.type() === "error") capture.consoleErrors.push("console_error");
  };
  const onRequestFailed = (request) => {
    const failure = request.failure()?.errorText ?? "request_failed";
    if (/ERR_ABORTED/i.test(failure)) return;
    const category = classifyRequest(request.url(), origin).category;
    if (
      CRITICAL_REQUEST_CATEGORIES.has(category) ||
      request.resourceType() === "document"
    ) {
      recordRequestFailure(request);
    }
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  return {
    capture,
    acceptingResponses: () => acceptingResponses,
    pendingResponseTaskCount: () => pendingResponseTasks.size,
    responseTaskCleanupCount: () => responseTaskCleanupCount,
    async finish() {
      if (acceptingResponses) {
        acceptingResponses = false;
        page.off("request", onRequest);
        page.off("response", onResponse);
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
        page.off("requestfailed", onRequestFailed);
      }
      while (pendingResponseTasks.size > 0) {
        await Promise.allSettled([...pendingResponseTasks]);
      }
      return capture;
    },
  };
}

export function assertSameOrigin(value, origin) {
  if (new URL(value).origin !== origin.origin) {
    throw new Error("MEASUREMENT_REDIRECT_ORIGIN_INVALID");
  }
}

async function assertNoBoundary(page, capture) {
  const body = await page.locator("body").innerText().catch(() => "");
  capture.errorBoundary = BOUNDARY_TEXT.some((text) => body.includes(text));
}

async function settlePage(page, route) {
  await page.locator("main#main-content, main").first().waitFor({
    state: "visible",
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (route === "today") {
    await page
      .waitForFunction(
        () =>
          !document.querySelector(
            '[data-today-loading="true"], [data-today-progress="loading"], [aria-busy="true"]',
          ),
        undefined,
        { timeout: 5_000 },
      )
      .catch(() => undefined);
  } else {
    await page.locator("[data-workout-history-page]").waitFor({
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  await page.waitForTimeout(SETTLEMENT_DELAY_MS);
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => undefined);
}

async function measurePage(page, origin, route) {
  const tracker = createCapture(page, origin);
  const path = route === "today" ? "/dashboard" : "/workout-history";
  try {
    const expectedCategory =
      route === "today" ? "today_projection" : "history_first_page";
    const expectedResponse = page.waitForResponse(
      (response) =>
        classifyRequest(response.url(), origin).category === expectedCategory,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.goto(new URL(path, origin).toString(), {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    await expectedResponse;
    assertSameOrigin(page.url(), origin);
    await settlePage(page, route);
    if (new URL(page.url()).pathname === "/login") {
      throw new Error("MEASUREMENT_AUTH_LOST");
    }
    await assertNoBoundary(page, tracker.capture);
  } finally {
    await tracker.finish();
  }
  return evaluateCapturedOperation(route, tracker.capture);
}

export async function login(page, origin, email, password) {
  await page.goto(new URL("/login", origin).toString(), {
    waitUntil: "domcontentloaded",
    timeout: REQUEST_TIMEOUT_MS,
  });
  assertSameOrigin(page.url(), origin);
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  try {
    await Promise.all([
      emailInput.waitFor({ state: "visible", timeout: REQUEST_TIMEOUT_MS }),
      passwordInput.waitFor({ state: "visible", timeout: REQUEST_TIMEOUT_MS }),
      submitButton.waitFor({ state: "visible", timeout: REQUEST_TIMEOUT_MS }),
    ]);
    const counts = await Promise.all([
      emailInput.count(),
      passwordInput.count(),
      submitButton.count(),
    ]);
    if (counts.some((count) => count !== 1)) {
      throw new Error("login_controls_invalid");
    }
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.waitForFunction(
      () => {
        const button = document.querySelector('button[type="submit"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      undefined,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/login", {
        timeout: REQUEST_TIMEOUT_MS,
      }),
      submitButton.click(),
    ]);
  } catch {
    throw new Error("SYNTHETIC_AUTHENTICATION_FAILED");
  }

  assertSameOrigin(page.url(), origin);
  if (new URL(page.url()).pathname === "/login") {
    throw new Error("SYNTHETIC_AUTHENTICATION_FAILED");
  }
}

function credentialFor(account) {
  const prefix =
    account === "populated"
      ? "PLAIVRA_SMOKE_POPULATED"
      : "PLAIVRA_SMOKE_EMPTY";
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(
      `SYNTHETIC_CREDENTIALS_MISSING_${account.toUpperCase()}`,
    );
  }
  return { email, password };
}

export function validateVersionIdentity(version, options, status = 200) {
  if (status !== 200) throw new Error("DEPLOYED_IDENTITY_HTTP_INVALID");
  if (version.commitSha !== options.expectedCommit) {
    throw new Error("DEPLOYED_COMMIT_MISMATCH");
  }
  if (version.expectedDatabaseMigrationVersion !== options.expectedMigration) {
    throw new Error("DEPLOYED_EXPECTED_MIGRATION_MISMATCH");
  }
  if (version.databaseMigrationVersion !== options.expectedMigration) {
    throw new Error("DEPLOYED_DATABASE_MIGRATION_MISMATCH");
  }
  if (version.artifactIdentityValid !== true) {
    throw new Error("DEPLOYED_ARTIFACT_IDENTITY_INVALID");
  }
  if (version.releaseReady !== true) throw new Error("DEPLOYED_RELEASE_NOT_READY");
  if (version.schemaCompatible !== true) {
    throw new Error("DEPLOYED_SCHEMA_INCOMPATIBLE");
  }
  if (version.pendingMigrationCount !== 0) {
    throw new Error("DEPLOYED_PENDING_MIGRATIONS");
  }
  if (version.schemaAppliedUntrackedCount !== 0) {
    throw new Error("DEPLOYED_UNTRACKED_APPLICATIONS");
  }
  if (version.unresolvedMigrationCount !== 0) {
    throw new Error("DEPLOYED_UNRESOLVED_MIGRATIONS");
  }
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
    assertSameOrigin(response.url(), options.origin);
    return validateVersionIdentity(
      await response.json(),
      options,
      response.status(),
    );
  } finally {
    await context.close();
  }
}

function metricSummary(samples, key) {
  return summarizeMetric(samples.map((sample) => sample[key]));
}

function optionalMetricSummary(samples, key) {
  const values = samples
    .map((sample) => sample[key])
    .filter((value) => Number.isFinite(value));
  return values.length ? summarizeMetric(values) : null;
}

function nullableMetricSummary(samples, key) {
  const values = samples
    .map((sample) => sample[key])
    .filter((value) => value !== null && Number.isFinite(value));
  return values.length ? summarizeMetric(values) : null;
}

export function aggregateSamples(samples) {
  if (!samples.length || samples.some((sample) => sample.passed !== true)) {
    throw new Error("AGGREGATION_REQUIRES_COMPLETE_VALID_SAMPLES");
  }
  return {
    sampleCount: samples.length,
    browserObservedDurationMs: metricSummary(
      samples,
      "browserObservedDurationMs",
    ),
    serverTotalDurationMs: metricSummary(samples, "serverTotalDurationMs"),
    decodedBodyBytes: metricSummary(samples, "decodedBodyBytes"),
    contentLengthHeaderBytes: nullableMetricSummary(
      samples,
      "contentLengthHeaderBytes",
    ),
  };
}

function sumNested(samples, group, key) {
  return samples.reduce(
    (sum, sample) => sum + Number(sample[group]?.[key] ?? 0),
    0,
  );
}

function aggregateDomainTimings(samples) {
  const names = new Set(
    samples.flatMap((sample) => Object.keys(sample.domainTimingsMs ?? {})),
  );
  return Object.fromEntries(
    [...names].sort().map((name) => [
      name,
      summarizeMetric(
        samples
          .map((sample) => sample.domainTimingsMs?.[name])
          .filter(Number.isFinite),
      ),
    ]),
  );
}

function aggregateRouteSamples(samples) {
  const base = aggregateSamples(samples);
  const route = samples[0].route;
  const requestKeys = new Set(
    samples.flatMap((sample) => Object.keys(sample.requestCounts ?? {})),
  );
  const requestCounts = Object.fromEntries(
    [...requestKeys].sort().map((key) => [
      key,
      {
        total: sumNested(samples, "requestCounts", key),
        perOperation: summarizeMetric(
          samples.map((sample) => Number(sample.requestCounts?.[key] ?? 0)),
        ),
      },
    ]),
  );
  return {
    ...base,
    route,
    requestCounts,
    statusCounts: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.status))]
        .sort((a, b) => a - b)
        .map((status) => [
          String(status),
          samples.filter((sample) => sample.status === status).length,
        ]),
    ),
    serverListDurationMs: optionalMetricSummary(samples, "serverListDurationMs"),
    serverFiltersDurationMs: optionalMetricSummary(
      samples,
      "serverFiltersDurationMs",
    ),
    domainTimingsMs: aggregateDomainTimings(samples),
    headerResults: {
      privateNoStore: samples.every((sample) => sample.headers?.privateNoStore),
      varyAuthorization: samples.every(
        (sample) => sample.headers?.varyAuthorization,
      ),
      noSniff: samples.every((sample) => sample.headers?.noSniff),
      requestIdPresent: samples.every(
        (sample) => sample.headers?.requestIdPresent,
      ),
      todayContract:
        route === "today"
          ? samples.every((sample) => sample.headers?.todayContract)
          : null,
    },
    failureCounts: {
      pageErrors: sumNested(samples, "failures", "pageErrors"),
      consoleErrors: sumNested(samples, "failures", "consoleErrors"),
      requestFailures: sumNested(samples, "failures", "requestFailures"),
      http5xx: sumNested(samples, "failures", "http5xx"),
      errorBoundaries: samples.filter(
        (sample) => sample.failures?.errorBoundary,
      ).length,
    },
  };
}

function safeInteractionResponse(record) {
  return record
    ? {
        category: record.category,
        status: record.status,
        browserObservedDurationMs: record.browserObservedDurationMs,
        decodedBodyBytes: record.decodedBodyBytes,
        contentLengthHeaderBytes: record.contentLengthHeaderBytes,
        serverTimingMs: record.timing,
        headers: record.headers,
      }
    : null;
}

function validateInteractionCapture(capture) {
  assertNoRuntimeFailures(capture);
}

async function measureInteractions(page, origin) {
  const evidence = {
    filterPanel: {
      status: "not_applicable",
      additionalFirstPageRequests: null,
    },
    selectedOnly: {
      status: "not_applicable",
      additionalFirstPageRequests: null,
      detailRequests: null,
      detailResponse: null,
    },
    loadMore: {
      status: "not_applicable",
      firstPageRequests: null,
      cursorRequests: null,
      cursorResponse: null,
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
      await assertNoBoundary(page, tracker.capture);
    } finally {
      await tracker.finish();
    }
    validateInteractionCapture(tracker.capture);
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_FILTER_PANEL_REFETCHED_FIRST_PAGE");
    }
    evidence.filterPanel = {
      status: "passed",
      additionalFirstPageRequests: 0,
    };
  }

  const selectable = page.locator("[data-workout-history-card] a").first();
  if (await selectable.isVisible().catch(() => false)) {
    const tracker = createCapture(page, origin);
    try {
      await selectable.click();
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
      await page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => undefined);
      await assertNoBoundary(page, tracker.capture);
    } finally {
      await tracker.finish();
    }
    validateInteractionCapture(tracker.capture);
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_SELECTED_ONLY_REFETCHED_FIRST_PAGE");
    }
    const detail = tracker.capture.responses.find(
      (record) => record.category === "history_detail",
    );
    if (detail && detail.status !== 200) {
      throw new Error("HISTORY_DETAIL_STATUS_INVALID");
    }
    evidence.selectedOnly = {
      status: "passed",
      additionalFirstPageRequests: 0,
      detailRequests: tracker.capture.counts.historyDetail,
      detailResponse: safeInteractionResponse(detail),
    };
  }

  const loadMore = page.getByRole("button", { name: /load more/i }).first();
  if (await loadMore.isVisible().catch(() => false)) {
    const tracker = createCapture(page, origin);
    try {
      await loadMore.click();
      await page.waitForTimeout(SETTLEMENT_DELAY_MS);
      await page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => undefined);
      await assertNoBoundary(page, tracker.capture);
    } finally {
      await tracker.finish();
    }
    validateInteractionCapture(tracker.capture);
    if (tracker.capture.counts.historyFirstPage !== 0) {
      throw new Error("HISTORY_LOAD_MORE_REFETCHED_FIRST_PAGE");
    }
    if (tracker.capture.counts.historyCursor !== 1) {
      throw new Error("HISTORY_LOAD_MORE_CURSOR_COUNT_INVALID");
    }
    const cursor = tracker.capture.responses.find(
      (record) => record.category === "history_cursor",
    );
    if (!cursor) throw new Error("HISTORY_CURSOR_RESPONSE_MISSING");
    assertCommonResponse(cursor, ["total", "list"]);
    if (cursor.timing.filters !== undefined) {
      throw new Error("HISTORY_CURSOR_FILTERS_TIMING_FABRICATED");
    }
    evidence.loadMore = {
      status: "passed",
      firstPageRequests: 0,
      cursorRequests: 1,
      cursorResponse: safeInteractionResponse(cursor),
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
    filterPanel: {
      status: "not_applicable",
      additionalFirstPageRequests: null,
    },
    selectedOnly: {
      status: "not_applicable",
      additionalFirstPageRequests: null,
      detailRequests: null,
      detailResponse: null,
    },
    loadMore: {
      status: "not_applicable",
      firstPageRequests: null,
      cursorRequests: null,
      cursorResponse: null,
    },
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
        samples.history.push({
          sample: index - options.warmups + 1,
          ...history,
        });
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
  } finally {
    await context.close();
  }
}

export function buildSummary({ options, identity, accounts }) {
  const combinedToday = accounts.flatMap((account) => account.today);
  const combinedHistory = accounts.flatMap((account) => account.history);
  const accountSummaries = accounts.map((account) => ({
    account: account.account,
    today: aggregateRouteSamples(account.today),
    history: aggregateRouteSamples(account.history),
    interactionEvidence: account.interactionEvidence,
  }));
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
    accounts: accountSummaries,
    combined: {
      today: aggregateRouteSamples(combinedToday),
      history: aggregateRouteSamples(combinedHistory),
    },
    requestCountHardGates: {
      todayProjectionPerOperation: 1,
      todayDirectSupabaseReadsPerOperation: 0,
      historyFirstPagePerInitialOperation: 1,
      historyCursorPerInitialOperation: 0,
    },
    headerResults: {
      today: accountSummaries.every(
        (account) =>
          account.today.headerResults.privateNoStore &&
          account.today.headerResults.varyAuthorization &&
          account.today.headerResults.noSniff &&
          account.today.headerResults.requestIdPresent &&
          account.today.headerResults.todayContract,
      ),
      history: accountSummaries.every(
        (account) =>
          account.history.headerResults.privateNoStore &&
          account.history.headerResults.varyAuthorization &&
          account.history.headerResults.noSniff &&
          account.history.headerResults.requestIdPresent,
      ),
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
      (account) => `## ${account.account}\n\n- Today samples: ${account.today.sampleCount}\n- Today projection requests: ${account.today.requestCounts.projection?.total ?? 0}\n- Today direct Supabase reads: ${account.today.requestCounts.directSupabaseReads?.total ?? 0}\n- Today browser p50/p95: ${account.today.browserObservedDurationMs.p50} / ${account.today.browserObservedDurationMs.p95} ms\n- Today server total p50/p95: ${account.today.serverTotalDurationMs.p50} / ${account.today.serverTotalDurationMs.p95} ms\n- Today decoded bytes p50/p95: ${account.today.decodedBodyBytes.p50} / ${account.today.decodedBodyBytes.p95}\n- History samples: ${account.history.sampleCount}\n- History first-page requests: ${account.history.requestCounts.firstPage?.total ?? 0}\n- History initial cursor requests: ${account.history.requestCounts.cursor?.total ?? 0}\n- History browser p50/p95: ${account.history.browserObservedDurationMs.p50} / ${account.history.browserObservedDurationMs.p95} ms\n- History server total p50/p95: ${account.history.serverTotalDurationMs.p50} / ${account.history.serverTotalDurationMs.p95} ms\n- History server list p50/p95: ${account.history.serverListDurationMs?.p50 ?? "unavailable"} / ${account.history.serverListDurationMs?.p95 ?? "unavailable"} ms\n- History server filters p50/p95: ${account.history.serverFiltersDurationMs?.p50 ?? "unavailable"} / ${account.history.serverFiltersDurationMs?.p95 ?? "unavailable"} ms\n- History decoded bytes p50/p95: ${account.history.decodedBodyBytes.p50} / ${account.history.decodedBodyBytes.p95}\n- Filter panel: ${account.interactionEvidence.filterPanel.status}\n- Selected-only: ${account.interactionEvidence.selectedOnly.status}\n- Load more: ${account.interactionEvidence.loadMore.status}`,
    )
    .join("\n\n");
  return `# PCS-3 Production Request Measurement\n\n## Measured deployment facts\n\n- Checked at: ${summary.checkedAt}\n- Mode: ${summary.mode}\n- Origin: ${summary.origin}\n- Expected/observed commit: ${summary.expectedCommit}\n- Expected migration: ${summary.expectedMigration}\n- Synthetic fixtures only: yes\n- Credentials logged: no\n- Overall result: PASS\n\n${accountSections}\n\n## Combined measured samples\n\n- Today browser p50/p95: ${summary.combined.today.browserObservedDurationMs.p50} / ${summary.combined.today.browserObservedDurationMs.p95} ms\n- Today server total p50/p95: ${summary.combined.today.serverTotalDurationMs.p50} / ${summary.combined.today.serverTotalDurationMs.p95} ms\n- History browser p50/p95: ${summary.combined.history.browserObservedDurationMs.p50} / ${summary.combined.history.browserObservedDurationMs.p95} ms\n- History server total p50/p95: ${summary.combined.history.serverTotalDurationMs.p50} / ${summary.combined.history.serverTotalDurationMs.p95} ms\n\n## Test-only architecture facts\n\nAutomated tests protect request classification, exact count invariants, timing parsing, sanitization, and failure handling. Test facts are not substituted for measured Production facts.\n\n## Unavailable or not applicable\n\nContent-Length remains null when the server does not provide it. Fixture-dependent interactions are recorded as not_applicable rather than claimed as proof.\n\n${REQUIRED_DISCLAIMER}\n`;
}

export function safeFailureCode(error) {
  const value = error instanceof Error ? error.message : String(error ?? "");
  return SAFE_FAILURE_CODES.has(value)
    ? value
    : "PCS3_PRODUCTION_MEASUREMENT_FAILED";
}

function safeReviewedFailureContext(reviewed) {
  if (!reviewed || typeof reviewed !== "object") return {};
  const result = {};
  if (reviewed.mode === "preview" || reviewed.mode === "production") {
    result.mode = reviewed.mode;
  }
  if (typeof reviewed.origin === "string") {
    try {
      const url = new URL(reviewed.origin);
      if (
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      ) {
        result.origin = sanitizeEvidenceUrl(url.toString());
      }
    } catch {
      // Invalid reviewed fields are omitted rather than copied into evidence.
    }
  }
  if (EXACT_SHA.test(String(reviewed.expectedCommit ?? ""))) {
    result.expectedCommit = String(reviewed.expectedCommit).toLowerCase();
  }
  return result;
}

export function renderFailureMarkdown(failure) {
  const reviewedLines = [
    failure.mode ? `- Mode: ${failure.mode}` : null,
    failure.origin ? `- Origin: ${failure.origin}` : null,
    failure.expectedCommit
      ? `- Reviewed commit: ${failure.expectedCommit}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `# PCS-3 Production Request Measurement\n\n## Result\n\n- Overall result: FAIL\n- Safe failure code: ${failure.failureCode}\n- Raw error detail: not recorded\n- Synthetic fixtures only: yes\n- Credentials logged: no${reviewedLines ? `\n${reviewedLines}` : ""}\n\n${REQUIRED_DISCLAIMER}\n`;
}

export function writeFailureEvidence(
  value,
  error,
  reviewed = null,
  repositoryRoot = process.cwd(),
) {
  const output = cleanOutputEvidence(value, repositoryRoot);
  const failure = {
    checkedAt: new Date().toISOString(),
    passed: false,
    failureCode: safeFailureCode(error),
    syntheticDataOnly: true,
    credentialsLogged: false,
    ...safeReviewedFailureContext(reviewed),
  };
  writeFileSync(
    resolve(output, "summary.json"),
    `${JSON.stringify(failure, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(output, "summary.md"),
    renderFailureMarkdown(failure),
    "utf8",
  );
  return failure;
}

function reviewedFailureContext(options) {
  return {
    mode: options.mode,
    origin: options.origin.toString(),
    expectedCommit: options.expectedCommit,
  };
}

async function executeMeasurement(options) {
  cleanOutputEvidence(options.output);
  const browser = await chromium.launch({ headless: true });
  try {
    const identity = await identityGate(browser, options);
    const accountNames =
      options.account === "both"
        ? ["populated", "empty"]
        : [options.account];
    const accounts = [];
    for (const account of accountNames) {
      accounts.push(await measureAccount(browser, options, account));
    }
    const summary = sanitizeEvidence(
      buildSummary({ options, identity, accounts }),
    );
    writeFileSync(
      resolve(options.output, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      resolve(options.output, "summary.md"),
      renderSummaryMarkdown(summary),
      "utf8",
    );
    process.stdout.write("PCS3_PRODUCTION_MEASUREMENT_PASSED\n");
  } finally {
    await browser.close();
  }
}

export async function runCli(
  argv,
  {
    repositoryRoot = process.cwd(),
    execute = executeMeasurement,
    stderr = process.stderr,
  } = {},
) {
  let output;
  let reviewed = null;
  try {
    output = preflightOutputDirectory(argv, repositoryRoot);
    const raw = parseCliArgs(argv);
    const options = validateMeasurementOptions(raw, repositoryRoot);
    output = options.output;
    reviewed = reviewedFailureContext(options);
    await execute(options);
    return 0;
  } catch (error) {
    if (output) {
      try {
        writeFailureEvidence(output, error, reviewed, repositoryRoot);
      } catch {
        // Unsafe or unwritable output paths fail closed without secondary detail.
      }
    }
    stderr.write("PCS3_PRODUCTION_MEASUREMENT_FAILED\n");
    return 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  process.exitCode = await runCli(process.argv.slice(2));
}
