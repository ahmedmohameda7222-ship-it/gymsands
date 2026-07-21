#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { exactCommit, exactTimestamp } from "./quality-evidence-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLAIVRA_PROJECT_REF = "bkwezjxvapaeasfvlhvv";
export const ACTIVITY_CATALOG_PROJECT_REF = "khlcctuefiuhunqymkbp";
export const EXPECTED_CURRENT_MARKER = "20260717051011";
export const TARGET_MARKER = "20260721012814";
export const APPLY_CONFIRMATION = `PROMOTE_${PLAIVRA_PROJECT_REF.toUpperCase()}_${TARGET_MARKER}`;
const MARKER_PATTERN = /^\d{12,14}$/;

function parseArgs(argv) {
  const options = { mode: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--apply") {
      if (options.mode) throw new Error("Choose exactly one of --dry-run or --apply.");
      options.mode = argument === "--dry-run" ? "dry-run" : "apply";
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  if (!options.mode) throw new Error("Choose exactly one of --dry-run or --apply.");
  return options;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactMarker(value, label) {
  const normalized = value?.trim();
  if (!normalized || !MARKER_PATTERN.test(normalized)) throw new Error(`${label} must be a 12- or 14-digit migration marker.`);
  return normalized;
}

function redactedCompatibilityRow(row) {
  if (!row || typeof row !== "object") throw new Error("Compatibility row is missing.");
  return {
    singleton: row.singleton,
    version: String(row.version),
    migration_version: String(row.migration_version),
    applied_at: row.applied_at ? exactTimestamp(row.applied_at, "Compatibility applied_at") : null,
  };
}

function validatePreflightEvidence(evidence, reviewedCommit, targetMarker, { requireProductionAuthorization = false } = {}) {
  if (!evidence || typeof evidence !== "object") throw new Error("Release preflight evidence is missing.");
  if (evidence.ready !== true || evidence.releaseReady !== true || evidence.qualityArtifactValid !== true) {
    throw new Error("Release preflight evidence is not successful.");
  }
  if (evidence.expectedCommit !== reviewedCommit) throw new Error("Release preflight commit mismatch.");
  if (evidence.expectedDatabaseMigrationVersion !== targetMarker) throw new Error("Release preflight migration mismatch.");
  if (evidence.migrationLedgerReconciliationState !== "reconciled") throw new Error("Release preflight ledger is not reconciled.");
  if (evidence.pendingMigrationCount !== 0 || evidence.schemaAppliedUntrackedCount !== 0 || evidence.unresolvedMigrationCount !== 0) {
    throw new Error("Release preflight migration counts are not zero.");
  }
  if (Array.isArray(evidence.failures) && evidence.failures.length > 0) throw new Error("Release preflight contains failures.");
  if (Array.isArray(evidence.artifactFailures) && evidence.artifactFailures.length > 0) {
    throw new Error("Release preflight artifact validation contains failures.");
  }
  if (evidence.deploymentPerformed !== false || evidence.productionMutationPerformed !== false) {
    throw new Error("Release preflight evidence is not read-only.");
  }
  if (requireProductionAuthorization && evidence.productionPromotionAuthorized !== true) {
    throw new Error("Apply mode requires explicit Production marker-promotion authorization evidence.");
  }
}

export function validatePromotionRequest({
  projectRef,
  reviewedCommit,
  expectedCurrentMarker,
  targetMarker,
  ledger,
  preflightEvidence,
  requireProductionAuthorization = false,
}) {
  if (projectRef === ACTIVITY_CATALOG_PROJECT_REF) throw new Error("Activity Catalog promotion is forbidden.");
  if (projectRef !== PLAIVRA_PROJECT_REF) throw new Error("Unexpected Supabase project ref.");
  const commitSha = exactCommit(reviewedCommit, "Reviewed commit");
  const current = exactMarker(expectedCurrentMarker, "Expected current marker");
  const target = exactMarker(targetMarker, "Target marker");
  if (current !== EXPECTED_CURRENT_MARKER) throw new Error(`Expected current marker must be ${EXPECTED_CURRENT_MARKER}.`);
  if (target !== TARGET_MARKER) throw new Error(`Target marker must be ${TARGET_MARKER}.`);
  const migrationState = deriveMigrationLedgerState(ledger);
  if (
    migrationState.reconciliationState !== "reconciled"
    || migrationState.pendingCount !== 0
    || migrationState.schemaAppliedUntrackedCount !== 0
    || migrationState.unresolvedCount !== 0
    || migrationState.releaseReady !== true
  ) throw new Error("Repository migration ledger is not release-ready.");
  if (migrationState.latestAppliedMigrationVersion !== target) {
    throw new Error("Target marker does not equal the latest reconciled applied migration.");
  }
  validatePreflightEvidence(preflightEvidence, commitSha, target, { requireProductionAuthorization });
  return { commitSha, current, target, migrationState };
}

function validateBeforeRow(row, expectedCurrentMarker) {
  const before = redactedCompatibilityRow(row);
  if (before.singleton !== true) throw new Error("Compatibility singleton row is invalid.");
  if (before.version !== "2") throw new Error("Compatibility schema version must equal 2.");
  if (before.migration_version !== expectedCurrentMarker) throw new Error("Current compatibility marker mismatch.");
  return before;
}

function validateAfterRow(before, row, targetMarker) {
  const after = redactedCompatibilityRow(row);
  if (after.singleton !== true || after.version !== before.version) throw new Error("Compatibility row identity changed.");
  if (after.migration_version !== targetMarker) throw new Error("Compatibility marker promotion was not retained.");
  if (!after.applied_at) throw new Error("Compatibility promotion did not update applied_at.");
  return after;
}

export async function executeCompatibilityPromotion({
  mode,
  projectRef,
  reviewedCommit,
  expectedCurrentMarker,
  targetMarker,
  ledger,
  preflightEvidence,
  confirmation,
  adapter,
  now = () => new Date(),
}) {
  if (!adapter || typeof adapter.readCompatibility !== "function" || typeof adapter.compareAndSet !== "function") {
    throw new Error("A trusted compatibility database adapter is required.");
  }
  if (!new Set(["dry-run", "apply"]).has(mode)) throw new Error("Promotion mode must be dry-run or apply.");
  const validated = validatePromotionRequest({
    projectRef,
    reviewedCommit,
    expectedCurrentMarker,
    targetMarker,
    ledger,
    preflightEvidence,
    requireProductionAuthorization: mode === "apply",
  });
  if (mode === "apply" && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply mode requires confirmation token ${APPLY_CONFIRMATION}.`);
  }

  const before = validateBeforeRow(await adapter.readCompatibility(), validated.current);
  let after = before;
  let updatedRows = 0;
  if (mode === "apply") {
    const update = await adapter.compareAndSet({
      schemaVersion: "2",
      expectedCurrentMarker: validated.current,
      targetMarker: validated.target,
    });
    updatedRows = Number(update?.updatedRows);
    if (updatedRows !== 1) throw new Error(`Compatibility compare-and-set updated ${updatedRows} rows; expected exactly 1.`);
    validateAfterRow(before, update.row, validated.target);
    after = validateAfterRow(before, await adapter.readCompatibility(), validated.target);
  }

  return {
    schemaVersion: 1,
    capturedAt: now().toISOString(),
    mode,
    projectRef,
    reviewedCommit: validated.commitSha,
    expectedCurrentMarker: validated.current,
    targetMarker: validated.target,
    ledgerLatestAppliedMigration: validated.migrationState.latestAppliedMigrationVersion,
    releasePreflightCheckedAt: preflightEvidence.checkedAt ?? null,
    releasePreflightQualityRunId: String(preflightEvidence.qualityRunId ?? ""),
    before,
    after,
    updatedRows,
    productionWritePerformed: mode === "apply",
    rollbackPerformed: false,
    credentialsRedacted: true,
  };
}

function postgresEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) throw new Error("Release database URL must use PostgreSQL.");
  const database = url.pathname.replace(/^\//, "");
  if (!url.hostname || !database || !url.username) throw new Error("Release database URL is incomplete.");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "15",
  };
}

function psqlJson(sql, env) {
  const result = spawnSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Trusted PostgreSQL operation failed with exit ${result.status}.`);
  const output = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!output) throw new Error("Trusted PostgreSQL operation returned no evidence.");
  return JSON.parse(output);
}

function productionAdapter(databaseUrl) {
  const env = postgresEnvironment(databaseUrl);
  return {
    async readCompatibility() {
      return psqlJson(`select json_build_object(
        'singleton', singleton,
        'version', version,
        'migration_version', migration_version,
        'applied_at', applied_at
      )::text from public.release_schema_compatibility where singleton is true`, env);
    },
    async compareAndSet({ schemaVersion, expectedCurrentMarker, targetMarker }) {
      const sql = `begin;
      do $plaivra_promotion$
      declare
        updated_count integer;
      begin
        update public.release_schema_compatibility
        set migration_version = '${targetMarker}', applied_at = now()
        where singleton is true
          and version = '${schemaVersion}'
          and migration_version = '${expectedCurrentMarker}';
        get diagnostics updated_count = row_count;
        if updated_count <> 1 then
          raise exception 'compatibility compare-and-set updated % rows', updated_count;
        end if;
      end
      $plaivra_promotion$;
      select json_build_object(
        'updatedRows', 1,
        'row', (
          select row_to_json(current_row)
          from (
            select singleton, version, migration_version, applied_at
            from public.release_schema_compatibility
            where singleton is true
          ) current_row
        )
      )::text;
      commit;`;
      return psqlJson(sql, env);
    },
  };
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ledger = readJson(resolve(root, "supabase/migration-ledger.json"), "migration ledger");
  const preflightPath = isAbsolute(options["release-preflight-evidence"] ?? "")
    ? options["release-preflight-evidence"]
    : resolve(root, options["release-preflight-evidence"] || "quality-reports/release-preflight.json");
  const preflightEvidence = readJson(preflightPath, "release preflight evidence");
  const databaseUrl = process.env.PLAIVRA_RELEASE_DATABASE_URL;
  if (!databaseUrl) throw new Error("PLAIVRA_RELEASE_DATABASE_URL is required for trusted server-side verification.");
  const evidence = await executeCompatibilityPromotion({
    mode: options.mode,
    projectRef: options["project-ref"],
    reviewedCommit: options["reviewed-commit"],
    expectedCurrentMarker: options["expected-current-marker"],
    targetMarker: options["target-marker"],
    ledger,
    preflightEvidence,
    confirmation: options.confirmation,
    adapter: productionAdapter(databaseUrl),
  });
  const outputPath = isAbsolute(options.output ?? "")
    ? options.output
    : resolve(root, options.output || "quality-reports/compatibility-marker-promotion.json");
  atomicWrite(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
