import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_SHA = /^[a-f0-9]{40}$/i;

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

export function evaluateReleasePreflight({
  expectedCommit,
  checkedOutCommit,
  expectedRepository,
  remoteUrl,
  packageJson,
  nodeVersion,
  nvmVersion,
  nodeFileVersion,
  migrationState,
  manifest
}) {
  const failures = [];
  if (!EXACT_SHA.test(expectedCommit)) failures.push("expected_commit_invalid");
  if (checkedOutCommit !== expectedCommit) failures.push("checkout_commit_mismatch");
  if (!remoteUrl.includes(expectedRepository)) failures.push("repository_origin_mismatch");
  if (packageJson.engines?.node !== "24.x") failures.push("package_node_engine_mismatch");
  if (!nodeVersion.startsWith("v24.")) failures.push("runtime_node_major_mismatch");
  if (nvmVersion.trim() !== "24" || nodeFileVersion.trim() !== "24") failures.push("developer_node_pin_mismatch");
  if (migrationState.reconciliationState !== "reconciled" || migrationState.schemaAppliedUntrackedCount !== 0) {
    failures.push("migration_ledger_not_reconciled");
  }
  if (!manifest || manifest.release?.commitSha !== expectedCommit) failures.push("release_manifest_commit_mismatch");
  if (manifest?.release?.expectedDatabaseMigrationVersion !== migrationState.latestAppliedMigrationVersion) {
    failures.push("release_manifest_migration_mismatch");
  }
  if (manifest?.release?.migrationLedgerReconciliationState !== migrationState.reconciliationState) {
    failures.push("release_manifest_reconciliation_mismatch");
  }
  const requiredGates = [
    "repositoryIntegrity",
    "fullMigrationChain",
    "databaseLint",
    "databasePreflight",
    "migrationLedger",
    "dependencyAudit",
    "lint",
    "typecheck",
    "unitTests",
    "integrationTests",
    "scriptTests",
    "telemetryTests",
    "environmentValidation",
    "releaseMetadata",
    "productionBuild"
  ];
  for (const gate of requiredGates) {
    const evidence = manifest?.qualityGates?.[gate];
    if (evidence?.status !== "passed" || !evidence.evidence) failures.push(`quality_gate_${gate}_missing`);
  }
  return { ready: failures.length === 0, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedCommit = exactSha(options.commit || process.env.PLAIVRA_RELEASE_PREFLIGHT_SHA, "Reviewed commit");
  const expectedRepository = safeRepository(options.repository || process.env.GITHUB_REPOSITORY || "ahmedmohameda7222-ship-it/gymsands");
  const checkedOutCommit = exactSha(git("rev-parse", "HEAD"), "Checked-out commit");
  const remoteUrl = git("remote", "get-url", "origin");
  const packageJson = readJson(resolve(root, "package.json"));
  const ledger = readJson(resolve(root, "supabase/migration-ledger.json"));
  const migrationState = deriveMigrationLedgerState(ledger);
  const reportsPath = resolve(root, options["quality-reports"] || "quality-reports");
  const manifestPath = resolve(reportsPath, "release-manifest.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const result = evaluateReleasePreflight({
    expectedCommit,
    checkedOutCommit,
    expectedRepository,
    remoteUrl,
    packageJson,
    nodeVersion: process.version,
    nvmVersion: readFileSync(resolve(root, ".nvmrc"), "utf8"),
    nodeFileVersion: readFileSync(resolve(root, ".node-version"), "utf8"),
    migrationState,
    manifest
  });
  const evidence = {
    checkedAt: new Date().toISOString(),
    expectedRepository,
    expectedCommit,
    checkedOutCommit,
    nodeVersion: process.version,
    nextVersion: packageJson.dependencies?.next ?? null,
    expectedDatabaseMigrationVersion: migrationState.latestAppliedMigrationVersion,
    migrationLedgerReconciliationState: migrationState.reconciliationState,
    schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
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
    console.error(`Release preflight failed: ${result.failures.join(", ")}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
