import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "release/release-manifest.template.json");
const exactCommit = /^[a-f0-9]{40}$/i;
const safeIdentifier = /^[a-z0-9][a-z0-9._-]*$/i;

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

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function requiredIdentifier(name, value) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 64 || !safeIdentifier.test(normalized)) {
    throw new Error(`${name} must be a safe non-empty identifier.`);
  }
  return normalized;
}

function requiredCommit(value) {
  const normalized = value?.trim();
  if (!normalized || !exactCommit.test(normalized)) {
    throw new Error("Commit SHA must be an exact 40-character Git SHA.");
  }
  return normalized.toLowerCase();
}

function requiredTimestamp(value) {
  const normalized = value?.trim();
  const timestamp = normalized ? new Date(normalized) : new Date(Number.NaN);
  if (Number.isNaN(timestamp.getTime())) throw new Error("Build timestamp must be an ISO-compatible timestamp.");
  return timestamp.toISOString();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandVersion(command, args = ["--version"]) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function evidenceStatus(reportsPath, report) {
  const exitPath = resolve(reportsPath, `${report}.exit`);
  const logPath = resolve(reportsPath, `${report}.log`);
  if (!existsSync(exitPath) || !existsSync(logPath)) return { status: "missing", evidence: null };
  const exitCode = readFileSync(exitPath, "utf8").trim();
  return { status: exitCode === "0" ? "passed" : "failed", evidence: `${report}.log` };
}

function applyQualityEvidence(manifest, reportsDirectory) {
  if (!reportsDirectory) return;
  const reportsPath = isAbsolute(reportsDirectory) ? reportsDirectory : resolve(process.cwd(), reportsDirectory);
  const reportNames = {
    repositoryIntegrity: "integrity",
    fullMigrationChain: "full-migration-chain",
    databaseLint: "database-lint",
    databasePreflight: "database-preflight",
    migrationLedger: "migration-ledger",
    dependencyAudit: "dependency-audit",
    lint: "lint",
    typecheck: "typecheck",
    unitTests: "unit",
    integrationTests: "integration",
    scriptTests: "script-tests",
    telemetryTests: "telemetry-tests",
    environmentValidation: "environment-validation",
    releaseMetadata: "release-metadata",
    productionBuild: "build",
    renderedBrowserQa: "rendered-qa"
  };
  for (const [gate, report] of Object.entries(reportNames)) {
    manifest.qualityGates[gate] = evidenceStatus(reportsPath, report);
  }
  manifest.smoke.anonymous = evidenceStatus(reportsPath, "post-deploy-smoke");
  manifest.smoke.authenticatedPopulated = evidenceStatus(reportsPath, "authenticated-smoke-populated");
  manifest.smoke.authenticatedEmpty = evidenceStatus(reportsPath, "authenticated-smoke-empty");
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(readFileSync(templatePath, "utf8"));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packageLockPath = resolve(root, "package-lock.json");
const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
const migrationLedger = JSON.parse(readFileSync(resolve(root, "supabase/migration-ledger.json"), "utf8"));
const migrationState = deriveMigrationLedgerState(migrationLedger);
const commitSha = requiredCommit(
  options.commit || process.env.PLAIVRA_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || currentCommit()
);
const checkedOutCommit = requiredCommit(currentCommit());
if (commitSha !== checkedOutCommit) {
  throw new Error(`Manifest commit ${commitSha} does not match checked-out commit ${checkedOutCommit}.`);
}

manifest.release = {
  commitSha,
  buildTimestamp: requiredTimestamp(options["build-timestamp"] || process.env.PLAIVRA_BUILD_TIMESTAMP),
  environment: requiredIdentifier(
    "Environment",
    options.environment || process.env.PLAIVRA_RELEASE_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV
  ),
  schemaCompatibilityVersion: requiredIdentifier(
    "Schema compatibility version",
    options["schema-compatibility"] || process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION || "2"
  ),
  expectedDatabaseMigrationVersion: requiredIdentifier(
    "Expected database migration version",
    options["expected-migration"] || migrationState.latestAppliedMigrationVersion
  ),
  migrationLedgerReconciliationState: migrationState.reconciliationState,
  schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount
};

manifest.runtime = {
  nodeVersion: process.version,
  npmVersion: commandVersion("npm"),
  nextVersion: packageJson.dependencies?.next ?? "unknown",
  lockfileVersion: packageLock.lockfileVersion ?? null,
  lockfileSha256: sha256(packageLockPath),
  platform: platform,
  architecture: arch
};

applyQualityEvidence(manifest, options["quality-reports"]);

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (options.output) {
  const outputPath = isAbsolute(options.output) ? options.output : resolve(process.cwd(), options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
