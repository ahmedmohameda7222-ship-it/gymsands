#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ORIGINAL_AW2A_VERSION = "20260720213000";
export const CORRECTION_AW2A_VERSION = "20260721012814";
export const AW2B_VERSION = "20260722013000";
export const MARKER_BEFORE_BRIDGE = "20260711014500";
export const MARKER_AFTER_BRIDGE = "20260717051011";
export const MARKER_AFTER_AW2A_PROMOTION = "20260721012814";
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ORIGINAL_FILE = `${ORIGINAL_AW2A_VERSION}_active_workout_aw2a_execution_state.sql`;
const CORRECTION_FILE = `${CORRECTION_AW2A_VERSION}_active_workout_aw2a_execution_state_corrections.sql`;
const AW2B_FILE = `${AW2B_VERSION}_active_workout_aw2b_command_authority.sql`;
const MIGRATION_PATTERN = /^(\d{12,14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/;
const DATABASE_ONLY_EXCLUDES = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");

function parseArguments(argv) {
  const options = { logPath: "quality-reports/database-validation.log", proveFutureOrder: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--log") {
      if (!argv[index + 1]) throw new Error("--log requires a path.");
      options.logPath = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--prove-future-order") {
      options.proveFutureOrder = true;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return options;
}

function git(repositoryRoot, ...args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function quote(value) {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

function log(logPath, text) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function run(command, args, context) {
  const rendered = [command, ...args].map(quote).join(" ");
  process.stdout.write(`$ ${rendered}\n`);
  log(context.logPath, `$ ${rendered}`);
  const result = spawnSync(command, args, {
    cwd: context.repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    log(context.logPath, result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    log(context.logPath, result.stderr);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${rendered} exited with status ${result.status ?? "unknown"}.`);
  return result.stdout.trim();
}

export function assertLocalOnly(repositoryRoot) {
  const linkedProjectRef = join(repositoryRoot, "supabase", ".temp", "project-ref");
  if (existsSync(linkedProjectRef) && readFileSync(linkedProjectRef, "utf8").trim()) {
    throw new Error(`Refusing to run against a linked Supabase project (${linkedProjectRef}).`);
  }
  const host = new URL(LOCAL_DATABASE_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing non-local database URL: ${LOCAL_DATABASE_URL}`);
  }
}

export function listRepositoryMigrations(repositoryRoot) {
  const directory = join(repositoryRoot, "supabase", "migrations");
  if (!existsSync(directory)) throw new Error(`Missing migrations directory: ${directory}`);
  const migrations = readdirSync(directory)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => {
      const match = filename.match(MIGRATION_PATTERN);
      if (!match) throw new Error(`Invalid migration filename: ${filename}`);
      return { filename, version: match[1] };
    })
    .sort((left, right) => left.version.localeCompare(right.version));
  const duplicates = migrations
    .filter((migration, index) => migrations[index - 1]?.version === migration.version)
    .map((migration) => migration.version);
  if (duplicates.length) throw new Error(`Duplicate repository migration versions: ${[...new Set(duplicates)].join(", ")}`);
  return migrations;
}

export function nextSyntheticVersion(migrations) {
  if (!migrations.length) throw new Error("Cannot derive a synthetic version from an empty migration chain.");
  const version = (BigInt(migrations.at(-1).version) + 1n).toString().padStart(14, "0");
  if (version.length !== 14) throw new Error("Synthetic migration version overflow.");
  return version;
}

export function validateMigrationHistory(expectedVersions, recordedVersions) {
  const expected = [...expectedVersions].sort();
  const counts = new Map();
  for (const version of recordedVersions) counts.set(version, (counts.get(version) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count !== 1).map(([version, count]) => `${version} (${count})`);
  const missing = expected.filter((version) => !counts.has(version));
  const unexpected = [...counts.keys()].filter((version) => !expected.includes(version));
  const errors = [
    duplicates.length ? `duplicate local records: ${duplicates.join(", ")}` : null,
    missing.length ? `missing local records: ${missing.join(", ")}` : null,
    unexpected.length ? `unexpected local records: ${unexpected.join(", ")}` : null,
  ].filter(Boolean);
  if (errors.length) throw new Error(errors.join("; "));
}

function requiredMigrations(repositoryRoot) {
  const directory = join(repositoryRoot, "supabase", "migrations");
  for (const filename of [ORIGINAL_FILE, CORRECTION_FILE, AW2B_FILE]) {
    if (!existsSync(join(directory, filename))) throw new Error(`Missing required migration file: ${filename}`);
  }
}

function psql(context, sql, tuplesOnly = false) {
  return run(
    "psql",
    [LOCAL_DATABASE_URL, "-X", ...(tuplesOnly ? ["-A", "-t"] : []), "-v", "ON_ERROR_STOP=1", "-c", sql],
    context,
  );
}

function readMarker(context) {
  return psql(context, "select migration_version from public.release_schema_compatibility where singleton", true);
}

function recordedVersions(context) {
  return psql(context, "select version from supabase_migrations.schema_migrations order by version", true)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function stageMigrationsAfter(repositoryRoot, version) {
  const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
  const stagedDirectory = mkdtempSync(join(tmpdir(), "plaivra-future-migrations-"));
  const staged = [];
  for (const migration of listRepositoryMigrations(repositoryRoot)) {
    if (migration.version <= version) continue;
    const source = join(migrationsDirectory, migration.filename);
    const destination = join(stagedDirectory, migration.filename);
    renameSync(source, destination);
    staged.push({ source, destination });
  }
  return {
    restore() {
      for (const entry of staged) {
        if (existsSync(entry.destination)) renameSync(entry.destination, entry.source);
      }
      rmSync(stagedDirectory, { recursive: true, force: true });
    },
    filenames: staged.map((entry) => basename(entry.source)),
  };
}

function replay(context, expectedMigrations, label) {
  log(context.logPath, `\n=== ${label} ===`);
  run("supabase", ["db", "reset", "--local", "--no-seed", "--version", ORIGINAL_AW2A_VERSION], context);
  const markerBefore = readMarker(context);
  if (markerBefore !== MARKER_BEFORE_BRIDGE) {
    throw new Error(`Expected marker ${MARKER_BEFORE_BRIDGE} before bridge, received ${markerBefore || "<empty>"}.`);
  }
  psql(context, `update public.release_schema_compatibility set migration_version = '${MARKER_AFTER_BRIDGE}' where singleton`);

  const staged = stageMigrationsAfter(context.repositoryRoot, CORRECTION_AW2A_VERSION);
  try {
    if (!staged.filenames.includes(AW2B_FILE)) throw new Error(`AW-2B migration was not staged after AW-2A correction: ${staged.filenames.join(", ")}`);
    run("supabase", ["migration", "up", "--local", "--include-all"], context);
  } finally {
    staged.restore();
  }

  const markerAfterCorrection = readMarker(context);
  if (markerAfterCorrection !== MARKER_AFTER_BRIDGE) {
    throw new Error(`Expected marker ${MARKER_AFTER_BRIDGE} after AW-2A correction replay, received ${markerAfterCorrection || "<empty>"}.`);
  }

  // AW-2A compatibility promotion was a separate post-merge release action rather
  // than a repository migration. Reproduce that exact local-only boundary before
  // applying AW-2B, whose preflight correctly requires the promoted marker.
  psql(
    context,
    `update public.release_schema_compatibility set migration_version = '${MARKER_AFTER_AW2A_PROMOTION}' where singleton`,
  );
  run("supabase", ["migration", "up", "--local", "--include-all"], context);

  const markerAfter = readMarker(context);
  if (markerAfter !== MARKER_AFTER_AW2A_PROMOTION) {
    throw new Error(`Expected marker ${MARKER_AFTER_AW2A_PROMOTION} after replay, received ${markerAfter || "<empty>"}.`);
  }
  const versions = recordedVersions(context);
  validateMigrationHistory(expectedMigrations.map(({ version }) => version), versions);
  return versions;
}

function syntheticSql() {
  return `begin;

do $$
begin
  if to_regclass('public.workout_session_execution_states') is null then
    raise exception 'AW-2A original migration missing before synthetic migration';
  end if;
  if to_regclass('public.workout_session_execution_states_active_snapshot_item_idx') is null then
    raise exception 'AW-2A correction missing before synthetic migration';
  end if;
  if to_regclass('public.workout_session_execution_commands') is null
     or to_regprocedure('public.apply_workout_session_execution_command_atomic(uuid,uuid,uuid,bigint,text,jsonb)') is null then
    raise exception 'AW-2B command authority missing before synthetic migration';
  end if;
  if (select migration_version from public.release_schema_compatibility where singleton) <> '${MARKER_AFTER_AW2A_PROMOTION}' then
    raise exception 'local AW-2A compatibility promotion bridge missing before synthetic migration';
  end if;
end
$$;

commit;
`;
}

function assertSyntheticOrder(versions, syntheticVersion) {
  const original = versions.indexOf(ORIGINAL_AW2A_VERSION);
  const correction = versions.indexOf(CORRECTION_AW2A_VERSION);
  const aw2b = versions.indexOf(AW2B_VERSION);
  const synthetic = versions.indexOf(syntheticVersion);
  if (!(original >= 0 && original < correction && correction < aw2b && aw2b < synthetic)) {
    throw new Error(`Synthetic replay order invalid: original=${original}, correction=${correction}, aw2b=${aw2b}, synthetic=${synthetic}.`);
  }
}

function status(repositoryRoot) {
  return git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(process.cwd(), "rev-parse", "--show-toplevel");
  const logPath = resolve(repositoryRoot, options.logPath);
  const context = { repositoryRoot, logPath };
  const initialStatus = status(repositoryRoot);
  let bootstrapRoot;
  let syntheticPath;
  writeFileSync(logPath, "", "utf8");

  try {
    assertLocalOnly(repositoryRoot);
    requiredMigrations(repositoryRoot);
    bootstrapRoot = mkdtempSync(join(tmpdir(), "plaivra-supabase-bootstrap-"));
    mkdirSync(join(bootstrapRoot, "supabase"), { recursive: true });
    copyFileSync(join(repositoryRoot, "supabase", "config.toml"), join(bootstrapRoot, "supabase", "config.toml"));
    run("supabase", ["start", "--exclude", DATABASE_ONLY_EXCLUDES], { ...context, repositoryRoot: bootstrapRoot });
    rmSync(bootstrapRoot, { recursive: true, force: true });
    bootstrapRoot = undefined;

    const migrations = listRepositoryMigrations(repositoryRoot);
    const original = migrations.find(({ version }) => version === ORIGINAL_AW2A_VERSION);
    const correction = migrations.find(({ version }) => version === CORRECTION_AW2A_VERSION);
    const aw2b = migrations.find(({ version }) => version === AW2B_VERSION);
    if (original?.filename !== ORIGINAL_FILE) throw new Error(`Expected immutable migration ${ORIGINAL_FILE}.`);
    if (correction?.filename !== CORRECTION_FILE) throw new Error(`Expected immutable migration ${CORRECTION_FILE}.`);
    if (aw2b?.filename !== AW2B_FILE) throw new Error(`Expected AW-2B migration ${AW2B_FILE}.`);

    if (options.proveFutureOrder) {
      const syntheticVersion = nextSyntheticVersion(migrations);
      syntheticPath = join(repositoryRoot, "supabase", "migrations", `${syntheticVersion}_ci_future_replay_proof.sql`);
      if (existsSync(syntheticPath)) throw new Error(`Synthetic path already exists: ${syntheticPath}`);
      writeFileSync(syntheticPath, syntheticSql(), "utf8");
      const withSynthetic = listRepositoryMigrations(repositoryRoot);
      const versions = replay(context, withSynthetic, "synthetic future-migration chronological replay proof");
      assertSyntheticOrder(versions, syntheticVersion);
      rmSync(syntheticPath, { force: true });
      syntheticPath = undefined;
    }

    replay(context, listRepositoryMigrations(repositoryRoot), "final repository migration replay");
    log(logPath, "Chronological local migration replay passed.");
  } catch (error) {
    log(logPath, `REPLAY FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    throw error;
  } finally {
    if (syntheticPath) rmSync(syntheticPath, { force: true });
    if (bootstrapRoot) rmSync(bootstrapRoot, { recursive: true, force: true });
    const finalStatus = status(repositoryRoot);
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
