#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const LOCAL_PROJECT_ID = "gymsands";

export const MINIMAL_API_SERVICE_EXCLUDES = Object.freeze([
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

export function localStackRepairPlan(values) {
  if (values.API_URL && values.SERVICE_ROLE_KEY) return "already-ready";
  if (values.DB_URL) return "restart-preserving-data";
  return "start";
}

function execute(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
  return result;
}

function statusEnvironment() {
  const result = execute("supabase", ["status", "-o", "env"], {
    allowFailure: true,
  });
  return result.status === 0 ? parseSupabaseStatusEnv(result.stdout) : {};
}

function startMinimalApiStack() {
  execute("supabase", [
    "start",
    "--exclude",
    MINIMAL_API_SERVICE_EXCLUDES.join(","),
  ]);
}

export function assertLocalApiReady(values) {
  const missing = [
    !values.DB_URL && "DB_URL",
    !values.API_URL && "API_URL",
    !values.SERVICE_ROLE_KEY && "SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    const available = Object.keys(values).sort().join(", ") || "none";
    throw new Error(
      `Workout History performance stack is missing ${missing.join(", ")}. Available keys: ${available}.`,
    );
  }

  const database = new URL(values.DB_URL);
  const api = new URL(values.API_URL);
  const localHosts = new Set(["127.0.0.1", "localhost"]);
  if (
    !localHosts.has(database.hostname)
    || database.port !== "54322"
    || !localHosts.has(api.hostname)
    || api.port !== "54321"
  ) {
    throw new Error("Workout History performance stack resolved a non-disposable endpoint.");
  }
}

export function prepareLocalPerformanceStack() {
  const before = statusEnvironment();
  const plan = localStackRepairPlan(before);

  if (plan === "restart-preserving-data") {
    process.stdout.write(
      "Detected a migrated database-only Supabase stack; restarting it with the minimal HTTP API plane while preserving local data.\n",
    );
    // Deliberately omit --no-backup. Supabase stop preserves Docker resources and
    // the migrated local database across the restart.
    execute("supabase", ["stop", "--project-id", LOCAL_PROJECT_ID]);
    startMinimalApiStack();
  } else if (plan === "start") {
    process.stdout.write(
      "No reusable local Supabase stack was detected; starting the minimal HTTP API plane.\n",
    );
    startMinimalApiStack();
  }

  const after = statusEnvironment();
  assertLocalApiReady(after);
  process.stdout.write("Workout History local Supabase API plane is ready.\n");
  return after;
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    prepareLocalPerformanceStack();
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}
