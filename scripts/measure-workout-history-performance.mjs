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

export const REQUIRED_WORKOUT_SESSION_COLUMNS = Object.freeze([
  "id",
  "user_id",
  "scheduled_session_id",
  "workout_name",
  "workout_day_name",
  "workout_category",
  "started_at",
  "completed_at",
  "skipped_at",
  "cancelled_at",
  "duration_minutes",
  "notes",
  "status",
  "plan_id",
  "plan_day_id",
  "plan_week_id",
  "plan_session_id",
  "deleted_at",
  "history_revision",
  "derived_record_schema_version",
  "derived_record_formula_version",
  "derived_records_evaluated_at",
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
  return `begin;\ndelete from public.profiles where id='${FIXTURE_USER_ID}'::uuid;\ncommit;\n`;
}

export function workoutHistorySchemaProbeUrl(apiUrl) {
  const url = new URL("/rest/v1/workout_sessions", apiUrl);
  url.searchParams.set("select", REQUIRED_WORKOUT_SESSION_COLUMNS.join(","));
  url.searchParams.set("limit", "1");
  return url.toString();
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function waitForWorkoutHistorySchema({
  apiUrl,
  serviceRoleKey,
  attempts = 30,
  delayMs = 250,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
}) {
  const probeUrl = workoutHistorySchemaProbeUrl(apiUrl);
  let lastFailure = "PostgREST did not respond.";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(probeUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      });
      const body = await response.text();
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}: ${body.slice(0, 1_000)}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await sleepImpl(delayMs);
  }

  throw new Error(
    "WH-9 local PostgREST schema is not ready for the Workout History read contract. "
    + `Last probe failure: ${lastFailure}`,
  );
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

function localSupabaseEnvironment() {
  const result = execute("supabase", ["status", "-o", "env"]);
  const values = parseSupabaseStatusEnv(result.stdout);
  const apiUrl = values.API_URL;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  if (!apiUrl || !serviceRoleKey) {
    const availableKeys = Object.keys(values).sort().join(", ") || "none";
    throw new Error(
      `Local Supabase API URL or service-role key could not be resolved from the migrated stack. Available keys: ${availableKeys}.`,
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

  // The chronological migration replay owns the local stack lifecycle. Reusing
  // that exact stack preserves the database volume and schema that passed the
  // preceding gates. Reload and prove PostgREST's relation cache before the
  // benchmark so a schema-contract failure is explicit rather than a generic 503.
  const local = localSupabaseEnvironment();
  runPsql(databaseUrl, "notify pgrst, 'reload schema';\n");
  await waitForWorkoutHistorySchema(local);

  runPsql(databaseUrl, cleanupSql);
  try {
    runPsql(databaseUrl, setupSql);
    // Probe again after fixture insertion. An empty-table schema probe can pass
    // while a real row still fails PostgREST serialization; this converts that
    // condition into the raw HTTP/database error before service wrappers hide it.
    await waitForWorkoutHistorySchema(local);
    execute(
      process.execPath,
      [
        path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"),
        "run",
        "--config",
        "vitest.workout-history-performance.config.mjs",
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
