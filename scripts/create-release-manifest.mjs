import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { installedNextVersion } from "./release-runtime-versions.mjs";

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

function deploymentUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Deployment URL must use HTTPS except for localhost.");
  }
  url.username = "";
  url.password = "";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function safeEvidencePath(value) {
  if (!value) return null;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!/^[a-z0-9][a-z0-9._/-]{0,200}$/i.test(normalized) || normalized.includes("..")) {
    throw new Error("Evidence path must be a safe repository-relative path.");
  }
  return normalized;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandVersion(command, args = ["--version"]) {
  if (process.platform === "win32" && command === "npm") {
    return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --version"], {
      cwd: root,
      encoding: "utf8"
    }).trim();
  }
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function evidenceStatus(reportsPath, report, provenance = null) {
  const exitPath = resolve(reportsPath, `${report}.exit`);
  const logPath = resolve(reportsPath, `${report}.log`);
  if (!existsSync(exitPath) || !existsSync(logPath)) return { status: "missing", evidence: null };
  const exitCode = readFileSync(exitPath, "utf8").trim();
  const capturedAt = new Date(Math.max(statSync(exitPath).mtimeMs, statSync(logPath).mtimeMs)).toISOString();
  return {
    status: exitCode === "0" ? "passed" : "failed",
    evidence: `${report}.log`,
    ...(provenance ? {
      commitSha: provenance.commitSha,
      capturedAt,
      stale: Date.parse(capturedAt) < Date.parse(provenance.buildTimestamp)
    } : {})
  };
}

function applyQualityEvidence(manifest, reportsDirectory) {
  if (!reportsDirectory) return null;
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
  const provenance = {
    commitSha: manifest.release.commitSha,
    buildTimestamp: manifest.release.buildTimestamp
  };
  for (const [gate, report] of Object.entries(reportNames)) {
    manifest.qualityGates[gate] = evidenceStatus(reportsPath, report, provenance);
  }
  manifest.smoke.anonymous = evidenceStatus(reportsPath, "post-deploy-smoke");
  manifest.smoke.authenticatedPopulated = evidenceStatus(reportsPath, "authenticated-smoke-populated");
  manifest.smoke.authenticatedEmpty = evidenceStatus(reportsPath, "authenticated-smoke-empty");
  return reportsPath;
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(readFileSync(templatePath, "utf8"));
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
  nextVersion: installedNextVersion(root),
  lockfileVersion: packageLock.lockfileVersion ?? null,
  lockfileSha256: sha256(packageLockPath),
  platform: platform,
  architecture: arch
};

const reportsPath = applyQualityEvidence(manifest, options["quality-reports"]);
const deployedUrl = deploymentUrl(options["deployment-url"]);
if (deployedUrl) {
  const deploymentEvidence = safeEvidencePath(options["deployment-evidence"] || "quality-reports/post-deploy-smoke.json");
  const deploymentStatus = reportsPath ? evidenceStatus(reportsPath, "post-deploy-smoke") : { status: "missing", evidence: null };
  manifest.deployment = {
    status: deploymentStatus.status,
    url: deployedUrl,
    providerEvidence: deploymentEvidence,
    deployedCommitSha: commitSha
  };
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (options.output) {
  const outputPath = isAbsolute(options.output) ? options.output : resolve(process.cwd(), options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
