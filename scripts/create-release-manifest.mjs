import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import {
  EXPECTED_REPOSITORY,
  REQUIRED_CANONICAL_FILES,
  REQUIRED_QUALITY_GATES,
  exactCommit,
  exactTimestamp,
  numericRunId,
  safeRelativePath,
  sha256File,
} from "./quality-evidence-contract.mjs";
import { installedNextVersion } from "./release-runtime-versions.mjs";
import { expectedMigrationVersion, validationRequestId } from "./release-identity-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "release/release-manifest.template.json");
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

function sha256Content(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandVersion(command, args = ["--version"]) {
  if (process.platform === "win32" && command === "npm") {
    return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --version"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  }
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readArtifactMetadata(reportsPath) {
  const path = resolve(reportsPath, "artifact-metadata.json");
  if (!existsSync(path)) throw new Error("Missing canonical artifact metadata.");
  const metadata = readJson(path, "artifact metadata");
  return {
    schemaVersion: metadata.schemaVersion,
    repository: metadata.repository,
    workflowRunId: numericRunId(metadata.workflowRunId),
    workflowRunAttempt: numericRunId(metadata.workflowRunAttempt, "Workflow run attempt"),
    reviewedCommit: exactCommit(metadata.reviewedCommit, "Artifact reviewed commit"),
    comparisonBase: exactCommit(metadata.comparisonBase, "Artifact comparison base"),
    validationRequestId: validationRequestId(metadata.validationRequestId),
    expectedDatabaseMigrationVersion: String(metadata.expectedDatabaseMigrationVersion ?? ""),
    eventType: requiredIdentifier("Artifact event type", metadata.eventType),
    qualityBuildTimestamp: exactTimestamp(metadata.qualityBuildTimestamp, "Quality build timestamp"),
    capturedAt: exactTimestamp(metadata.capturedAt, "Artifact captured timestamp"),
    fullReleaseQuality: metadata.fullReleaseQuality === true,
  };
}

export function gateEvidence(reportsPath, evidenceName, provenance) {
  const logRelative = safeRelativePath(`${evidenceName}.log`);
  const exitRelative = safeRelativePath(`${evidenceName}.exit`);
  const metaRelative = safeRelativePath(`${evidenceName}.meta.json`);
  const logPath = resolve(reportsPath, logRelative);
  const exitPath = resolve(reportsPath, exitRelative);
  const metaPath = resolve(reportsPath, metaRelative);
  if (![logPath, exitPath, metaPath].every(existsSync)) {
    return { status: "missing", evidence: null, exitEvidence: null };
  }

  const exitText = readFileSync(exitPath, "utf8").trim();
  if (!/^-?\d+$/.test(exitText)) throw new Error(`Gate ${evidenceName} has an invalid exit evidence file.`);
  const exitCode = Number(exitText);
  const metadata = readJson(metaPath, `${evidenceName} gate metadata`);
  const capturedAt = exactTimestamp(metadata.capturedAt, `${evidenceName} captured timestamp`);
  const commitSha = exactCommit(metadata.commitSha, `${evidenceName} commit`);
  if (commitSha !== provenance.commitSha) throw new Error(`Gate ${evidenceName} commit mismatch.`);
  if (metadata.name !== evidenceName) throw new Error(`Gate ${evidenceName} metadata name mismatch.`);
  if (metadata.exitCode !== exitCode || metadata.passed !== (exitCode === 0)) {
    throw new Error(`Gate ${evidenceName} metadata does not match its exit evidence.`);
  }

  return {
    status: exitCode === 0 ? "passed" : "failed",
    evidence: logRelative,
    exitEvidence: exitRelative,
    metadata: metaRelative,
    exitCode,
    commitSha,
    capturedAt,
    stale: Date.parse(capturedAt) < Date.parse(provenance.qualityBuildTimestamp),
    logSha256: sha256File(logPath),
    exitSha256: sha256File(exitPath),
    metadataSha256: sha256File(metaPath),
    logBytes: statSync(logPath).size,
    exitBytes: statSync(exitPath).size,
  };
}

function walkFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export function createEvidenceIndex(reportsPath, metadata) {
  const excluded = new Set(["release-manifest.json", "evidence-index.json"]);
  const files = {};
  for (const absolutePath of walkFiles(reportsPath)) {
    const relativePath = safeRelativePath(relative(reportsPath, absolutePath));
    if (excluded.has(relativePath) || relativePath.includes(".tmp-")) continue;
    files[relativePath] = {
      sha256: sha256File(absolutePath),
      bytes: statSync(absolutePath).size,
    };
  }
  const index = {
    schemaVersion: 1,
    repository: metadata.repository,
    workflowRunId: metadata.workflowRunId,
    workflowRunAttempt: metadata.workflowRunAttempt,
    reviewedCommit: metadata.reviewedCommit,
    comparisonBase: metadata.comparisonBase,
    validationRequestId: metadata.validationRequestId,
    expectedDatabaseMigrationVersion: metadata.expectedDatabaseMigrationVersion,
    eventType: metadata.eventType,
    qualityBuildTimestamp: metadata.qualityBuildTimestamp,
    generatedAt: new Date().toISOString(),
    files,
  };
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  const path = resolve(reportsPath, "evidence-index.json");
  writeFileSync(path, serialized, "utf8");
  return { index, path, sha256: sha256Content(serialized) };
}

export function applyQualityEvidence(manifest, reportsDirectory) {
  if (!reportsDirectory) return null;
  const reportsPath = isAbsolute(reportsDirectory) ? reportsDirectory : resolve(process.cwd(), reportsDirectory);
  if (!existsSync(reportsPath)) throw new Error(`Quality reports directory does not exist: ${reportsPath}`);
  const metadata = readArtifactMetadata(reportsPath);
  if (metadata.repository !== EXPECTED_REPOSITORY) throw new Error("Artifact repository mismatch.");
  if (metadata.reviewedCommit !== manifest.release.commitSha) throw new Error("Artifact reviewed commit mismatch.");
  if (metadata.expectedDatabaseMigrationVersion !== manifest.release.expectedDatabaseMigrationVersion) {
    throw new Error("Artifact expected migration mismatch.");
  }
  if (!metadata.fullReleaseQuality) throw new Error("Artifact is not a full release-quality run.");

  const provenance = {
    commitSha: manifest.release.commitSha,
    qualityBuildTimestamp: metadata.qualityBuildTimestamp,
  };
  const failures = [];
  for (const [gate, evidenceName] of Object.entries(REQUIRED_QUALITY_GATES)) {
    const evidence = gateEvidence(reportsPath, evidenceName, provenance);
    manifest.qualityGates[gate] = evidence;
    if (evidence.status !== "passed" || evidence.exitCode !== 0 || evidence.stale === true) {
      failures.push(gate);
    }
  }
  for (const requiredFile of REQUIRED_CANONICAL_FILES) {
    if (!existsSync(resolve(reportsPath, requiredFile))) failures.push(requiredFile);
  }
  if (failures.length) {
    throw new Error(`Cannot generate a release-valid manifest; missing, failed, or stale evidence: ${failures.join(", ")}`);
  }

  manifest.smoke.anonymous = { status: "pending", evidence: null };
  manifest.smoke.authenticatedPopulated = { status: "pending", evidence: null };
  manifest.smoke.authenticatedEmpty = { status: "pending", evidence: null };

  const evidenceIndex = createEvidenceIndex(reportsPath, metadata);
  manifest.qualityArtifact = {
    repository: metadata.repository,
    workflowRunId: metadata.workflowRunId,
    workflowRunAttempt: metadata.workflowRunAttempt,
    reviewedCommit: metadata.reviewedCommit,
    comparisonBase: metadata.comparisonBase,
    validationRequestId: metadata.validationRequestId,
    expectedDatabaseMigrationVersion: metadata.expectedDatabaseMigrationVersion,
    eventType: metadata.eventType,
    qualityBuildTimestamp: metadata.qualityBuildTimestamp,
    capturedAt: metadata.capturedAt,
    fullReleaseQuality: true,
    metadata: "artifact-metadata.json",
    metadataSha256: sha256File(resolve(reportsPath, "artifact-metadata.json")),
    evidenceIndex: "evidence-index.json",
    evidenceIndexSha256: evidenceIndex.sha256,
  };
  return { reportsPath, metadata };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(templatePath, "utf8"));
  const packageLockPath = resolve(root, "package-lock.json");
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  const migrationLedger = JSON.parse(readFileSync(resolve(root, "supabase/migration-ledger.json"), "utf8"));
  const migrationState = deriveMigrationLedgerState(migrationLedger);
  const resolvedMigration = expectedMigrationVersion(
    migrationState.latestAppliedMigrationVersion,
    "Latest resolved Production migration",
  );
  const requestedExpectedMigration = requiredIdentifier(
    "Expected database migration version",
    options["expected-migration"] || resolvedMigration,
  );
  if (requestedExpectedMigration !== resolvedMigration) {
    throw new Error("Requested expected migration does not equal the latest resolved Production migration.");
  }
  const commitSha = exactCommit(
    options.commit || process.env.PLAIVRA_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || currentCommit(),
  );
  const checkedOutCommit = exactCommit(currentCommit(), "Checked-out commit");
  if (commitSha !== checkedOutCommit) {
    throw new Error(`Manifest commit ${commitSha} does not match checked-out commit ${checkedOutCommit}.`);
  }

  manifest.release = {
    commitSha,
    buildTimestamp: exactTimestamp(options["build-timestamp"] || process.env.PLAIVRA_BUILD_TIMESTAMP, "Build timestamp"),
    environment: requiredIdentifier(
      "Environment",
      options.environment || process.env.PLAIVRA_RELEASE_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
    ),
    schemaCompatibilityVersion: requiredIdentifier(
      "Schema compatibility version",
      options["schema-compatibility"] || process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION || "2",
    ),
    expectedDatabaseMigrationVersion: resolvedMigration,
    migrationLedgerReconciliationState: migrationState.reconciliationState,
    pendingMigrationCount: migrationState.pendingCount,
    schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
    unresolvedMigrationCount: migrationState.unresolvedCount,
  };

  manifest.runtime = {
    nodeVersion: process.version,
    npmVersion: commandVersion("npm"),
    nextVersion: installedNextVersion(root),
    lockfileVersion: packageLock.lockfileVersion ?? null,
    lockfileSha256: sha256File(packageLockPath),
    platform,
    architecture: arch,
  };

  const qualityContext = applyQualityEvidence(manifest, options["quality-reports"]);
  const deployedUrl = deploymentUrl(options["deployment-url"]);
  if (deployedUrl) {
    const deploymentEvidence = safeRelativePath(options["deployment-evidence"] || "post-deploy-smoke.json");
    const deploymentEvidencePath = qualityContext ? resolve(qualityContext.reportsPath, deploymentEvidence.replace(/^quality-reports\//, "")) : null;
    manifest.deployment = {
      status: deploymentEvidencePath && existsSync(deploymentEvidencePath) ? "passed" : "missing",
      url: deployedUrl,
      providerEvidence: deploymentEvidence,
      deployedCommitSha: commitSha,
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
