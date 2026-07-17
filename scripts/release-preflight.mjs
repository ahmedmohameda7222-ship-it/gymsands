import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { installedNextVersion as readInstalledNextVersion } from "./release-runtime-versions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const PREFLIGHT_MODES = new Set(["release", "review"]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function exactSha(value, label = "Commit SHA") {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !EXACT_SHA.test(normalized)) throw new Error(`${label} must be an exact 40-character Git SHA.`);
  return normalized;
}

function safeRepository(value) {
  const normalized = value?.trim();
  if (!normalized || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(normalized)) {
    throw new Error("Repository must use owner/name form.");
  }
  return normalized;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizePreflightMode(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !PREFLIGHT_MODES.has(normalized)) {
    throw new Error(`Preflight mode must be one of: ${[...PREFLIGHT_MODES].join(", ")}.`);
  }
  return normalized;
}

export function resolvePreflightMode(value) {
  return normalizePreflightMode(value?.trim() ? value : "release");
}

function unique(values) {
  return [...new Set(values)];
}

function reviewMigrationFailures(migrationState) {
  const failures = [];
  if (migrationState.releaseReady) {
    if (
      migrationState.reconciliationState !== "reconciled" ||
      migrationState.pendingCount !== 0 ||
      migrationState.schemaAppliedUntrackedCount !== 0 ||
      migrationState.unresolvedCount !== 0
    ) {
      failures.push("migration_ledger_inconsistent");
    }
    return failures;
  }

  if (migrationState.reconciliationState !== "pending") {
    failures.push("migration_ledger_not_reviewable");
  }
  if (!Number.isInteger(migrationState.pendingCount) || migrationState.pendingCount <= 0) {
    failures.push("migration_pending_count_invalid");
  }
  if (migrationState.schemaAppliedUntrackedCount !== 0) {
    failures.push("migration_schema_applied_untracked");
  }
  if (migrationState.unresolvedCount !== migrationState.pendingCount) {
    failures.push("migration_unresolved_count_mismatch");
  }
  return failures;
}

export function evaluateReleasePreflight({
  mode = "release",
  expectedCommit,
  checkedOutCommit,
  expectedRepository,
  remoteUrl,
  packageJson,
  nodeVersion,
  nvmVersion,
  nodeFileVersion,
  installedNextVersion,
  migrationState,
  manifest
}) {
  const normalizedMode = normalizePreflightMode(mode);
  const commonFailures = [];
  if (!EXACT_SHA.test(expectedCommit)) commonFailures.push("expected_commit_invalid");
  if (checkedOutCommit !== expectedCommit) commonFailures.push("checkout_commit_mismatch");
  if (!remoteUrl.includes(expectedRepository)) commonFailures.push("repository_origin_mismatch");
  if (packageJson.engines?.node !== "24.x") commonFailures.push("package_node_engine_mismatch");
  if (!nodeVersion.startsWith("v24.")) commonFailures.push("runtime_node_major_mismatch");
  if (nvmVersion.trim() !== "24" || nodeFileVersion.trim() !== "24") commonFailures.push("developer_node_pin_mismatch");
  if (!manifest || manifest.release?.commitSha !== expectedCommit) commonFailures.push("release_manifest_commit_mismatch");
  if (manifest?.runtime?.nextVersion !== installedNextVersion) commonFailures.push("release_manifest_next_version_mismatch");
  if (manifest?.release?.expectedDatabaseMigrationVersion !== migrationState.latestAppliedMigrationVersion) {
    commonFailures.push("release_manifest_migration_mismatch");
  }
  if (manifest?.release?.migrationLedgerReconciliationState !== migrationState.reconciliationState) {
    commonFailures.push("release_manifest_reconciliation_mismatch");
  }
  if (manifest?.release?.pendingMigrationCount !== migrationState.pendingCount) {
    commonFailures.push("release_manifest_pending_count_mismatch");
  }
  if (manifest?.release?.schemaAppliedUntrackedCount !== migrationState.schemaAppliedUntrackedCount) {
    commonFailures.push("release_manifest_untracked_count_mismatch");
  }
  if (manifest?.release?.unresolvedMigrationCount !== migrationState.unresolvedCount) {
    commonFailures.push("release_manifest_unresolved_count_mismatch");
  }

  const requiredGates = [
    "repositoryIntegrity", "fullMigrationChain", "databaseLint", "databasePreflight",
    "migrationLedger", "dependencyAudit", "lint", "typecheck", "unitTests",
    "integrationTests", "scriptTests", "telemetryTests", "environmentValidation",
    "releaseMetadata", "productionBuild", "renderedBrowserQa"
  ];
  const manifestBuildTimestamp = Date.parse(manifest?.release?.buildTimestamp ?? "");
  for (const gate of requiredGates) {
    const evidence = manifest?.qualityGates?.[gate];
    if (!evidence || evidence.status === "missing" || !evidence.evidence) {
      commonFailures.push(`quality_gate_${gate}_missing`);
      continue;
    }
    if (evidence.status === "failed") {
      commonFailures.push(`quality_gate_${gate}_failed`);
      continue;
    }
    if (evidence.status !== "passed") {
      commonFailures.push(`quality_gate_${gate}_missing`);
      continue;
    }
    if (evidence.commitSha !== expectedCommit) {
      commonFailures.push(`quality_gate_${gate}_commit_mismatch`);
      continue;
    }
    const capturedAt = Date.parse(evidence.capturedAt ?? "");
    if (evidence.stale === true || Number.isNaN(capturedAt) || Number.isNaN(manifestBuildTimestamp) || capturedAt < manifestBuildTimestamp) {
      commonFailures.push(`quality_gate_${gate}_stale`);
    }
  }

  const releaseBlockers = unique([
    ...commonFailures,
    ...(!migrationState.releaseReady ? ["migration_ledger_not_reconciled"] : [])
  ]);
  const reviewFailures = unique([...commonFailures, ...reviewMigrationFailures(migrationState)]);
  const releaseReady = releaseBlockers.length === 0;
  const reviewReady = reviewFailures.length === 0;
  const failures = normalizedMode === "release" ? releaseBlockers : reviewFailures;

  return {
    mode: normalizedMode,
    ready: normalizedMode === "release" ? releaseReady : reviewReady,
    reviewReady,
    releaseReady,
    releaseBlockers,
    failures
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = resolvePreflightMode(options.mode || process.env.PLAIVRA_PREFLIGHT_MODE);
  const expectedCommit = exactSha(options.commit || process.env.PLAIVRA_RELEASE_PREFLIGHT_SHA, "Reviewed commit");
  const expectedRepository = safeRepository(options.repository || process.env.GITHUB_REPOSITORY || "ahmedmohameda7222-ship-it/gymsands");
  const checkedOutCommit = exactSha(git("rev-parse", "HEAD"), "Checked-out commit");
  const remoteUrl = git("remote", "get-url", "origin");
  const packageJson = readJson(resolve(root, "package.json"));
  const ledger = readJson(resolve(root, "supabase/migration-ledger.json"));
  const migrationState = deriveMigrationLedgerState(ledger);
  const nextVersion = readInstalledNextVersion(root);
  const reportsPath = resolve(root, options["quality-reports"] || "quality-reports");
  const manifestPath = resolve(reportsPath, "release-manifest.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const result = evaluateReleasePreflight({
    mode,
    expectedCommit,
    checkedOutCommit,
    expectedRepository,
    remoteUrl,
    packageJson,
    nodeVersion: process.version,
    nvmVersion: readFileSync(resolve(root, ".nvmrc"), "utf8"),
    nodeFileVersion: readFileSync(resolve(root, ".node-version"), "utf8"),
    installedNextVersion: nextVersion,
    migrationState,
    manifest
  });
  const evidence = {
    checkedAt: new Date().toISOString(),
    mode,
    expectedRepository,
    expectedCommit,
    checkedOutCommit,
    nodeVersion: process.version,
    nextVersion,
    expectedDatabaseMigrationVersion: migrationState.latestAppliedMigrationVersion,
    migrationLedgerReconciliationState: migrationState.reconciliationState,
    pendingMigrationCount: migrationState.pendingCount,
    schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
    unresolvedMigrationCount: migrationState.unresolvedCount,
    manifestPath: existsSync(manifestPath) ? "quality-reports/release-manifest.json" : null,
    deploymentPerformed: false,
    oldArtifactRedeployAccepted: false,
    ...result
  };
  const outputPath = isAbsolute(options.output ?? "")
    ? options.output
    : resolve(root, options.output || "quality-reports/release-preflight.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(outputPath);
  if (!result.ready) {
    const label = mode === "release" ? "Release" : "Review";
    console.error(`${label} preflight failed: ${result.failures.join(", ")}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
