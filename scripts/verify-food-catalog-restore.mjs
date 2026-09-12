#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateRestoreAssertions } from "../lib/food-catalog/portability/restore-assertions.ts";
import { evaluateRecoveryEligibility } from "../lib/food-catalog/portability/recovery-eligibility.ts";

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
}

function assertTarget(target) {
  if (!target?.disposableTargetVerified) throw new Error("Disposable target verification is required.");
  if (target.postgresMajor !== 17 || typeof target.postgresVersion !== "string" || !target.postgresVersion.startsWith("17.")) {
    throw new Error("Target must be a tested PostgreSQL 17.x instance.");
  }
  const extensions = new Set(target.extensions ?? []);
  for (const required of ["pgcrypto", "pg_trgm", "uuid-ossp"]) {
    if (!extensions.has(required)) throw new Error(`Target is missing required extension ${required}.`);
  }
  if (!target.authRlsCompatibilityVerified) throw new Error("Target auth/RLS compatibility evidence is required.");
  requireSha256(target.migrationLedgerIdentity, "migrationLedgerIdentity");
  requireSha256(target.schemaFingerprintSha256, "schemaFingerprintSha256");
  if (target.securityRlsAclIdentitySha256 !== undefined) {
    requireSha256(target.securityRlsAclIdentitySha256, "securityRlsAclIdentitySha256");
  }
  if (target.restoredTargetIdentitySha256 !== undefined) {
    requireSha256(target.restoredTargetIdentitySha256, "restoredTargetIdentitySha256");
  }
}

export function buildFoodCatalogRestoreVerificationReportV1(input) {
  if (!input || (input.profile !== "CORE_PORTABLE" && input.profile !== "FULL_DR")) {
    throw new Error("Unsupported Food Catalog restore verification profile.");
  }
  requireSha256(input.artifact?.semanticRootSha256, "semanticRootSha256");
  requireSha256(input.artifact?.snapshotBoundarySha256, "snapshotBoundarySha256");
  if (typeof input.artifact?.capturedAt !== "string" || !Number.isFinite(Date.parse(input.artifact.capturedAt))) {
    throw new Error("Artifact capturedAt evidence is required.");
  }
  if (typeof input.recoveryEvaluation?.evaluationTime !== "string") {
    throw new Error("Explicit recovery evaluationTime is required.");
  }
  assertTarget(input.target);

  if (!Array.isArray(input.assertions?.evidence)) {
    throw new Error("Runtime-derived mandatory restore assertion evidence is required.");
  }
  const evaluation = evaluateRestoreAssertions({
    profile: input.profile,
    artifactValid: input.artifact.valid === true,
    assertions: input.assertions.evidence,
  });
  const recoveryEligibility = evaluateRecoveryEligibility({
    artifactValid: input.artifact.valid === true,
    capturedAt: input.artifact.capturedAt,
    evaluationTime: input.recoveryEvaluation.evaluationTime,
    maxArtifactAgeMs: input.recoveryEvaluation.maxArtifactAgeMs,
  });
  const trusted = evaluation.trusted;
  const restoreVerified = evaluation.restoreVerified;
  const recoveryEligible = recoveryEligibility.eligible;

  return Object.freeze({
    reportVersion: 2,
    profile: input.profile,
    headSha: input.headSha ?? null,
    artifact: Object.freeze({ ...input.artifact }),
    target: Object.freeze({ ...input.target, extensions: Object.freeze([...(input.target.extensions ?? [])]) }),
    assertions: Object.freeze({
      evidence: Object.freeze(input.assertions.evidence.map((entry) => Object.freeze({ ...entry }))),
      trusted: evaluation.trusted,
      restoreVerified: evaluation.restoreVerified,
      failures: Object.freeze([...evaluation.failures]),
      unknown: Object.freeze([...evaluation.unknown]),
      missing: Object.freeze([...evaluation.missing]),
      comparisonClasses: Object.freeze([...evaluation.comparisonClasses]),
    }),
    recoveryEligibility,
    trusted,
    restoreVerified,
    recoveryEligible,
    readyForRecovery: restoreVerified && recoveryEligible,
  });
}

export function assertFoodCatalogRestoreVerificationReady(report) {
  if (!report?.restoreVerified || !report?.trusted) throw new Error("Food Catalog restore verification is not ready/trusted.");
  return true;
}

function parseArguments(argv) {
  let inputPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") {
      inputPath = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!inputPath) throw new Error("--input <verification-input.json> is required.");
  return { inputPath };
}

function main() {
  const { inputPath } = parseArguments(process.argv.slice(2));
  const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  const report = buildFoodCatalogRestoreVerificationReportV1(input);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
