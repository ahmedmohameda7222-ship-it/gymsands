#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";

export const ORIGINAL_AW2A_VERSION = "20260720213000";
export const CORRECTION_AW2A_VERSION = "20260721012814";
export const MARKER_BEFORE_BRIDGE = "20260711014500";
export const MARKER_AFTER_BRIDGE = "20260717051011";
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ORIGINAL_AW2A_FILE = `${ORIGINAL_AW2A_VERSION}_active_workout_aw2a_execution_state.sql`;
const CORRECTION_AW2A_FILE = `${CORRECTION_AW2A_VERSION}_active_workout_aw2a_execution_state_corrections.sql`;
const SYNTHETIC_SUFFIX = "ci_future_replay_proof.sql";
const MIGRATION_PATTERN = /^(\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/;

function parseArguments(argv) {
  const options = {
    logPath: "quality-reports/database-validation.log",
    proveFutureOrder: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--log") {
      const value = argv[index + 1];
      if (!value) throw new Error("--log requires a path.");
      options.logPath = value;
      index += 1;
      continue;
    }
    if (argument === "--prove-future-order") {
      options.proveFutureOrder = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function git(repositoryRoot, ...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

function appendLog(logPath, message) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${message}\n`, "utf8");
}

function runCommand(command, args, { repositoryRoot, logPath, env = {} }) {
  const rendered = [command, ...args].map(shellQuote).join(" ");
  process.stdout.write(`$ ${rendered}\n`);
  appendLog(logPath, `$ ${rendered}`);

  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
    appendFileSync(logPath, result.stdout, "utf8");
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    appendFileSync(logPath, result.stderr, "utf8");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${rendered} exited with status ${result.status ?? "unknown"}.`);
  }

  return result.stdout.trim();
}

export function assertLocalOnly(repositoryRoot) {
  const linkedProjectRef = join(repositoryRoot, "supabase", ".temp", "project-ref");
  if (existsSync(linkedProjectRef) && readFileSync(linkedProjectRef, "utf8").trim()) {
    throw new Error(
      `Refusing to run against a linked Supabase project (${linkedProjectRef}). Remove the local link before replay.`,
    );
  }

  const parsed = new URL(LOCAL_DATABASE_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local database URL: ${LOCAL_DATABASE_URL}`);
  }
}

export function listRepositoryMigrations(repositoryRoot) {
  const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
  if (!existsSync(migrationsDirectory)) {
    throw new Error(`Missing migrations directory: ${migrationsDirectory}`);
  }

  const migrations = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => {
      const match = filename.match(MIGRATION_PATTERN);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      return { filename, version: match[1] };
    })
    .sort((left, right) => left.version.localeCompare(right.version));

  const duplicateVersions = migrations
    .filter((migration, index) => migrations[index - 1]?.version === migration.version)
    .map((migration) => migration.version);
  if (duplicateVersions.length > 0) {
    throw new Error(`Duplicate repository migration versions: ${[...new Set(duplicateVersions)].join(", ")}`);
  }

  return migrations;
}

export function nextSyntheticVersion(migrations) {
  if (migrations.length === 0) throw new Error("Cannot derive a synthetic version from an empty migration chain.");
  const maximum = BigInt(migrations.at(-1).version);
  const candidate = (maximum + 1n).toString().padStart(14, "0");
  if (candidate.length !== 14) {
    throw new Error(`Synthetic migration version overflow after ${maximum}.`);
  }
  return candidate;
}

export function validateMigrationHistory(expectedVersions, recordedVersions) {
  const expected = [...expectedVersions].sort();
  const counts = new Map();
  for (const version of recordedVersions) {
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count !== 1)
    .map(([version, count]) => `${version} (${count})`);
  const missing = expected.filter((version) => !counts.has(version));
  const unexpected = [...counts.keys()].filter((version) => !expected.includes(version));

  if (duplicates.length || missing.length || unexpected.length) {
    throw new Error(
      [
        duplicates.length ? `duplicate local records: ${duplicates.join(", ")}` : null,
        missing.length ? `missing local records: ${missing.join(", ")}` : null,
        unexpected.length ? `unexpected local records: ${unexpected.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
}

function readMarker(context) {
  return runCommand(
    "psql",
    [
      LOCAL_DATABASE_URL,
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select migration_version from public.release_schema_compatibility where singleton",
    ],
    context,
  );
}

function applyLocalMarkerBridge(context) {
  runCommand(
    "psql",
    [
      LOCAL_DATABASE_URL,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.release_schema_compatibility set migration_version = '${MARKER_AFTER_BRIDGE}' where singleton`,
    ],
    context,
  );
}

function readLocalMigrationVersions(context) {
  const output = runCommand(
    "psql",
    [
      LOCAL_DATABASE_URL,
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select version from supabase_migrations.schema_migrations order by version",
    ],
    context,
  );
  return output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function verifyRequiredFiles(repositoryRoot) {
  const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
  for (const filename of [ORIGINAL_AW2A_FILE, CORRECTION_AW2A_FILE]) {
    const path = join(migrationsDirectory, filename);
    if (!existsSync(path)) throw new Error(`Missing required migration file: ${path}`);
  }
}

function replayChronologically(context, expectedMigrations, label) {
  appendLog(context.logPath, `\n=== ${label} ===`);
  runCommand(
    "supabase",
    ["db", "reset", "--local", "--no-seed", "--version", ORIGINAL_AW2A_VERSION],
    context,
  );

  const markerBefore = readMarker(context);
  if (markerBefore !== MARKER_BEFORE_BRIDGE) {
    throw new Error(
      `Expected local compatibility marker ${MARKER_BEFORE_BRIDGE} before bridge, received ${markerBefore || "<empty>"}.`,
    );
  }

  applyLocalMarkerBridge(context);
  runCommand("supabase", ["migration", "up", "--local", "--include-all"], context);

  const markerAfter = readMarker(context);
  if (markerAfter !== MARKER_AFTER_BRIDGE) {
    throw new Error(
      `Expected local compatibility marker ${MARKER_AFTER_BRIDGE} after replay, received ${markerAfter || "<empty>"}.`,
    );
  }

  const recordedVersions = readLocalMigrationVersions(context);
  validateMigrationHistory(
    expectedMigrations.map((migration) => migration.version),
    recordedVersions,
  );

  return recordedVersions;
}

function syntheticMigrationSql() {
  return `begin;

do $$
begin
  if to_regclass('public.workout_session_execution_states') is null then
    raise exception 'AW-2A original migration was not applied before the synthetic future migration';
  end if;
  if to_regclass('public.workout_session_execution_states_active_snapshot_item_idx') is null then
    raise exception 'AW-2A correction was not applied before the synthetic future migration';
  end if;
  if (
    select migration_version
    from public.release_schema_compatibility
    where singleton
  ) <> '${MARKER_AFTER_BRIDGE}' then
    raise exception 'local compatibility marker bridge was not preserved';
  end if;
end
$$;

commit;
`;
}

function assertSyntheticOrder(recordedVersions, syntheticVersion) {
  const originalIndex = recordedVersions.indexOf(ORIGINAL_AW2A_VERSION);
  const correctionIndex = recordedVersions.indexOf(CORRECTION_AW2A_VERSION);
  const syntheticIndex = recordedVersions.indexOf(syntheticVersion);
  if (!(originalIndex >= 0 && originalIndex < correctionIndex && correctionIndex < syntheticIndex)) {
    throw new Error(
      `Synthetic replay order invalid: original=${originalIndex}, correction=${correctionIndex}, synthetic=${syntheticIndex}.`,
    );
  }
}

function workingTreeStatus(repositoryRoot) {
  return git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(process.cwd(), "rev-parse", "--show-toplevel");
  const logPath = resolve(repositoryRoot, options.logPath);
  const context = { repositoryRoot, logPath };
  const initialStatus = workingTreeStatus(repositoryRoot);
  let syntheticPath = null;
  let bootstrapRoot = null;

  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, "", "utf8");

  try {
    assertLocalOnly(repositoryRoot);
    verifyRequiredFiles(repositoryRoot);

    bootstrapRoot = mkdtempSync(join(tmpdir(), "plaivra-supabase-bootstrap-"));
    const bootstrapSupabaseDirectory = join(bootstrapRoot, "supabase");
    mkdirSync(bootstrapSupabaseDirectory, { recursive: true });
    copyFileSync(
      join(repositoryRoot, "supabase", "config.toml"),
      join(bootstrapSupabaseDirectory, "config.toml"),
    );
    runCommand(
      "supabase",
      ["db", "start"],
      { ...context, repositoryRoot: bootstrapRoot },
    );
    rmSync(bootstrapRoot, { recursive: true, force: true });
    bootstrapRoot = null;

    const repositoryMigrations = listRepositoryMigrations(repositoryRoot);
    const original = repositoryMigrations.find((migration) => migration.version === ORIGINAL_AW2A_VERSION);
    const correction = repositoryMigrations.find((migration) => migration.version === CORRECTION_AW2A_VERSION);
    if (!original || original.filename !== ORIGINAL_AW2A_FILE) {
      throw new Error(`Expected immutable original AW-2A migration ${ORIGINAL_AW2A_FILE}.`);
    }
    if (!correction || correction.filename !== CORRECTION_AW2A_FILE) {
      throw new Error(`Expected immutable AW-2A correction migration ${CORRECTION_AW2A_FILE}.`);
    }

    if (options.proveFutureOrder) {
      const syntheticVersion = nextSyntheticVersion(repositoryMigrations);
      syntheticPath = join(
        repositoryRoot,
        "supabase",
        "migrations",
        `${syntheticVersion}_${SYNTHETIC_SUFFIX}`,
      );
      if (existsSync(syntheticPath)) {
        throw new Error(`Synthetic migration path already exists: ${syntheticPath}`);
      }
      writeFileSync(syntheticPath, syntheticMigrationSql(), "utf8");
      const migrationsWithSynthetic = listRepositoryMigrations(repositoryRoot);
      const recorded = replayChronologically(
        context,
        migrationsWithSynthetic,
        "synthetic future-migration chronological replay proof",
      );
      assertSyntheticOrder(recorded, syntheticVersion);
      rmSync(syntheticPath, { force: true });
      syntheticPath = null;
    }

    const finalMigrations = listRepositoryMigrations(repositoryRoot);
    replayChronologically(context, finalMigrations, "final repository migration replay");
    appendLog(logPath, "Chronological local migration replay passed.");
  } finally {
    if (syntheticPath) rmSync(syntheticPath, { force: true });
    if (bootstrapRoot) rmSync(bootstrapRoot, { recursive: true, force: true });
    const finalStatus = workingTreeStatus(repositoryRoot);
    if (finalStatus !== initialStatus) {
      throw new Error(
        `Replay helper changed the repository working tree.\nBefore:\n${initialStatus}\nAfter:\n${finalStatus}`,
      );
    }
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
