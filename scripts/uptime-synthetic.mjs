#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FAILURE_CODES = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  HTTP_STATUS_MISMATCH: "HTTP_STATUS_MISMATCH",
  INVALID_JSON: "INVALID_JSON",
  HEALTH_NOT_OK: "HEALTH_NOT_OK",
  DEPLOYMENT_COMMIT_NOT_CONVERGED: "DEPLOYMENT_COMMIT_NOT_CONVERGED",
  ENVIRONMENT_MISMATCH: "ENVIRONMENT_MISMATCH",
  RELEASE_NOT_READY: "RELEASE_NOT_READY",
  SCHEMA_IDENTITY_MISMATCH: "SCHEMA_IDENTITY_MISMATCH",
  MIGRATION_IDENTITY_MISMATCH: "MIGRATION_IDENTITY_MISMATCH",
  MIGRATION_LEDGER_NOT_RECONCILED: "MIGRATION_LEDGER_NOT_RECONCILED",
  HEALTH_VERSION_IDENTITY_MISMATCH: "HEALTH_VERSION_IDENTITY_MISMATCH",
  PUBLIC_SURFACE_UNAVAILABLE: "PUBLIC_SURFACE_UNAVAILABLE",
});

const SHA = /^[0-9a-f]{40}$/i;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_ENVIRONMENT = /^[a-z][a-z0-9_-]{0,31}$/i;
const PUBLIC_PATHS = ["/", "/login", "/legal/privacy", "/legal/terms"];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS_LIMIT = 30;
const MAX_RETRY_DELAY_MS = 300_000;

class SyntheticFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function safeIdentifier(value) {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : null;
}

function safeSha(value) {
  return typeof value === "string" && SHA.test(value) ? value.toLowerCase() : null;
}

function boundedInteger(value, minimum, maximum) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }
  return parsed;
}

function parseArgv(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!name || value === undefined || value.startsWith("--")) {
      throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
    }
    if (Object.hasOwn(values, name)) throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
    values[name] = value;
    index += 1;
  }
  return values;
}

export function parseOptions(argv = process.argv.slice(2), environment = process.env) {
  const args = parseArgv(argv);
  const rawUrl = args.url ?? environment.PLAIVRA_UPTIME_URL;
  const rawCommit = args["expected-commit"] ?? environment.PLAIVRA_UPTIME_EXPECTED_COMMIT;
  const rawEnvironment = args["expected-environment"] ?? environment.PLAIVRA_UPTIME_EXPECTED_ENVIRONMENT;
  const rawOutput = args.output ?? environment.PLAIVRA_UPTIME_OUTPUT;
  const rawAttempts = args["max-attempts"] ?? environment.PLAIVRA_UPTIME_MAX_ATTEMPTS;
  const rawDelay = args["retry-delay-ms"] ?? environment.PLAIVRA_UPTIME_RETRY_DELAY_MS;

  if (!rawUrl || !rawCommit || !rawEnvironment || rawAttempts === undefined || rawDelay === undefined) {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  if (target.protocol !== "https:" && !(local && target.protocol === "http:")) {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }
  if (target.username || target.password || target.search || target.hash || !["", "/"].includes(target.pathname)) {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }

  const expectedCommit = safeSha(rawCommit);
  if (!expectedCommit) throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  if (!SAFE_ENVIRONMENT.test(rawEnvironment)) throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  if (rawOutput !== undefined && (typeof rawOutput !== "string" || rawOutput.length === 0 || rawOutput.length > 4096)) {
    throw new SyntheticFailure(FAILURE_CODES.INVALID_INPUT);
  }

  return {
    targetOrigin: target.origin,
    expectedCommit,
    expectedEnvironment: rawEnvironment.toLowerCase(),
    output: rawOutput ? resolve(rawOutput) : null,
    maxAttempts: boundedInteger(rawAttempts, 1, MAX_ATTEMPTS_LIMIT),
    retryDelayMs: boundedInteger(rawDelay, 0, MAX_RETRY_DELAY_MS),
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  };
}

function endpointSummary(path) {
  return {
    path,
    status: null,
    duration_ms: 0,
    outcome: "failed",
    failure_code: null,
  };
}

function transportFailureCode(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError"
    ? FAILURE_CODES.REQUEST_TIMEOUT
    : FAILURE_CODES.NETWORK_ERROR;
}

async function fetchConsumed(url, path, expectJson, requestTimeoutMs) {
  const startedAt = Date.now();
  const summary = endpointSummary(path);
  let body = null;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { "User-Agent": "Plaivra-Production-Convergence/1" },
    });
    summary.status = response.status;

    if (expectJson) {
      let serialized;
      try {
        serialized = await response.text();
      } catch (error) {
        summary.failure_code = transportFailureCode(error);
        return { summary, body: null };
      }
      try {
        body = JSON.parse(serialized);
      } catch {
        summary.failure_code = FAILURE_CODES.INVALID_JSON;
        return { summary, body: null };
      }
    } else {
      await response.arrayBuffer();
    }
  } catch (error) {
    summary.failure_code = transportFailureCode(error);
    return { summary, body: null };
  } finally {
    summary.duration_ms = Date.now() - startedAt;
  }
  return { summary, body };
}

function extractHealth(body) {
  if (!isObject(body) || !isObject(body.release)) return null;
  return {
    checked_at: isTimestamp(body.checkedAt) ? body.checkedAt : null,
    status: body.status === "ok" ? "ok" : null,
    commit_sha: safeSha(body.release.commitSha),
    environment: safeIdentifier(body.release.environment),
    schema_compatibility_version: safeIdentifier(body.release.schemaCompatibilityVersion),
  };
}

function extractVersion(body) {
  if (!isObject(body)) return null;
  return {
    commit_sha: safeSha(body.commitSha),
    build_timestamp: isTimestamp(body.buildTimestamp) ? body.buildTimestamp : null,
    environment: safeIdentifier(body.environment),
    schema_compatibility_version: safeIdentifier(body.schemaCompatibilityVersion),
    expected_schema_compatibility_version: safeIdentifier(body.expectedSchemaCompatibilityVersion),
    database_schema_compatibility_version: safeIdentifier(body.databaseSchemaCompatibilityVersion),
    expected_database_migration_version: safeIdentifier(body.expectedDatabaseMigrationVersion),
    database_migration_version: safeIdentifier(body.databaseMigrationVersion),
    migration_reconciliation_state: safeIdentifier(body.migrationLedgerReconciliationState),
    pending_migration_count: Number.isSafeInteger(body.pendingMigrationCount) ? body.pendingMigrationCount : null,
    schema_applied_untracked_count: Number.isSafeInteger(body.schemaAppliedUntrackedCount) ? body.schemaAppliedUntrackedCount : null,
    unresolved_migration_count: Number.isSafeInteger(body.unresolvedMigrationCount) ? body.unresolvedMigrationCount : null,
    artifact_identity_valid: body.artifactIdentityValid === true,
    migration_version_compatible: body.migrationVersionCompatible === true,
    migration_ledger_reconciled: body.migrationLedgerReconciled === true,
    release_ready: body.releaseReady === true,
    schema_compatible: body.schemaCompatible === true,
  };
}

function applyFailure(summary, code) {
  summary.outcome = "failed";
  summary.failure_code = code;
  return code;
}

function validateHealth(summary, extracted, expectedCommit, expectedEnvironment) {
  if (summary.failure_code) return summary.failure_code;
  if (summary.status !== 200) return applyFailure(summary, FAILURE_CODES.HTTP_STATUS_MISMATCH);
  if (!extracted || extracted.status !== "ok" || !extracted.checked_at || !extracted.commit_sha || !extracted.environment || !extracted.schema_compatibility_version) {
    return applyFailure(summary, FAILURE_CODES.HEALTH_NOT_OK);
  }
  if (extracted.environment !== expectedEnvironment) return applyFailure(summary, FAILURE_CODES.ENVIRONMENT_MISMATCH);
  if (extracted.commit_sha !== expectedCommit) return applyFailure(summary, FAILURE_CODES.DEPLOYMENT_COMMIT_NOT_CONVERGED);
  summary.outcome = "passed";
  return null;
}

function validateVersion(summary, extracted, expectedCommit, expectedEnvironment) {
  if (summary.failure_code) return summary.failure_code;
  if (summary.status !== 200) {
    return applyFailure(
      summary,
      summary.status === 503 ? FAILURE_CODES.RELEASE_NOT_READY : FAILURE_CODES.HTTP_STATUS_MISMATCH,
    );
  }
  if (!extracted || !extracted.commit_sha || !extracted.build_timestamp || !extracted.environment) {
    return applyFailure(summary, FAILURE_CODES.RELEASE_NOT_READY);
  }
  if (extracted.environment !== expectedEnvironment) return applyFailure(summary, FAILURE_CODES.ENVIRONMENT_MISMATCH);
  if (extracted.commit_sha !== expectedCommit) return applyFailure(summary, FAILURE_CODES.DEPLOYMENT_COMMIT_NOT_CONVERGED);
  if (!extracted.artifact_identity_valid) {
    return applyFailure(summary, FAILURE_CODES.RELEASE_NOT_READY);
  }
  if (
    !extracted.schema_compatibility_version
    || !extracted.expected_schema_compatibility_version
    || !extracted.database_schema_compatibility_version
    || extracted.schema_compatibility_version !== extracted.expected_schema_compatibility_version
    || extracted.expected_schema_compatibility_version !== extracted.database_schema_compatibility_version
    || !extracted.schema_compatible
  ) return applyFailure(summary, FAILURE_CODES.SCHEMA_IDENTITY_MISMATCH);
  if (
    !extracted.expected_database_migration_version
    || !extracted.database_migration_version
    || extracted.expected_database_migration_version !== extracted.database_migration_version
    || !extracted.migration_version_compatible
  ) return applyFailure(summary, FAILURE_CODES.MIGRATION_IDENTITY_MISMATCH);
  if (
    extracted.migration_reconciliation_state !== "reconciled"
    || extracted.pending_migration_count !== 0
    || extracted.schema_applied_untracked_count !== 0
    || extracted.unresolved_migration_count !== 0
    || !extracted.migration_ledger_reconciled
  ) return applyFailure(summary, FAILURE_CODES.MIGRATION_LEDGER_NOT_RECONCILED);
  if (!extracted.release_ready) {
    return applyFailure(summary, FAILURE_CODES.RELEASE_NOT_READY);
  }
  summary.outcome = "passed";
  return null;
}

function chooseAttemptFailure(endpointFailures, health, version) {
  const transportFailure = endpointFailures.find((code) => [
    FAILURE_CODES.NETWORK_ERROR,
    FAILURE_CODES.REQUEST_TIMEOUT,
    FAILURE_CODES.INVALID_JSON,
    FAILURE_CODES.HTTP_STATUS_MISMATCH,
    FAILURE_CODES.PUBLIC_SURFACE_UNAVAILABLE,
  ].includes(code));
  if (transportFailure) return transportFailure;
  if (
    (health?.commit_sha && version?.commit_sha && health.commit_sha !== version.commit_sha)
    || (health?.environment && version?.environment && health.environment !== version.environment)
    || (
      health?.schema_compatibility_version
      && version?.schema_compatibility_version
      && health.schema_compatibility_version !== version.schema_compatibility_version
    )
  ) return FAILURE_CODES.HEALTH_VERSION_IDENTITY_MISMATCH;
  return endpointFailures.find(Boolean) ?? null;
}

export async function checkAttempt(options, attemptNumber) {
  const attemptStarted = Date.now();
  const startedAt = new Date().toISOString();

  const requests = [
    fetchConsumed(
      new URL("/api/health", options.targetOrigin),
      "/api/health",
      true,
      options.requestTimeoutMs,
    ),
    fetchConsumed(
      new URL("/api/version", options.targetOrigin),
      "/api/version",
      true,
      options.requestTimeoutMs,
    ),
    ...PUBLIC_PATHS.map((path) => fetchConsumed(
      new URL(path, options.targetOrigin),
      path,
      false,
      options.requestTimeoutMs,
    )),
  ];
  const [healthResult, versionResult, ...publicResults] = await Promise.all(requests);

  const endpoints = [
    healthResult.summary,
    versionResult.summary,
    ...publicResults.map((result) => result.summary),
  ];
  const endpointFailures = [];

  const health = extractHealth(healthResult.body);
  if (health) healthResult.summary.release = health;
  const version = extractVersion(versionResult.body);
  if (version) versionResult.summary.release = version;

  endpointFailures.push(
    validateHealth(
      healthResult.summary,
      health,
      options.expectedCommit,
      options.expectedEnvironment,
    ),
    validateVersion(
      versionResult.summary,
      version,
      options.expectedCommit,
      options.expectedEnvironment,
    ),
  );

  for (const result of publicResults) {
    if (result.summary.failure_code) {
      endpointFailures.push(result.summary.failure_code);
    } else if (result.summary.status < 200 || result.summary.status >= 300) {
      endpointFailures.push(applyFailure(result.summary, FAILURE_CODES.PUBLIC_SURFACE_UNAVAILABLE));
    } else {
      result.summary.outcome = "passed";
    }
  }

  const failureCode = chooseAttemptFailure(endpointFailures, health, version);
  return {
    attempt: attemptNumber,
    started_at: startedAt,
    duration_ms: Date.now() - attemptStarted,
    outcome: failureCode ? "failed" : "passed",
    failure_code: failureCode,
    endpoints,
  };
}

function writeEvidence(output, evidence) {
  if (!output) return;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function sleep(milliseconds) {
  return milliseconds > 0 ? new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)) : Promise.resolve();
}

export async function runSynthetic(options) {
  const startedAtMs = Date.now();
  const attempts = [];
  let finalFailureCode = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const result = await checkAttempt(options, attempt);
    attempts.push(result);
    finalFailureCode = result.failure_code;
    if (result.outcome === "passed") break;
    if (attempt < options.maxAttempts) await sleep(options.retryDelayMs);
  }

  const passed = attempts.at(-1)?.outcome === "passed";
  const evidence = {
    schema_version: "pcs5a-production-deployment-convergence-v1",
    checked_at: new Date().toISOString(),
    target_origin: options.targetOrigin,
    expected_commit: options.expectedCommit,
    expected_environment: options.expectedEnvironment,
    max_attempts: options.maxAttempts,
    retry_delay_ms: options.retryDelayMs,
    attempt_count: attempts.length,
    convergence_duration_ms: Date.now() - startedAtMs,
    outcome: passed ? "passed" : "failed",
    final_failure_code: passed ? null : finalFailureCode,
    attempts,
  };
  writeEvidence(options.output, evidence);
  return { passed, evidence };
}

function rawOutput(argv, environment) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") return argv[index + 1] ?? null;
  }
  return environment.PLAIVRA_UPTIME_OUTPUT ?? null;
}

function invalidInputEvidence() {
  return {
    schema_version: "pcs5a-production-deployment-convergence-v1",
    checked_at: new Date().toISOString(),
    target_origin: null,
    expected_commit: null,
    expected_environment: null,
    max_attempts: null,
    retry_delay_ms: null,
    attempt_count: 0,
    convergence_duration_ms: 0,
    outcome: "failed",
    final_failure_code: FAILURE_CODES.INVALID_INPUT,
    attempts: [],
  };
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  let options;
  try {
    options = parseOptions(argv, environment);
  } catch {
    const output = rawOutput(argv, environment);
    if (typeof output === "string" && output.length > 0 && output.length <= 4096) {
      writeEvidence(resolve(output), invalidInputEvidence());
    }
    process.stderr.write(`${FAILURE_CODES.INVALID_INPUT}\n`);
    return 1;
  }

  const result = await runSynthetic(options);
  process.stdout.write(`${result.passed ? "PRODUCTION_DEPLOYMENT_CONVERGED" : result.evidence.final_failure_code}\n`);
  return result.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
