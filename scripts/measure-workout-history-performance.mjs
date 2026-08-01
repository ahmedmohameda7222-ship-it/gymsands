import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_PATH = path.join(
  SCRIPT_DIR,
  "workout-history-performance-fixture.sql",
);
const REPORT_PREFIX = "PLAIVRA_WH9_REPORT:";
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  "quality-reports",
  "workout-history-performance",
  "report.json",
);

export const PERFORMANCE_BUDGETS = Object.freeze({
  listP95Ms: 150,
  summaryP95Ms: 200,
  detailP95Ms: 200,
  filterP95Ms: 250,
  searchP95Ms: 300,
  listPayloadBytes: 150 * 1024,
  detailPayloadBytes: 300 * 1024,
});

export function assertDisposableLocalDatabaseUrl(value) {
  if (!value) {
    throw new Error("PLAIVRA_LOCAL_DATABASE_URL is required.");
  }

  const url = new URL(value);
  const localHost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "postgresql:" || !localHost || url.port !== "54322") {
    throw new Error(
      "WH-9 performance fixtures may run only on the disposable local Supabase database at localhost:54322.",
    );
  }
  return value;
}

export function evaluatePerformanceBudgets(databaseReport) {
  const timings = databaseReport.timings;
  const primaryFilters = [
    "filter_status",
    "filter_type",
    "filter_exercise",
    "filter_repeated",
  ];
  const checks = {
    defaultMonthList:
      timings.default_month.p95Ms <= PERFORMANCE_BUDGETS.listP95Ms,
    threeMonthList: timings.three_month.p95Ms <= PERFORMANCE_BUDGETS.listP95Ms,
    multiYearList: timings.multi_year.p95Ms <= PERFORMANCE_BUDGETS.listP95Ms,
    periodSummary:
      timings.period_summary.p95Ms <= PERFORMANCE_BUDGETS.summaryP95Ms,
    sessionDetail:
      timings.session_detail.p95Ms <= PERFORMANCE_BUDGETS.detailP95Ms,
    primaryFilters: primaryFilters.every(
      (label) => timings[label].p95Ms <= PERFORMANCE_BUDGETS.filterP95Ms,
    ),
    search: timings.search.p95Ms <= PERFORMANCE_BUDGETS.searchP95Ms,
    listPayload:
      databaseReport.payloadBytes.list_20 <=
      PERFORMANCE_BUDGETS.listPayloadBytes,
    detailPayload:
      databaseReport.payloadBytes.session_detail <=
      PERFORMANCE_BUDGETS.detailPayloadBytes,
    boundedQueries:
      databaseReport.queryCounts.bounded === true &&
      databaseReport.queryCounts.nPlusOne === false,
  };

  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function parseDatabaseReport(output) {
  const line = output
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(REPORT_PREFIX));
  if (!line) {
    throw new Error(
      "The WH-9 SQL fixture did not emit its machine-readable report.",
    );
  }
  return JSON.parse(line.slice(REPORT_PREFIX.length));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const databaseUrl = assertDisposableLocalDatabaseUrl(
    process.env.PLAIVRA_LOCAL_DATABASE_URL,
  );
  const outputPath = path.resolve(
    argumentValue("--output") ||
      process.env.WORKOUT_HISTORY_PERFORMANCE_OUTPUT ||
      DEFAULT_OUTPUT,
  );
  const fixtureSql = await readFile(FIXTURE_PATH, "utf8");
  const startedAt = new Date().toISOString();
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      input: fixtureSql,
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(
      `WH-9 SQL measurement failed with exit code ${result.status}.`,
    );
  }

  const database = parseDatabaseReport(result.stdout);
  const budget = evaluatePerformanceBudgets(database);
  const git = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    environment: {
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      node: process.version,
      cpuModel: os.cpus()[0]?.model || "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      localDatabase: "Supabase PostgreSQL on localhost:54322",
      gitHead: git.status === 0 ? git.stdout.trim() : null,
    },
    budgets: PERFORMANCE_BUDGETS,
    budget,
    database: {
      ...database,
      optimizationDecision: budget.passed
        ? "no_new_index"
        : "budget_failure_requires_query_shape_review_before_any_index",
    },
    fixtureLifecycle: {
      deterministic: true,
      disposable: true,
      productionAllowed: false,
      cleanup: "single transaction rolled back after measurement",
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `WH-9 performance report: ${outputPath}\nBudgets: ${budget.passed ? "PASS" : "FAIL"}\nIndex decision: ${report.database.optimizationDecision}\n`,
  );
  if (!budget.passed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
