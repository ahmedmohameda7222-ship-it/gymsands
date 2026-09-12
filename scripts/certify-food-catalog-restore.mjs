#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { certifyFoodCatalogRestore } from "../lib/food-catalog/portability/final-certification.ts";
import { validateCanonicalPortableProfileManifestV1 } from "../lib/food-catalog/portability/profile-certification.ts";

const SHA40 = /^[0-9a-f]{40}$/u;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const nextValue = argv[++index];
      if (!nextValue) throw new Error(`${value} requires a value.`);
      return nextValue;
    };
    if (value === "--manifest") options.manifestPath = next();
    else if (value === "--restore-report") options.restoreReportPath = next();
    else if (value === "--integrated-evidence") options.integratedEvidencePath = next();
    else if (value === "--expected-head") options.expectedHead = next();
    else if (value === "--output") options.output = next();
    else throw new Error(`Unknown final certification argument ${value}.`);
  }
  for (const field of ["manifestPath","restoreReportPath","integratedEvidencePath","expectedHead","output"]) {
    if (!options[field]) throw new Error(`Missing required final certification option ${field}.`);
  }
  if (!SHA40.test(options.expectedHead)) throw new Error("Final certification expected head must be an exact commit SHA.");
  return options;
}

export function buildFinalCertificationInput({ manifest, restoreReport, integratedEvidence, expectedHead }) {
  validateCanonicalPortableProfileManifestV1(manifest);
  if (manifest.sourceRepositoryCommit !== expectedHead) throw new Error("Canonical artifact was not produced from the exact certification head.");
  if (restoreReport.headSha !== expectedHead || integratedEvidence.headSha !== expectedHead) throw new Error("Final certification evidence head SHA mismatch.");
  if (restoreReport.profile !== manifest.profile || integratedEvidence.profile !== manifest.profile) throw new Error("Final certification profile mismatch.");
  if (restoreReport.artifact?.semanticRootSha256 !== manifest.semanticRootSha256
      || integratedEvidence.artifactSemanticRootSha256 !== manifest.semanticRootSha256) {
    throw new Error("Final certification artifact semantic-root linkage failed.");
  }
  if (restoreReport.artifact?.snapshotBoundarySha256 !== manifest.snapshotBoundary.sha256
      || integratedEvidence.snapshotBoundarySha256 !== manifest.snapshotBoundary.sha256) {
    throw new Error("Final certification snapshot-boundary linkage failed.");
  }
  const targetIdentity = integratedEvidence.restoredTargetIdentitySha256;
  if (restoreReport.target?.restoredTargetIdentitySha256 !== targetIdentity) throw new Error("Final certification restored-target identity linkage failed.");

  const canonicalRecovery = restoreReport.recoveryEligibility;
  const recoveryEvaluation = canonicalRecovery && typeof canonicalRecovery.evaluationTime === "string"
    ? {
        capturedAt: manifest.capturedAt,
        evaluationTime: canonicalRecovery.evaluationTime,
        ...(canonicalRecovery.maxArtifactAgeMs === null || canonicalRecovery.maxArtifactAgeMs === undefined
          ? {}
          : { maxArtifactAgeMs: canonicalRecovery.maxArtifactAgeMs }),
      }
    : undefined;

  return {
    profile: manifest.profile,
    headSha: expectedHead,
    artifactSemanticRootSha256: manifest.semanticRootSha256,
    snapshotBoundarySha256: manifest.snapshotBoundary.sha256,
    restoredTargetIdentitySha256: targetIdentity,
    canonicalProfileVerified: true,
    recoveryEvaluation,
    restore: {
      headSha: restoreReport.headSha,
      profile: restoreReport.profile,
      artifactSemanticRootSha256: restoreReport.artifact.semanticRootSha256,
      snapshotBoundarySha256: restoreReport.artifact.snapshotBoundarySha256,
      restoredTargetIdentitySha256: restoreReport.target.restoredTargetIdentitySha256,
      artifactValid: restoreReport.artifact.valid === true,
      restoreVerified: restoreReport.restoreVerified === true,
      trusted: restoreReport.trusted === true,
      failures: restoreReport.assertions?.failures ?? [],
      unknown: restoreReport.assertions?.unknown ?? [],
    },
    protected: {
      artifactSemanticRootSha256: integratedEvidence.artifactSemanticRootSha256,
      restoredTargetIdentitySha256: targetIdentity,
      verified: integratedEvidence.protectedSegmentsVerified === true,
    },
    search: {
      headSha: integratedEvidence.headSha,
      artifactSemanticRootSha256: integratedEvidence.artifactSemanticRootSha256,
      snapshotBoundarySha256: integratedEvidence.snapshotBoundarySha256,
      restoredTargetIdentitySha256: targetIdentity,
      sameRestoredTargetVerified: integratedEvidence.search?.sameRestoredTargetVerified === true,
      rebuildVerified: integratedEvidence.search?.rebuildVerified === true,
      goldenSearchVerified: integratedEvidence.search?.goldenSearchVerified === true,
      staleGenerationIsolationVerified: integratedEvidence.search?.staleGenerationIsolationVerified === true,
    },
  };
}

export async function certifyFromFiles(options) {
  const [manifest, restoreReport, integratedEvidence] = await Promise.all([
    readFile(resolve(options.manifestPath), "utf8").then(JSON.parse),
    readFile(resolve(options.restoreReportPath), "utf8").then(JSON.parse),
    readFile(resolve(options.integratedEvidencePath), "utf8").then(JSON.parse),
  ]);
  const certification = certifyFoodCatalogRestore(buildFinalCertificationInput({
    manifest,
    restoreReport,
    integratedEvidence,
    expectedHead: options.expectedHead,
  }));
  if (certification.profile === "FULL_DR" && certification.drReady !== true) {
    throw new Error("FULL_DR final certification did not reach DR readiness.");
  }
  await writeFile(resolve(options.output), `${JSON.stringify(certification, null, 2)}\n`, "utf8");
  return certification;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const certification = await certifyFromFiles(options);
  process.stdout.write(`${JSON.stringify(certification)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
