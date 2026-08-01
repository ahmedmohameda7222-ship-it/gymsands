import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_PATH = path.join(
  SCRIPT_DIR,
  "workout-history-performance-fixture.sql",
);
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  "quality-reports",
  "workout-history-performance",
  "report.json",
);
const FIXTURE_USER_ID = "b9000000-0000-4000-8000-000000000001";
export const LOCAL_PROJECT_ID = "gymsands";
export const BENCHMARK_API_EXCLUDES = Object.freeze([
  "realtime",
  "storage-api",
  "imgproxy",
  "mailpit",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
]);

export function assertDisposableLocalDatabaseUrl(value) {
  if (!value) {
    throw new Error("PLAIVRA_LOCAL_DATABASE_URL is required.");
  }
  const url = new URL(value);
  const localHost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    !new Set(["postgresql:", "postgres:"]).has(url.protocol)
    || !localHost
    || url.port !== "54322"
  ) {
    throw new Error(
      "WH-9 performance fixtures may run only on the disposable local Supabase database at localhost:54322.",
    );
  }
  return value;
}

export function parseSupabaseStatusEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(.*))$/u.exec(
      line.trim(),
    );
    if (!match) continue;
    values[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return values;
}

export function buildCommittedFixtureSql(source) {
  const marker = "\ncreate temp table wh9_timings";
  const cutoff = source.indexOf(marker);
  if (cutoff < 0) {
    throw new Error("WH-9 fixture measurement boundary was not found.");
  }
  const setup = source.slice(0, cutoff).trimEnd();
  if (!/generate_series\(1, 5000\)/u.test(setup)) {
    throw new Error("WH-9 committed setup does not contain 5,000 sessions.");
  }
  return `${setup}\n\ncommit;\n`;
}

export function cleanupFixtureSql() {
  return `begin;
delete from public.profiles where id='${FIXTURE_USER_ID}'::uuid;
commit;
`;
}

export function benchmarkApiStopArgs() {
  return ["stop", "--project-id", LOCAL_PROJECT_ID];
}

export function benchmarkApiStartArgs() {
  return ["start", "--exclude", BENCHMARK_API_EXCLUDES.join(",")];
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}.`,
    );
  }
  return result;
}

function runPsql(databaseUrl, sql) {
  execute(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"],
    { input: sql },
  );
}

function transitionToLocalBenchmarkApi() {
  execute("supabase", benchmarkApiStopArgs());
  execute("supabase", benchmarkApiStartArgs());
}

function localSupabaseEnvironment() {
  const result = execute("supabase", ["status", "-o", "env"]);
  const values = parseSupabaseStatusEnv(result.stdout);
  const apiUrl = values.API_URL;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  if (!apiUrl || !serviceRoleKey) {
    const availableKeys = Object.keys(values).sort().join(", ") || "none";
    throw new Error(
      `Local Supabase API URL or service-role key could not be resolved after the benchmark profile transition. Available keys: ${availableKeys}.`,
    );
  }
  const parsed = new URL(apiUrl);
  if (
    !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
    || parsed.port !== "54321"
  ) {
    throw new Error("WH-9 refused a non-local Supabase API endpoint.");
  }
  return { apiUrl, serviceRoleKey };
}

async function main() {
  const databaseUrl = assertDisposableLocalDatabaseUrl(
    process.env.PLAIVRA_LOCAL_DATABASE_URL,
  );
  const outputPath = path.resolve(
    argumentValue("--output")
      || process.env.WORKOUT_HISTORY_PERFORMANCE_OUTPUT
      || DEFAULT_OUTPUT,
  );
  const fixtureSource = await readFile(FIXTURE_PATH, "utf8");
  const setupSql = buildCommittedFixtureSql(fixtureSource);
  const cleanupSql = cleanupFixtureSql();
  await mkdir(path.dirname(outputPath), { recursive: true });

  transitionToLocalBenchmarkApi();
  const local = localSupabaseEnvironment();
  runPsql(databaseUrl, cleanupSql);
  try {
    runPsql(databaseUrl, setupSql);
    execute(
      process.execPath,
      [
        path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"),
        "run",
        "--config",
        "vitest.integration.config.mjs",
        "scripts/workout-history-performance.integration.test.ts",
      ],
      {
        env: {
          ...process.env,
          PLAIVRA_LOCAL_SUPABASE_API_URL: local.apiUrl,
          PLAIVRA_LOCAL_SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
          WORKOUT_HISTORY_PERFORMANCE_OUTPUT: outputPath,
        },
      },
    );
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    process.stdout.write(
      `WH-9 real service performance report: ${outputPath}\n`
      + `Budgets: ${report.passed ? "PASS" : "FAIL"}\n`
      + `First page requests: ${report.queryCounts?.firstPage ?? "unknown"}\n`
      + `Second page requests: ${report.queryCounts?.secondPage ?? "unknown"}\n`
      + `Index decision: ${report.optimizationDecision}\n`,
    );
    if (!report.passed) process.exitCode = 1;
  } finally {
    try {
      runPsql(databaseUrl, cleanupSql);
    } catch (error) {
      process.stderr.write(
        `WH-9 fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    }
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
