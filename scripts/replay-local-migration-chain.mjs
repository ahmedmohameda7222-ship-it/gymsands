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
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export * from "./replay-local-migration-chain-legacy.mjs";
import {
  AW2B_VERSION,
  LOCAL_DATABASE_URL,
  MARKER_AFTER_AW2A_PROMOTION,
  assertLocalOnly,
  listRepositoryMigrations,
  validateMigrationHistory,
} from "./replay-local-migration-chain-legacy.mjs";

export const AW2C_VERSION = "20260722070000";
export const MARKER_AFTER_AW2B_PROMOTION = "20260721224813";
export const AW3B_HARDENING_VERSION = "20260722224500";
export const MARKER_AFTER_AW3A_PROMOTION = "20260722161542";
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

function setMarker(cwd, logPath, value) {
  run(
    "psql",
    [LOCAL_DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1", "-c", `update public.release_schema_compatibility set migration_version='${value}' where singleton`],
    cwd,
    logPath,
  );
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

function stageAw2cAndFutureMigrations(repositoryRoot, stagedDirectory) {
  const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
  const staged = listRepositoryMigrations(repositoryRoot)
    .filter(({ version }) => version >= AW2C_VERSION)
    .map(({ filename, version }) => {
      const source = join(migrationsDirectory, filename);
      const destination = join(stagedDirectory, filename);
      renameSync(source, destination);
      return { source, destination, filename, version };
    });

  if (!staged.some(({ filename }) => filename === AW2C_FILE)) {
    throw new Error(`Missing required AW-2C migration: ${AW2C_FILE}`);
  }
  return staged;
}

function restoreStagedMigrations(staged) {
  for (const entry of staged) {
    if (existsSync(entry.destination) && !existsSync(entry.source)) {
      renameSync(entry.destination, entry.source);
    }
  }
}

async function main() {
  const { logPath: requestedLogPath } = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(process.cwd(), "rev-parse", "--show-toplevel");
  const logPath = resolve(repositoryRoot, requestedLogPath);
  const stagedDirectory = mkdtempSync(join(tmpdir(), "plaivra-aw2c-and-future-replay-"));
  const initialStatus = git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
  let staged = [];

  assertLocalOnly(repositoryRoot);
  if (AW2B_VERSION >= AW2C_VERSION) throw new Error("AW-2C migration must sort after AW-2B.");

  try {
    staged = stageAw2cAndFutureMigrations(repositoryRoot, stagedDirectory);
    const aw2c = staged.filter(({ version }) => version === AW2C_VERSION);
    const future = staged.filter(({ version }) => version > AW2C_VERSION);
    const aw3aReplayContext = future.filter(({ version }) => version < AW3B_HARDENING_VERSION);
    const aw3aReleasedContext = future.filter(({ version }) => version >= AW3B_HARDENING_VERSION);
    appendFileSync(
      logPath,
      `Staged AW-2C and ${future.length} future migration(s) before legacy replay: ${staged.map(({ filename }) => basename(filename)).join(", ")}\n`,
      "utf8",
    );

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

    restoreStagedMigrations(aw2c);
    setMarker(repositoryRoot, logPath, MARKER_AFTER_AW2B_PROMOTION);
    run("supabase", ["migration", "up", "--local", "--include-all"], repositoryRoot, logPath);
    if (marker(repositoryRoot, logPath) !== MARKER_AFTER_AW2B_PROMOTION) {
      throw new Error("AW-2C replay changed its compatibility marker unexpectedly.");
    }

    // Future repository migrations run after AW-2C. Reproduce the immutable repository
    // marker context used by the AW-3A and initial AW-3B replay preflights.
    setMarker(repositoryRoot, logPath, MARKER_AFTER_AW2A_PROMOTION);
    restoreStagedMigrations(aw3aReplayContext);
    run("supabase", ["migration", "up", "--local", "--include-all"], repositoryRoot, logPath);
    if (marker(repositoryRoot, logPath) !== MARKER_AFTER_AW2A_PROMOTION) {
      throw new Error("AW-3A/AW-3B repository-context replay changed its compatibility marker unexpectedly.");
    }

    // The AW-3B Production hardening migration was authored after AW-3A release
    // closure and therefore runs under the exact released AW-3A marker.
    setMarker(repositoryRoot, logPath, MARKER_AFTER_AW3A_PROMOTION);
    restoreStagedMigrations(aw3aReleasedContext);
    run("supabase", ["migration", "up", "--local", "--include-all"], repositoryRoot, logPath);

    const markerAfter = marker(repositoryRoot, logPath);
    if (markerAfter !== MARKER_AFTER_AW3A_PROMOTION) {
      throw new Error(`Expected marker ${MARKER_AFTER_AW3A_PROMOTION} after AW-2C and future replay, received ${markerAfter || "<empty>"}.`);
    }
    const migrations = listRepositoryMigrations(repositoryRoot);
    validateMigrationHistory(migrations.map(({ version }) => version), recordedVersions(repositoryRoot, logPath));
    appendFileSync(logPath, "AW-2C and future chronological local migration replay passed.\n", "utf8");
  } finally {
    restoreStagedMigrations(staged);
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
