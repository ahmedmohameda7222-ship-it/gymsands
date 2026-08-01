import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { readWorkoutHistoryFilterOptions } from "@/services/workouts/history/filter-options";
import { workoutHistoryRecordProjectionIsCurrent } from "@/services/workouts/history/record-projection-state";
import { listWorkoutHistoryKeyset } from "@/services/workouts/history/server-list-reader";
import { getWorkoutHistorySessionDetail } from "@/services/workouts/history/server-reader";
import { readSharedWorkoutHistorySessionMetrics } from "@/services/workouts/history/shared-session-metrics";
import type { WorkoutHistoryListRequest } from "@/types/workout-history";

const userId = "b9000000-0000-4000-8000-000000000001";
const cursorSecret = "wh9-real-service-benchmark-cursor-secret-at-least-32-characters";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`WH-9 service benchmark environment is incomplete: ${name}.`);
  return value;
}

const outputPath = requiredEnvironment("WORKOUT_HISTORY_PERFORMANCE_OUTPUT");
const apiUrl = requiredEnvironment("PLAIVRA_LOCAL_SUPABASE_API_URL");
const serviceRoleKey = requiredEnvironment("PLAIVRA_LOCAL_SUPABASE_SERVICE_ROLE_KEY");

export const REAL_SERVICE_BUDGETS = Object.freeze({
  firstPageP95Ms: 1_500,
  secondPageP95Ms: 1_500,
  filteredPageP95Ms: 1_800,
  searchPageP95Ms: 3_000,
  detailP95Ms: 1_500,
  maxListRequests: 12,
  maxListRowsTransferred: 650,
  maxDetailRequests: 14,
  maxDetailRowsTransferred: 1_000,
  listPayloadBytes: 150 * 1024,
  detailPayloadBytes: 300 * 1024,
});

type CapturedCall = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  responseBytes: number;
  rowCount: number;
  errorBody?: string;
};

type Sample = {
  elapsedMs: number;
  requestCount: number;
  rowsTransferred: number;
  responseBytes: number;
  calls: CapturedCall[];
};

type ScenarioReport = {
  samples: Sample[];
  p50Ms: number;
  p95Ms: number;
  maxRequests: number;
  maxRowsTransferred: number;
  maxResponseBytes: number;
};

const captured: CapturedCall[] = [];

function responseRowCount(text: string): number {
  if (!text) return 0;
  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return 1;
    return 0;
  } catch {
    return 0;
  }
}

function sanitizeFailureBody(text: string): string {
  return text.replaceAll(serviceRoleKey, "[redacted]").slice(0, 2_000);
}

function failedCallDiagnostics(): string {
  const failures = captured
    .filter((call) => call.status < 200 || call.status >= 300)
    .map((call) => ({
      method: call.method,
      path: call.path.slice(0, 2_000),
      status: call.status,
      errorBody: call.errorBody ?? "",
    }));
  return failures.length ? JSON.stringify(failures, null, 2) : "<none captured>";
}

const instrumentedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const response = await fetch(input, init);
  const text = await response.clone().text();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  captured.push({
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    path: `${url.pathname}${url.search}`,
    status: response.status,
    durationMs: performance.now() - started,
    responseBytes: new TextEncoder().encode(text).byteLength,
    rowCount: responseRowCount(text),
    ...(response.ok ? {} : { errorBody: sanitizeFailureBody(text) }),
  });
  return response;
};

const supabase: SupabaseClient = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: instrumentedFetch },
});

function percentile(values: number[], quantile: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const index = Math.min(ordered.length - 1, Math.ceil(quantile * ordered.length) - 1);
  return Number(ordered[index]!.toFixed(3));
}

function summarize(samples: Sample[]): ScenarioReport {
  return {
    samples,
    p50Ms: percentile(samples.map((sample) => sample.elapsedMs), 0.5),
    p95Ms: percentile(samples.map((sample) => sample.elapsedMs), 0.95),
    maxRequests: Math.max(...samples.map((sample) => sample.requestCount)),
    maxRowsTransferred: Math.max(...samples.map((sample) => sample.rowsTransferred)),
    maxResponseBytes: Math.max(...samples.map((sample) => sample.responseBytes)),
  };
}

async function measure<T>(operation: () => Promise<T>, repetitions = 7) {
  const samples: Sample[] = [];
  let lastValue: T | null = null;
  for (let sample = 0; sample < repetitions; sample += 1) {
    captured.length = 0;
    const started = performance.now();
    try {
      lastValue = await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `WH-9 measured service operation failed: ${message}\n`
        + `Non-2xx PostgREST calls:\n${failedCallDiagnostics()}`,
      );
    }
    const elapsedMs = performance.now() - started;
    samples.push({
      elapsedMs: Number(elapsedMs.toFixed(3)),
      requestCount: captured.length,
      rowsTransferred: captured.reduce((sum, call) => sum + call.rowCount, 0),
      responseBytes: captured.reduce((sum, call) => sum + call.responseBytes, 0),
      calls: captured.map((call) => ({ ...call })),
    });
  }
  return { value: lastValue as T, report: summarize(samples) };
}

function request(overrides: Partial<WorkoutHistoryListRequest> = {}): WorkoutHistoryListRequest {
  return {
    from: "2021-01-01T00:00:00.000Z",
    to: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    limit: 20,
    statuses: ["completed", "partial", "cancelled", "skipped"],
    sort: "newest",
    ...overrides,
  };
}

async function readFirstPage(input: WorkoutHistoryListRequest) {
  const [response] = await Promise.all([
    listWorkoutHistoryKeyset(supabase, userId, input, cursorSecret),
    readWorkoutHistoryFilterOptions(supabase, userId, input),
  ]);
  return response;
}

function fixtureSessionId(number: number): string {
  const hex = createHash("md5").update(`plaivra-wh9-session-${number}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const scenarioReports: Record<string, ScenarioReport> = {};
let reportWritten = false;

async function writeReport() {
  if (reportWritten) return;
  const first = scenarioReports.multi_year_first_page;
  const second = scenarioReports.multi_year_second_page;
  const status = scenarioReports.filter_status;
  const type = scenarioReports.filter_type;
  const exercise = scenarioReports.filter_exercise;
  const search = scenarioReports.search;
  const detail = scenarioReports.session_detail;
  if (!first || !second || !status || !type || !exercise || !search || !detail) return;

  const listScenarios = [first, second, status, type, exercise, search];
  const queryCounts = {
    measured: true,
    firstPage: first.maxRequests,
    secondPage: second.maxRequests,
    bounded: listScenarios.every((scenario) =>
      scenario.maxRequests <= REAL_SERVICE_BUDGETS.maxListRequests
      && scenario.maxRowsTransferred <= REAL_SERVICE_BUDGETS.maxListRowsTransferred),
    nPlusOne: Math.abs(first.maxRequests - second.maxRequests) > 1,
  };
  const checks = {
    firstPage: first.p95Ms <= REAL_SERVICE_BUDGETS.firstPageP95Ms,
    secondPage: second.p95Ms <= REAL_SERVICE_BUDGETS.secondPageP95Ms,
    statusFilter: status.p95Ms <= REAL_SERVICE_BUDGETS.filteredPageP95Ms,
    typeFilter: type.p95Ms <= REAL_SERVICE_BUDGETS.filteredPageP95Ms,
    exerciseFilter: exercise.p95Ms <= REAL_SERVICE_BUDGETS.filteredPageP95Ms,
    search: search.p95Ms <= REAL_SERVICE_BUDGETS.searchPageP95Ms,
    detail: detail.p95Ms <= REAL_SERVICE_BUDGETS.detailP95Ms,
    listRequests: listScenarios.every((scenario) => scenario.maxRequests <= REAL_SERVICE_BUDGETS.maxListRequests),
    listRows: listScenarios.every((scenario) => scenario.maxRowsTransferred <= REAL_SERVICE_BUDGETS.maxListRowsTransferred),
    detailRequests: detail.maxRequests <= REAL_SERVICE_BUDGETS.maxDetailRequests,
    detailRows: detail.maxRowsTransferred <= REAL_SERVICE_BUDGETS.maxDetailRowsTransferred,
    listPayload: first.maxResponseBytes <= REAL_SERVICE_BUDGETS.listPayloadBytes,
    detailPayload: detail.maxResponseBytes <= REAL_SERVICE_BUDGETS.detailPayloadBytes,
    boundedQueries: queryCounts.bounded && !queryCounts.nPlusOne,
  };
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    environment: {
      apiUrl,
      fixtureUserId: userId,
      fixtureSessions: 5_000,
      measurement: "complete list and detail route read shapes through local PostgREST",
    },
    budgets: REAL_SERVICE_BUDGETS,
    scenarios: scenarioReports,
    queryCounts,
    checks,
    passed: Object.values(checks).every(Boolean),
    optimizationDecision: Object.values(checks).every(Boolean)
      ? "no_new_index"
      : "budget_failure_requires_query_shape_review_before_any_index",
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  reportWritten = true;
  expect(report.passed, JSON.stringify({ checks, queryCounts }, null, 2)).toBe(true);
}

afterAll(async () => {
  await writeReport();
});

describe.sequential("WH-9 real service performance and transfer budgets", () => {
  it("measures first and second multi-year keyset pages", async () => {
    const first = await measure(() => readFirstPage(request()));
    expect(first.value.items).toHaveLength(20);
    expect(first.value.nextCursor).toBeTruthy();
    scenarioReports.multi_year_first_page = first.report;

    const second = await measure(() => listWorkoutHistoryKeyset(
      supabase,
      userId,
      request({ cursor: first.value.nextCursor ?? undefined }),
      cursorSecret,
    ));
    expect(second.value.items).toHaveLength(20);
    expect(new Set([
      ...first.value.items.map((item) => item.activityId),
      ...second.value.items.map((item) => item.activityId),
    ]).size).toBe(40);
    scenarioReports.multi_year_second_page = second.report;
  }, 90_000);

  it("measures owner-bounded status and workout-type filters", async () => {
    const status = await measure(() => readFirstPage(request({ statuses: ["completed"] })));
    expect(status.value.items.every((item) => item.lifecycle === "completed" || item.lifecycle === "partial")).toBe(true);
    scenarioReports.filter_status = status.report;

    const type = await measure(() => readFirstPage(request({ workoutTypes: ["strength"] })));
    scenarioReports.filter_type = type.report;
  }, 90_000);

  it("measures exercise filtering and bounded member-facing search", async () => {
    const base = await readFirstPage(request());
    const exerciseId = base.items.flatMap((item) => item.exerciseIds)[0];
    expect(exerciseId).toBeTruthy();
    const exercise = await measure(() => readFirstPage(request({ exerciseIds: [exerciseId!] })));
    scenarioReports.filter_exercise = exercise.report;

    const search = await measure(() => readFirstPage(request({ search: "controlled execution" })));
    expect(search.value.items.length).toBeGreaterThan(0);
    scenarioReports.search = search.report;
  }, 90_000);

  it("measures the complete detail read shape", async () => {
    const sessionId = fixtureSessionId(4_999);
    const detail = await measure(async () => {
      const [response, metrics, projectionCurrent] = await Promise.all([
        getWorkoutHistorySessionDetail(supabase, userId, sessionId),
        readSharedWorkoutHistorySessionMetrics(supabase, userId, sessionId),
        workoutHistoryRecordProjectionIsCurrent(supabase, userId, sessionId),
      ]);
      return {
        ...response,
        projectionCurrent,
        summary: {
          ...response.summary,
          reliableVolume: metrics.externalLoadVolume > 0
            ? metrics.externalLoadVolume
            : null,
        },
      };
    });
    expect(detail.value.activity.canonicalSessionId).toBe(sessionId);
    expect(detail.value.projectionCurrent).toBe(true);
    scenarioReports.session_detail = detail.report;
    await writeReport();
  }, 90_000);
});
