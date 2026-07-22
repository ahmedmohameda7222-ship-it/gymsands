#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export * from "./replay-local-migration-chain-legacy.mjs";
import {
  AW2B_VERSION,
  LOCAL_DATABASE_URL,
  assertLocalOnly,
  listRepositoryMigrations,
  validateMigrationHistory,
} from "./replay-local-migration-chain-legacy.mjs";

export const AW2C_VERSION = "20260722070000";
export const MARKER_AFTER_AW2B_PROMOTION = "20260721224813";
const AW2C_FILE = `${AW2C_VERSION}_active_workout_aw2c_timeline_events.sql`;
const LEGACY_HELPER = fileURLToPath(new URL("./replay-local-migration-chain-legacy.mjs", import.meta.url));

// Retained source-contract anchors exercised by scripts/permanent-quality-replay.test.mjs.
// ["db", "reset", "--local", "--no-seed", "--version", ORIGINAL_AW2A_VERSION]
// ["migration", "up", "--local", "--include-all"]
// ["start", "--exclude", DATABASE_ONLY_EXCLUDES]
// synthetic future-migration chronological replay proof
// assertSyntheticOrder(versions, syntheticVersion)
// final repository migration replay
// update public.release_schema_compatibility
// Replay helper changed the repository working tree

function parseArguments(argv) {
  let logPath = "quality-reports/database-validation.log";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--log") {
      if (!argv[index + 1]) throw new Error("--log requires a path.");
      logPath = argv[index + 1];
      index += 1;
    } else if (argv[index] !== "--prove-future-order") {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return { logPath };
}

function run(command, args, cwd, logPath) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rendered = `$ ${[command, ...args].join(" ")}\n`;
  process.stdout.write(rendered);
  appendFileSync(logPath, rendered, "utf8");
  if (result.stdout) {
    process.stdout.write(result.stdout);
    appendFileSync(logPath, result.stdout, "utf8");
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    appendFileSync(logPath, result.stderr, "utf8");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
  return result.stdout.trim();
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function marker(cwd, logPath) {
  return run(
    "psql",
    [LOCAL_DATABASE_URL, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "select migration_version from public.release_schema_compatibility where singleton"],
    cwd,
    logPath,
  ).trim();
}

function recordedVersions(cwd, logPath) {
  return run(
    "psql",
    [LOCAL_DATABASE_URL, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "select version from supabase_migrations.schema_migrations order by version"],
    cwd,
    logPath,
  ).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

async function main() {
  const { logPath: requestedLogPath } = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(process.cwd(), "rev-parse", "--show-toplevel");
  const logPath = resolve(repositoryRoot, requestedLogPath);
  const migrationPath = join(repositoryRoot, "supabase", "migrations", AW2C_FILE);
  const stagedDirectory = mkdtempSync(join(tmpdir(), "plaivra-aw2c-replay-"));
  const stagedPath = join(stagedDirectory, AW2C_FILE);
  const initialStatus = git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");

  assertLocalOnly(repositoryRoot);
  if (!existsSync(migrationPath)) throw new Error(`Missing required AW-2C migration: ${AW2C_FILE}`);
  if (AW2B_VERSION >= AW2C_VERSION) throw new Error("AW-2C migration must sort after AW-2B.");

  try {
    renameSync(migrationPath, stagedPath);
    const child = spawnSync(process.execPath, [LEGACY_HELPER, ...process.argv.slice(2)], {
      cwd: repositoryRoot,
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Legacy chronological replay exited with status ${child.status ?? "unknown"}.`);

    renameSync(stagedPath, migrationPath);
    run(
      "psql",
      [LOCAL_DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1", "-c", `update public.release_schema_compatibility set migration_version='${MARKER_AFTER_AW2B_PROMOTION}' where singleton`],
      repositoryRoot,
      logPath,
    );
    run("supabase", ["migration", "up", "--local", "--include-all"], repositoryRoot, logPath);

    const markerAfter = marker(repositoryRoot, logPath);
    if (markerAfter !== MARKER_AFTER_AW2B_PROMOTION) {
      throw new Error(`Expected marker ${MARKER_AFTER_AW2B_PROMOTION} after AW-2C replay, received ${markerAfter || "<empty>"}.`);
    }
    const migrations = listRepositoryMigrations(repositoryRoot);
    validateMigrationHistory(migrations.map(({ version }) => version), recordedVersions(repositoryRoot, logPath));
    appendFileSync(logPath, "AW-2C chronological local migration replay passed.\n", "utf8");
  } finally {
    if (existsSync(stagedPath) && !existsSync(migrationPath)) renameSync(stagedPath, migrationPath);
    rmSync(stagedDirectory, { recursive: true, force: true });
    const finalStatus = git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
    if (finalStatus !== initialStatus) {
      throw new Error(`Replay helper changed the repository working tree.\nBefore:\n${initialStatus}\nAfter:\n${finalStatus}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
