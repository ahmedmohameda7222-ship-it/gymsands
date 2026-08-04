import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateSamples,
  buildSummary,
  classifyRequest,
  classifySupabaseTable,
  evaluateCapturedOperation,
  nearestRankPercentile,
  normalizeMeasurementOrigin,
  parseCliArgs,
  parseServerTiming,
  renderSummaryMarkdown,
  runInjectedHarness,
  safeResponseRecord,
  summarizeMetric,
  validateMeasurementOptions,
  validateVersionIdentity,
} from "./measure-pcs3-production.mjs";
import {
  sanitizeEvidence,
  sanitizeEvidenceUrl,
} from "./authenticated-release-smoke.mjs";

const SHA = "a".repeat(40);
const MIGRATION = "20260724232734";
const ORIGIN = new URL("https://app.plaivra.com/");

function safeHeaders(serverTiming, extra = {}) {
  return {
    "cache-control": "private, no-store",
    vary: "Authorization",
    "x-content-type-options": "nosniff",
    "x-request-id": "safe-request-id",
    "server-timing": serverTiming,
    ...extra,
  };
}

function response(category, timing, status = 200) {
  return safeResponseRecord({
    category,
    status,
    durationMs: 42.25,
    decodedBodyBytes: 1234,
    headers: safeHeaders(timing, {
      "content-length": "900",
      "x-plaivra-today-contract": "1",
    }),
  });
}

function capture({
  today = 0,
  direct = 0,
  first = 0,
  cursor = 0,
  detail = 0,
  responses = [],
  pageErrors = [],
  consoleErrors = [],
  requestFailures = [],
  http5xx = 0,
  errorBoundary = false,
} = {}) {
  return {
    responses,
    counts: {
      todayProjection: today,
      todayDirectSupabase: direct,
      bootstrap: 0,
      historyFirstPage: first,
      historyCursor: cursor,
      historyDetail: detail,
    },
    pageErrors,
    consoleErrors,
    requestFailures,
    http5xx,
    errorBoundary,
  };
}

function validTodayCapture() {
  return capture({
    today: 1,
    responses: [
      response("today_projection", "total;dur=12.3, workout;dur=2.0"),
    ],
  });
}

function validHistoryCapture() {
  return capture({
    first: 1,
    responses: [
      response(
        "history_first_page",
        "total;dur=15.0, list;dur=10.0, filters;dur=4.0",
      ),
    ],
  });
}

function validOptions(overrides = {}) {
  return {
    mode: "preview",
    url: "http://localhost:3000",
    "expected-commit": SHA,
    "expected-migration": MIGRATION,
    ...overrides,
  };
}

test("CLI validation enforces mode, account, identity, and sample bounds", () => {
  const parsed = parseCliArgs([
    "--mode",
    "preview",
    "--url",
    "http://localhost:3000",
    "--expected-commit",
    SHA,
    "--expected-migration",
    MIGRATION,
  ]);
  const options = validateMeasurementOptions(parsed);
  assert.equal(options.samples, 20);
  assert.equal(options.warmups, 2);
  assert.equal(options.account, "both");
  assert.equal(options.origin.origin, "http://localhost:3000");

  assert.throws(() => parseCliArgs(["--unknown", "x"]), /Unknown option/);
  assert.throws(() => parseCliArgs(["mode", "preview"]), /Unexpected argument/);
  assert.throws(() => parseCliArgs(["--mode"]), /Missing value/);
  assert.throws(() => validateMeasurementOptions({}), /--mode/);
  assert.throws(
    () => validateMeasurementOptions(validOptions({ samples: "9" })),
    /between 10 and 40/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ samples: "41" })),
    /between 10 and 40/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ warmups: "6" })),
    /between 0 and 5/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ account: "member" })),
    /populated, empty, or both/,
  );
  assert.throws(
    () =>
      validateMeasurementOptions(
        validOptions({ "expected-commit": "abc" }),
      ),
    /40-character SHA/,
  );
  assert.throws(
    () =>
      validateMeasurementOptions(
        validOptions({ "expected-migration": "12" }),
      ),
    /12 to 14 digits/,
  );
});

test("production origins are HTTPS and allowlisted", () => {
  assert.equal(
    normalizeMeasurementOrigin("https://plaivra.com/path", "production")
      .origin,
    "https://plaivra.com",
  );
  assert.equal(
    normalizeMeasurementOrigin(
      "https://plaivra-reviewed-abc.vercel.app",
      "production",
    ).hostname,
    "plaivra-reviewed-abc.vercel.app",
  );
  assert.throws(
    () =>
      normalizeMeasurementOrigin("http://app.plaivra.com", "production"),
    /HTTPS/,
  );
  assert.throws(
    () => normalizeMeasurementOrigin("https://example.com", "production"),
    /not approved/,
  );
  assert.throws(
    () =>
      normalizeMeasurementOrigin(
        "https://user:pass@plaivra.com",
        "production",
      ),
    /credentials/,
  );
});

test("nearest-rank p50 and p95 are deterministic and reject empty input", () => {
  const values = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.equal(nearestRankPercentile(values, 50), 10);
  assert.equal(nearestRankPercentile(values, 95), 19);
  assert.deepEqual(summarizeMetric(values), {
    sampleCount: 20,
    min: 1,
    p50: 10,
    p95: 19,
    max: 20,
  });
  assert.throws(() => nearestRankPercentile([], 50), /at least one/);
});

test("Server-Timing parsing is strict and bounded", () => {
  assert.deepEqual(
    parseServerTiming("total;dur=12.3, list;dur=8, filters;dur=2.25"),
    { total: 12.3, list: 8, filters: 2.3 },
  );
  for (const malformed of [
    null,
    "total=12",
    "total;dur=-1",
    "total;dur=70000",
    "total;dur=1, total;dur=2",
  ]) {
    assert.equal(parseServerTiming(malformed), null);
  }
});

test("request classifiers separate Today, Supabase, bootstrap, and History", () => {
  assert.deepEqual(
    classifyRequest(
      "https://app.plaivra.com/api/dashboard/today?date=private",
      ORIGIN,
    ),
    { category: "today_projection" },
  );
  assert.deepEqual(
    classifyRequest("https://app.plaivra.com/api/workouts/history", ORIGIN),
    { category: "history_first_page" },
  );
  assert.deepEqual(
    classifyRequest(
      "https://app.plaivra.com/api/workouts/history?cursor=opaque",
      ORIGIN,
    ),
    { category: "history_cursor" },
  );
  assert.deepEqual(
    classifyRequest(
      "https://app.plaivra.com/api/workouts/history/11111111-1111-4111-8111-111111111111?private=x",
      ORIGIN,
    ),
    { category: "history_detail" },
  );
  assert.deepEqual(
    classifyRequest(
      "https://project.supabase.co/rest/v1/user_workout_plans?select=*",
      ORIGIN,
    ),
    { category: "today_supabase_read", table: "user_workout_plans" },
  );
  assert.equal(
    classifySupabaseTable(
      "https://project.supabase.co/rest/v1/static_assets",
    ),
    null,
  );
  assert.deepEqual(
    classifyRequest(
      "https://project.supabase.co/rest/v1/rpc/get_private_app_bootstrap_v1",
      ORIGIN,
    ),
    { category: "pcs2_bootstrap" },
  );
  assert.deepEqual(
    classifyRequest("https://app.plaivra.com/api/version", ORIGIN),
    { category: "other" },
  );
});

test("opaque IDs, query strings, credentials, tokens, and cookies are sanitized", () => {
  const safe = sanitizeEvidenceUrl(
    "https://app.plaivra.com/api/workouts/history/11111111-1111-4111-8111-111111111111?cursor=very-secret",
  );
  assert.equal(safe, "https://app.plaivra.com/api/workouts/history/id");
  const evidence = sanitizeEvidence({
    authorization: "Bearer header.payload.signature",
    cookie: "cookie=session=private",
    email: "synthetic@example.test",
    route:
      "/api/workouts/history/11111111-1111-4111-8111-111111111111?cursor=secret",
  });
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(
    serialized,
    /header\.payload|session=private|synthetic@example|11111111|cursor=secret/,
  );
});

test("decoded bytes and Content-Length remain separate metrics", () => {
  const record = response("today_projection", "total;dur=1");
  assert.equal(record.decodedBodyBytes, 1234);
  assert.equal(record.contentLengthHeaderBytes, 900);
  const absent = safeResponseRecord({
    category: "today_projection",
    status: 200,
    durationMs: 1,
    decodedBodyBytes: 500,
    headers: safeHeaders("total;dur=1", {
      "x-plaivra-today-contract": "1",
    }),
  });
  assert.equal(absent.contentLengthHeaderBytes, null);
});

test("injected harness accepts one Today and one History request, including empty state", () => {
  const result = runInjectedHarness({
    today: validTodayCapture(),
    history: validHistoryCapture(),
  });
  assert.equal(result.today.requestCounts.projection, 1);
  assert.equal(result.today.requestCounts.directSupabaseReads, 0);
  assert.equal(result.history.requestCounts.firstPage, 1);
  assert.equal(result.history.requestCounts.cursor, 0);
  assert.equal(result.today.decodedBodyBytes, 1234);
});

test("injected hard gates reject duplicate requests and direct Supabase reads", () => {
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "today",
        capture({
          today: 2,
          responses: [response("today_projection", "total;dur=1")],
        }),
      ),
    /TODAY_PROJECTION_REQUEST_COUNT_INVALID/,
  );
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "today",
        capture({
          today: 1,
          direct: 1,
          responses: [response("today_projection", "total;dur=1")],
        }),
      ),
    /TODAY_DIRECT_SUPABASE_READ_DETECTED/,
  );
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "history",
        capture({
          first: 2,
          responses: [
            response(
              "history_first_page",
              "total;dur=1, list;dur=1, filters;dur=1",
            ),
          ],
        }),
      ),
    /HISTORY_FIRST_PAGE_REQUEST_COUNT_INVALID/,
  );
});

test("injected hard gates reject missing timing, HTTP 500, and browser errors", () => {
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "history",
        capture({
          first: 1,
          responses: [response("history_first_page", null)],
        }),
      ),
    /MEASUREMENT_SERVER_TIMING_INVALID/,
  );
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "history",
        capture({
          first: 1,
          http5xx: 1,
          responses: [
            response(
              "history_first_page",
              "total;dur=1, list;dur=1, filters;dur=1",
              500,
            ),
          ],
        }),
      ),
    /MEASUREMENT_HTTP_5XX/,
  );
  assert.throws(
    () =>
      evaluateCapturedOperation(
        "today",
        capture({
          today: 1,
          pageErrors: ["safe"],
          responses: [response("today_projection", "total;dur=1")],
        }),
      ),
    /MEASUREMENT_PAGE_ERROR/,
  );
});

test("aggregation rejects failed/empty samples and reports raw-sample percentiles", () => {
  const sample = {
    passed: true,
    browserObservedDurationMs: 10,
    serverTotalDurationMs: 5,
    decodedBodyBytes: 100,
    contentLengthHeaderBytes: null,
  };
  assert.deepEqual(
    aggregateSamples([
      sample,
      { ...sample, browserObservedDurationMs: 20 },
    ]),
    {
      sampleCount: 2,
      browserObservedDurationMs: {
        sampleCount: 2,
        min: 10,
        p50: 10,
        p95: 20,
        max: 20,
      },
      serverTotalDurationMs: {
        sampleCount: 2,
        min: 5,
        p50: 5,
        p95: 5,
        max: 5,
      },
      decodedBodyBytes: {
        sampleCount: 2,
        min: 100,
        p50: 100,
        p95: 100,
        max: 100,
      },
      contentLengthHeaderBytes: null,
    },
  );
  assert.throws(
    () => aggregateSamples([]),
    /AGGREGATION_REQUIRES_COMPLETE_VALID_SAMPLES/,
  );
  assert.throws(
    () => aggregateSamples([{ ...sample, passed: false }]),
    /AGGREGATION_REQUIRES_COMPLETE_VALID_SAMPLES/,
  );
});

test("identity gate requires the exact reviewed release state", () => {
  const options = { expectedCommit: SHA, expectedMigration: MIGRATION };
  const valid = {
    commitSha: SHA,
    expectedDatabaseMigrationVersion: MIGRATION,
    databaseMigrationVersion: MIGRATION,
    artifactIdentityValid: true,
    releaseReady: true,
    schemaCompatible: true,
    pendingMigrationCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 0,
  };
  assert.equal(validateVersionIdentity(valid, options, 200).commitSha, SHA);
  assert.throws(
    () =>
      validateVersionIdentity(
        { ...valid, commitSha: "b".repeat(40) },
        options,
        200,
      ),
    /DEPLOYED_COMMIT_MISMATCH/,
  );
  assert.throws(
    () =>
      validateVersionIdentity(
        { ...valid, pendingMigrationCount: 1 },
        options,
        200,
      ),
    /DEPLOYED_PENDING_MIGRATIONS/,
  );
});

test("summary distinguishes measured, test-only, and not-applicable facts without bodies", () => {
  const routeSamples = Array.from({ length: 10 }, (_, index) => ({
    passed: true,
    browserObservedDurationMs: index + 1,
    serverTotalDurationMs: index + 1,
    decodedBodyBytes: 100 + index,
    contentLengthHeaderBytes: null,
  }));
  const options = {
    mode: "production",
    origin: ORIGIN,
    expectedCommit: SHA,
    expectedMigration: MIGRATION,
    samples: 10,
    warmups: 0,
  };
  const accounts = [
    {
      account: "empty",
      today: routeSamples,
      history: routeSamples.map((sample) => ({ ...sample })),
      interactionEvidence: {
        filterPanel: { status: "not_applicable" },
        selectedOnly: { status: "not_applicable" },
        loadMore: { status: "not_applicable" },
      },
    },
  ];
  const summary = buildSummary({
    options,
    identity: { commitSha: SHA },
    accounts,
  });
  const markdown = renderSummaryMarkdown(summary);
  assert.match(markdown, /Measured deployment facts/);
  assert.match(markdown, /Test-only architecture facts/);
  assert.match(markdown, /Unavailable or not applicable/);
  assert.match(markdown, /not_applicable/);
  assert.match(markdown, /not a general user-latency\nSLA/);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /responseBody|rawBody|responsePayload/,
  );
});
