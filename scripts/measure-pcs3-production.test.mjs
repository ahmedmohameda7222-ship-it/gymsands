import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, parse, resolve } from "node:path";
import test from "node:test";

import {
  aggregateSamples,
  assertSameOrigin,
  buildSummary,
  classifyRequest,
  classifySupabaseTable,
  cleanOutputEvidence,
  createCapture,
  evaluateCapturedOperation,
  nearestRankPercentile,
  normalizeMeasurementOrigin,
  normalizeReviewedVercelHost,
  parseCliArgs,
  parseServerTiming,
  renderSummaryMarkdown,
  runCli,
  runInjectedHarness,
  safeFailureCode,
  safeResponseRecord,
  summarizeMetric,
  validateMeasurementOptions,
  validateOutputDirectory,
  validateVersionIdentity,
  writeFailureEvidence,
} from "./measure-pcs3-production.mjs";
import {
  sanitizeEvidence,
  sanitizeEvidenceUrl,
} from "./authenticated-release-smoke.mjs";

const SHA = "a".repeat(40);
const MIGRATION = "20260724232734";
const ORIGIN = new URL("https://app.plaivra.com/");

class FakePage {
  #listeners = new Map();

  on(name, listener) {
    const listeners = this.#listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
  }

  off(name, listener) {
    this.#listeners.get(name)?.delete(listener);
  }

  emit(name, value) {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) {
      listener(value);
    }
  }
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolvePromiseValue, rejectPromiseValue) => {
    resolvePromise = resolvePromiseValue;
    rejectPromise = rejectPromiseValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function fakeRequest(url, resourceType = "fetch") {
  return {
    url: () => url,
    resourceType: () => resourceType,
    failure: () => null,
  };
}

function safeHeaders(serverTiming, extra = {}) {
  return {
    "cache-control": "private, no-store",
    vary: "Authorization",
    "x-content-type-options": "nosniff",
    "x-request-id": "safe-request-id",
    "server-timing": serverTiming,
    "x-plaivra-server-timing": serverTiming,
    ...extra,
  };
}

function fakeResponse({
  request,
  category = "today",
  status = 200,
  finished = async () => null,
  body = async () => Buffer.from("body"),
  headers,
}) {
  const url =
    category === "today"
      ? "https://app.plaivra.com/api/dashboard/today?date=private"
      : "https://app.plaivra.com/api/workouts/history";
  return {
    url: () => url,
    request: () => request,
    status: () => status,
    finished,
    body,
    allHeaders: async () =>
      headers ??
      safeHeaders(
        category === "today"
          ? "total;dur=10.0, workout;dur=2.0"
          : "total;dur=15.0, list;dur=10.0, filters;dur=4.0",
        {
          "content-length": "900",
          "x-plaivra-today-contract": "1",
        },
      ),
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

function temporaryRepository(prefix = "pcs3-repository-") {
  const parent = mkdtempSync(resolve(tmpdir(), prefix));
  const repository = resolve(parent, "repository");
  mkdirSync(resolve(repository, "quality-reports"), { recursive: true });
  return { parent, repository };
}

async function capturedTodayDuration(duration) {
  let clock = 0;
  const page = new FakePage();
  const body = deferred();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => clock });
  page.emit("request", request);
  page.emit(
    "response",
    fakeResponse({ request, body: () => body.promise }),
  );
  const finishing = tracker.finish();
  clock = duration;
  body.resolve(Buffer.alloc(duration));
  await finishing;
  return evaluateCapturedOperation("today", tracker.capture);
}

test("CLI validation enforces mode, account, identity, and sample bounds", () => {
  const { parent, repository } = temporaryRepository();
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
  const options = validateMeasurementOptions(parsed, repository);
  assert.equal(options.samples, 20);
  assert.equal(options.warmups, 2);
  assert.equal(options.account, "both");
  assert.equal(options.origin.origin, "http://localhost:3000");
  assert.equal(
    options.output,
    resolve(repository, "quality-reports/pcs3-production-measurement"),
  );

  assert.throws(() => parseCliArgs(["--unknown", "x"]), /Unknown option/);
  assert.throws(() => parseCliArgs(["mode", "preview"]), /Unexpected argument/);
  assert.throws(() => parseCliArgs(["--mode"]), /Missing value/);
  assert.throws(() => validateMeasurementOptions({}, repository), /--mode/);
  assert.throws(
    () => validateMeasurementOptions(validOptions({ samples: "9" }), repository),
    /between 10 and 40/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ samples: "41" }), repository),
    /between 10 and 40/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ warmups: "6" }), repository),
    /between 0 and 5/,
  );
  assert.throws(
    () => validateMeasurementOptions(validOptions({ account: "member" }), repository),
    /populated, empty, or both/,
  );
  assert.throws(
    () =>
      validateMeasurementOptions(
        validOptions({ "expected-commit": "abc" }),
        repository,
      ),
    /40-character SHA/,
  );
  assert.throws(
    () =>
      validateMeasurementOptions(
        validOptions({ "expected-migration": "12" }),
        repository,
      ),
    /12 to 14 digits/,
  );
  rmSync(parent, { recursive: true, force: true });
});

test("canonical Production domains pass without reviewed Vercel authority", () => {
  for (const host of ["plaivra.com", "app.plaivra.com", "www.plaivra.com"]) {
    assert.equal(
      normalizeMeasurementOrigin(`https://${host}/private`, "production")
        .hostname,
      host,
    );
  }
});

test("Production Vercel origin requires one exact reviewed hostname", () => {
  assert.throws(
    () =>
      normalizeMeasurementOrigin(
        "https://plaivra-reviewed-a.vercel.app",
        "production",
      ),
    /requires --reviewed-vercel-host/,
  );
  assert.throws(
    () =>
      normalizeMeasurementOrigin(
        "https://plaivra-reviewed-a.vercel.app",
        "production",
        "plaivra-reviewed-b.vercel.app",
      ),
    /does not match/,
  );
  assert.equal(
    normalizeMeasurementOrigin(
      "https://Plaivra-Reviewed-A.vercel.app/path",
      "production",
      "PLAIVRA-REVIEWED-A.VERCEL.APP",
    ).hostname,
    "plaivra-reviewed-a.vercel.app",
  );
});

test("reviewed Vercel authority accepts hostname only", () => {
  for (const invalid of [
    "*.vercel.app",
    "https://reviewed.vercel.app",
    "reviewed.vercel.app/path",
    "reviewed.vercel.app:443",
    "reviewed.vercel.app?x=1",
    "reviewed.vercel.app#fragment",
    "user@reviewed.vercel.app",
  ]) {
    assert.throws(
      () => normalizeReviewedVercelHost(invalid),
      /exact \.vercel\.app hostname/,
    );
  }
});

test("preview Vercel mode remains preview evidence and redirects stay same-origin", () => {
  const { parent, repository } = temporaryRepository();
  const options = validateMeasurementOptions(
    validOptions({
      mode: "preview",
      url: "https://arbitrary-preview.vercel.app",
    }),
    repository,
  );
  assert.equal(options.mode, "preview");
  assert.equal(options.reviewedVercelHost, null);
  assert.doesNotThrow(() =>
    assertSameOrigin(
      "https://arbitrary-preview.vercel.app/dashboard",
      options.origin,
    ),
  );
  assert.throws(
    () => assertSameOrigin("https://unrelated.example/dashboard", options.origin),
    /MEASUREMENT_REDIRECT_ORIGIN_INVALID/,
  );
  rmSync(parent, { recursive: true, force: true });
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

test("response timing falls back to the standard header", () => {
  const record = safeResponseRecord({
    category: "today_projection",
    status: 200,
    durationMs: 12,
    decodedBodyBytes: 100,
    headers: {
      ...safeHeaders("total;dur=7.0"),
      "x-plaivra-server-timing": undefined,
    },
  });
  assert.deepEqual(record.timing, { total: 7 });
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
});

test("full browser duration includes delayed body completion", async () => {
  let clock = 0;
  const page = new FakePage();
  const finished = deferred();
  const body = deferred();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => clock });

  page.emit("request", request);
  clock = 25;
  page.emit(
    "response",
    fakeResponse({
      request,
      finished: () => finished.promise,
      body: () => body.promise,
    }),
  );
  const finalizing = tracker.finish();
  clock = 80;
  finished.resolve(null);
  clock = 140;
  body.resolve(Buffer.from("complete-body"));
  await finalizing;

  assert.equal(tracker.capture.responses.length, 1);
  assert.equal(
    tracker.capture.responses[0].browserObservedDurationMs,
    140,
  );
  assert.equal(
    tracker.capture.responses[0].decodedBodyBytes,
    Buffer.byteLength("complete-body"),
  );
});

test("response without request start fails safely and cannot strand finish", async () => {
  const page = new FakePage();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => 10 });
  page.emit("response", fakeResponse({ request }));
  assert.equal(tracker.pendingResponseTaskCount(), 1);
  await tracker.finish();
  assert.deepEqual(tracker.capture.requestFailures, ["request_failed"]);
  assert.equal(tracker.capture.responses.length, 0);
  assert.equal(tracker.pendingResponseTaskCount(), 0);
  assert.equal(tracker.responseTaskCleanupCount(), 1);
  assert.throws(
    () => evaluateCapturedOperation("today", tracker.capture),
    /MEASUREMENT_REQUEST_FAILURE/,
  );
});

test("invalid synchronous start cannot strand an already registered task", async () => {
  const page = new FakePage();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => Number.NaN });
  page.emit("request", request);
  page.emit("response", fakeResponse({ request }));
  assert.equal(tracker.pendingResponseTaskCount(), 1);
  await tracker.finish();
  assert.equal(tracker.pendingResponseTaskCount(), 0);
  assert.equal(tracker.responseTaskCleanupCount(), 1);
  assert.deepEqual(tracker.capture.requestFailures, ["request_failed"]);
});

test("finish waits for asynchronous work when another task fails before its first await", async () => {
  let clock = 10;
  const page = new FakePage();
  const missingStartRequest = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=missing",
  );
  const asyncRequest = fakeRequest(
    "https://app.plaivra.com/api/workouts/history",
  );
  const body = deferred();
  const tracker = createCapture(page, ORIGIN, { now: () => clock });
  page.emit("response", fakeResponse({ request: missingStartRequest }));
  page.emit("request", asyncRequest);
  page.emit(
    "response",
    fakeResponse({
      request: asyncRequest,
      category: "history",
      body: () => body.promise,
    }),
  );
  assert.equal(tracker.pendingResponseTaskCount(), 2);
  let resolved = false;
  const finishing = tracker.finish().then(() => {
    resolved = true;
  });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(resolved, false);
  clock = 40;
  body.resolve(Buffer.from("complete"));
  await finishing;
  assert.equal(resolved, true);
  assert.equal(tracker.pendingResponseTaskCount(), 0);
  assert.equal(tracker.responseTaskCleanupCount(), 2);
  assert.deepEqual(tracker.capture.requestFailures, ["request_failed"]);
  assert.equal(tracker.capture.responses.length, 1);
});

test("response finish or body failure creates one safe failure and invalidates sample", async () => {
  for (const failureMode of ["finish", "body"]) {
    const page = new FakePage();
    const request = fakeRequest(
      "https://app.plaivra.com/api/dashboard/today?date=private",
    );
    const tracker = createCapture(page, ORIGIN, { now: () => 10 });
    page.emit("request", request);
    page.emit(
      "response",
      fakeResponse({
        request,
        finished: async () =>
          failureMode === "finish" ? "private finish error" : null,
        body: async () => {
          if (failureMode === "body") {
            throw new Error(
              "private response body token=secret user@example.test?cursor=opaque",
            );
          }
          return Buffer.from("unused");
        },
      }),
    );
    await tracker.finish();
    assert.deepEqual(tracker.capture.requestFailures, ["request_failed"]);
    assert.equal(tracker.capture.responses.length, 0);
    assert.equal(tracker.pendingResponseTaskCount(), 0);
    assert.equal(tracker.responseTaskCleanupCount(), 1);
    assert.throws(
      () => evaluateCapturedOperation("today", tracker.capture),
      /MEASUREMENT_REQUEST_FAILURE/,
    );
  }
});

test("multiple accepted response tasks are all awaited", async () => {
  let clock = 0;
  const page = new FakePage();
  const firstBody = deferred();
  const secondBody = deferred();
  const firstRequest = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const secondRequest = fakeRequest(
    "https://app.plaivra.com/api/workouts/history",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => clock });
  page.emit("request", firstRequest);
  page.emit("request", secondRequest);
  page.emit(
    "response",
    fakeResponse({ request: firstRequest, body: () => firstBody.promise }),
  );
  page.emit(
    "response",
    fakeResponse({
      request: secondRequest,
      category: "history",
      body: () => secondBody.promise,
    }),
  );
  assert.equal(tracker.pendingResponseTaskCount(), 2);
  let finalized = false;
  const finalizing = tracker.finish().then(() => {
    finalized = true;
  });
  clock = 20;
  firstBody.resolve(Buffer.from("one"));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(finalized, false);
  clock = 40;
  secondBody.resolve(Buffer.from("two"));
  await finalizing;
  assert.equal(tracker.capture.responses.length, 2);
  assert.equal(tracker.pendingResponseTaskCount(), 0);
  assert.equal(tracker.responseTaskCleanupCount(), 2);
});

test("no response task can be accepted after capture finalization", async () => {
  const page = new FakePage();
  const tracker = createCapture(page, ORIGIN, { now: () => 0 });
  await tracker.finish();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  let bodyCalls = 0;
  page.emit("request", request);
  page.emit(
    "response",
    fakeResponse({
      request,
      body: async () => {
        bodyCalls += 1;
        return Buffer.from("late");
      },
    }),
  );
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(tracker.acceptingResponses(), false);
  assert.equal(tracker.pendingResponseTaskCount(), 0);
  assert.equal(tracker.capture.responses.length, 0);
  assert.equal(tracker.capture.counts.todayProjection, 0);
  assert.equal(bodyCalls, 0);
});

test("one request is not double-counted when duplicate events are injected", async () => {
  const page = new FakePage();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const responseValue = fakeResponse({ request });
  const tracker = createCapture(page, ORIGIN, { now: () => 5 });
  page.emit("request", request);
  page.emit("request", request);
  page.emit("response", responseValue);
  page.emit("response", responseValue);
  await tracker.finish();
  assert.equal(tracker.capture.counts.todayProjection, 1);
  assert.equal(tracker.capture.responses.length, 1);
  assert.equal(tracker.responseTaskCleanupCount(), 1);
});

test("decoded bytes and Content-Length remain separate after full-body capture", async () => {
  let clock = 0;
  const page = new FakePage();
  const request = fakeRequest(
    "https://app.plaivra.com/api/dashboard/today?date=private",
  );
  const tracker = createCapture(page, ORIGIN, { now: () => clock });
  page.emit("request", request);
  page.emit(
    "response",
    fakeResponse({
      request,
      headers: safeHeaders("total;dur=1", {
        "content-length": "900",
        "x-plaivra-today-contract": "1",
      }),
      body: async () => Buffer.alloc(1234),
    }),
  );
  clock = 50;
  await tracker.finish();
  assert.equal(tracker.capture.responses[0].decodedBodyBytes, 1234);
  assert.equal(tracker.capture.responses[0].contentLengthHeaderBytes, 900);
});

test("p50 and p95 aggregate corrected request-to-body-completion durations", async () => {
  const samples = [];
  for (let duration = 1; duration <= 20; duration += 1) {
    samples.push(await capturedTodayDuration(duration));
  }
  const summary = aggregateSamples(samples);
  assert.equal(summary.browserObservedDurationMs.p50, 10);
  assert.equal(summary.browserObservedDurationMs.p95, 19);
  assert.equal(summary.decodedBodyBytes.p50, 10);
  assert.equal(summary.decodedBodyBytes.p95, 19);
});

test("injected harness retains Today and History hard gates", () => {
  const result = runInjectedHarness({
    today: validTodayCapture(),
    history: validHistoryCapture(),
  });
  assert.equal(result.today.requestCounts.projection, 1);
  assert.equal(result.today.requestCounts.directSupabaseReads, 0);
  assert.equal(result.history.requestCounts.firstPage, 1);
  assert.equal(result.history.requestCounts.cursor, 0);
});

test("injected hard gates reject duplicates, direct reads, missing timing, and runtime failures", () => {
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
          first: 1,
          responses: [response("history_first_page", null)],
        }),
      ),
    /MEASUREMENT_SERVER_TIMING_INVALID/,
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

test("output authority allows only a dedicated quality-reports descendant", () => {
  const { parent, repository } = temporaryRepository("pcs3-output-");
  const qualityRoot = resolve(repository, "quality-reports");
  const defaultOutput = resolve(
    qualityRoot,
    "pcs3-production-measurement",
  );
  const dedicated = resolve(qualityRoot, "reviewed-run");
  assert.equal(validateOutputDirectory(undefined, repository), defaultOutput);
  assert.equal(validateOutputDirectory(dedicated, repository), dedicated);
  assert.equal(
    validateOutputDirectory("quality-reports/reviewed-run", repository),
    dedicated,
  );

  const sibling = resolve(parent, "sibling-repository", "quality-reports", "run");
  const homeLike = resolve(parent, "Documents");
  for (const [value, pattern] of [
    [parse(repository).root, /FILESYSTEM_ROOT_FORBIDDEN/],
    [repository, /REPOSITORY_ROOT_FORBIDDEN/],
    [qualityRoot, /QUALITY_REPORTS_ROOT_FORBIDDEN/],
    [homeLike, /OUTSIDE_QUALITY_REPORTS_FORBIDDEN/],
    [sibling, /OUTSIDE_QUALITY_REPORTS_FORBIDDEN/],
    [resolve(repository, "quality-reports/../escape"), /OUTSIDE_QUALITY_REPORTS_FORBIDDEN/],
    [dirname(repository), /OUTSIDE_QUALITY_REPORTS_FORBIDDEN/],
  ]) {
    assert.throws(() => validateOutputDirectory(value, repository), pattern);
  }
  rmSync(parent, { recursive: true, force: true });
});

test("existing symlink escape from quality-reports is rejected", () => {
  const { parent, repository } = temporaryRepository("pcs3-symlink-");
  const outside = resolve(parent, "outside");
  const link = resolve(repository, "quality-reports", "escape");
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, link, "dir");
  assert.throws(
    () => validateOutputDirectory(resolve(link, "measurement"), repository),
    /SYMLINK_ESCAPE_FORBIDDEN/,
  );
  rmSync(parent, { recursive: true, force: true });
});

test("unsafe output combined with another CLI error writes and deletes nothing", async () => {
  const { parent, repository } = temporaryRepository("pcs3-cli-");
  const unsafe = resolve(parent, "Documents");
  mkdirSync(resolve(unsafe, "populated"), { recursive: true });
  writeFileSync(resolve(unsafe, "summary.json"), "real user file");
  writeFileSync(resolve(unsafe, "populated", "samples.json"), "real samples");
  const stderr = [];
  let executeCalls = 0;
  const result = await runCli(
    ["--output", unsafe, "--unknown", "value"],
    {
      repositoryRoot: repository,
      execute: async () => {
        executeCalls += 1;
      },
      stderr: { write: (value) => stderr.push(value) },
    },
  );
  assert.equal(result, 1);
  assert.equal(executeCalls, 0);
  assert.deepEqual(stderr, ["PCS3_PRODUCTION_MEASUREMENT_FAILED\n"]);
  assert.equal(readFileSync(resolve(unsafe, "summary.json"), "utf8"), "real user file");
  assert.equal(
    readFileSync(resolve(unsafe, "populated", "samples.json"), "utf8"),
    "real samples",
  );
  assert.equal(existsSync(resolve(unsafe, "summary.md")), false);
  rmSync(parent, { recursive: true, force: true });
});

test("failure evidence contains safe code and clears only owned PCS-3 entries", () => {
  const { parent, repository } = temporaryRepository("pcs3-failure-");
  const output = resolve(
    repository,
    "quality-reports",
    "pcs3-production-measurement",
  );
  mkdirSync(resolve(output, "populated"), { recursive: true });
  mkdirSync(resolve(output, "empty"), { recursive: true });
  mkdirSync(resolve(output, "traces"), { recursive: true });
  writeFileSync(resolve(output, "summary.json"), '{"passed":true,"token":"old"}');
  writeFileSync(resolve(output, "summary.md"), "OLD SUCCESS private page text");
  writeFileSync(resolve(output, "populated", "samples.json"), "private body");
  writeFileSync(resolve(output, "empty", "failure.png"), "image bytes");
  writeFileSync(resolve(output, "traces", "trace.zip"), "trace bytes");
  writeFileSync(resolve(output, "measurement.har"), "har bytes");
  writeFileSync(resolve(output, "storage-state.json"), "cookie bytes");
  writeFileSync(resolve(output, "keep.txt"), "not PCS-3 evidence");

  const rawError = new Error(
    "page text synthetic@example.test Bearer token cookie=session 11111111-1111-4111-8111-111111111111 ?cursor=opaque response body",
  );
  const failure = writeFailureEvidence(
    output,
    rawError,
    {
      mode: "production",
      origin: "https://app.plaivra.com/",
      expectedCommit: SHA,
    },
    repository,
  );
  assert.equal(failure.failureCode, "PCS3_PRODUCTION_MEASUREMENT_FAILED");
  const json = readFileSync(resolve(output, "summary.json"), "utf8");
  const markdown = readFileSync(resolve(output, "summary.md"), "utf8");
  const combined = `${json}\n${markdown}`;
  assert.match(markdown, /Safe failure code: PCS3_PRODUCTION_MEASUREMENT_FAILED/);
  assert.match(markdown, /Raw error detail: not recorded/);
  assert.match(markdown, /not a general user-latency\nSLA/);
  assert.doesNotMatch(
    combined,
    /page text|synthetic@example|Bearer|token|cookie=session|11111111|cursor=opaque|response body|OLD SUCCESS|private body/i,
  );
  assert.equal(existsSync(resolve(output, "populated")), false);
  assert.equal(existsSync(resolve(output, "empty")), false);
  assert.equal(existsSync(resolve(output, "traces")), false);
  assert.equal(existsSync(resolve(output, "measurement.har")), false);
  assert.equal(existsSync(resolve(output, "storage-state.json")), false);
  assert.deepEqual(readdirSync(output).sort(), ["keep.txt", "summary.json", "summary.md"]);
  rmSync(parent, { recursive: true, force: true });
});

test("failure path has no screenshot or recording authority", () => {
  const source = readFileSync(
    new URL("./measure-pcs3-production.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\.screenshot\s*\(/);
  assert.doesNotMatch(source, /recordHar\s*:|recordVideo\s*:|storageState\s*:|\.trace\.(?:start|stop)\s*\(/);
  let screenshotCalls = 0;
  const unusedPage = { screenshot: () => { screenshotCalls += 1; } };
  assert.ok(unusedPage);
  assert.equal(screenshotCalls, 0);
});

test("clean output removes known entries and preserves unrelated files", () => {
  const { parent, repository } = temporaryRepository("pcs3-clean-");
  const output = resolve(repository, "quality-reports", "safe-output");
  mkdirSync(resolve(output, "populated"), { recursive: true });
  mkdirSync(resolve(output, "videos"), { recursive: true });
  writeFileSync(resolve(output, "populated", "samples.json"), "stale");
  writeFileSync(resolve(output, "videos", "recording.webm"), "stale");
  writeFileSync(resolve(output, "summary.md"), "stale");
  writeFileSync(resolve(output, "keep.txt"), "keep");
  assert.equal(cleanOutputEvidence(output, repository), output);
  assert.equal(existsSync(resolve(output, "populated")), false);
  assert.equal(existsSync(resolve(output, "videos")), false);
  assert.equal(existsSync(resolve(output, "summary.md")), false);
  assert.equal(readFileSync(resolve(output, "keep.txt"), "utf8"), "keep");
  rmSync(parent, { recursive: true, force: true });
});

test("safe failure code never copies raw exception text", () => {
  assert.equal(
    safeFailureCode(new Error("private@example.test token=secret")),
    "PCS3_PRODUCTION_MEASUREMENT_FAILED",
  );
  assert.equal(safeFailureCode(new Error("DEPLOYED_COMMIT_MISMATCH")), "DEPLOYED_COMMIT_MISMATCH");
});

test("sanitizers retain no opaque IDs, query strings, credentials, tokens, or cookies", () => {
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
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /header\.payload|session=private|synthetic@example|11111111|cursor=secret/,
  );
});

test("summary distinguishes measured, test-only, and not-applicable facts", () => {
  const today = evaluateCapturedOperation("today", validTodayCapture());
  const history = evaluateCapturedOperation("history", validHistoryCapture());
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
      today: Array.from({ length: 10 }, () => ({ ...today })),
      history: Array.from({ length: 10 }, () => ({ ...history })),
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
