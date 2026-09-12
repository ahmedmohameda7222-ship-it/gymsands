import type { PortableExportProfile } from "./export-contract";
import {
  evaluateRecoveryEligibility,
  type RecoveryEligibilityResult,
} from "./recovery-eligibility";

const SHA256 = /^[0-9a-f]{64}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;

function requireSha(value: string, regex: RegExp, label: string): void {
  if (typeof value !== "string" || !regex.test(value)) throw new Error(`${label} is malformed.`);
}

export type LinkedRestoreEvidence = {
  headSha: string;
  profile: PortableExportProfile;
  artifactSemanticRootSha256: string;
  snapshotBoundarySha256: string;
  restoredTargetIdentitySha256: string;
  artifactValid: boolean;
  restoreVerified: boolean;
  trusted: boolean;
  failures: readonly string[];
  unknown: readonly string[];
};

export type LinkedProtectedEvidence = {
  artifactSemanticRootSha256: string;
  restoredTargetIdentitySha256: string;
  verified: boolean;
};

export type LinkedSearchEvidence = {
  headSha: string;
  artifactSemanticRootSha256: string;
  snapshotBoundarySha256: string;
  restoredTargetIdentitySha256: string;
  sameRestoredTargetVerified: boolean;
  rebuildVerified: boolean;
  goldenSearchVerified: boolean;
  staleGenerationIsolationVerified: boolean;
};

export type RecoveryEvaluationContext = Readonly<{
  capturedAt: string;
  evaluationTime: string;
  maxArtifactAgeMs?: number;
}>;

export type FinalRestoreCertificationInput = {
  profile: PortableExportProfile;
  headSha: string;
  artifactSemanticRootSha256: string;
  snapshotBoundarySha256: string;
  restoredTargetIdentitySha256: string;
  canonicalProfileVerified: boolean;
  recoveryEvaluation?: RecoveryEvaluationContext;
  restore: LinkedRestoreEvidence;
  protected: LinkedProtectedEvidence;
  search: LinkedSearchEvidence;
};

export type FinalRestoreCertification = Readonly<{
  certificationVersion: 1;
  profile: PortableExportProfile;
  headSha: string;
  artifactSemanticRootSha256: string;
  snapshotBoundarySha256: string;
  restoredTargetIdentitySha256: string;
  linkedEvidenceVerified: true;
  canonicalProfileVerified: true;
  restoreVerified: true;
  trusted: true;
  protectedSegmentsVerified: boolean;
  searchVerified: true;
  recoveryEligibility: RecoveryEligibilityResult | null;
  recoveryEligible: boolean;
  drReady: boolean;
}>;

export function certifyFoodCatalogRestore(input: FinalRestoreCertificationInput): FinalRestoreCertification {
  requireSha(input.headSha, SHA40, "head SHA");
  requireSha(input.artifactSemanticRootSha256, SHA256, "artifact semantic root");
  requireSha(input.snapshotBoundarySha256, SHA256, "snapshot-boundary SHA");
  requireSha(input.restoredTargetIdentitySha256, SHA256, "restored target identity SHA");
  if (!input.canonicalProfileVerified) throw new Error("Canonical profile completeness is required for final certification.");

  const restore = input.restore;
  const search = input.search;
  const protectedEvidence = input.protected;
  const links = [
    [restore.headSha, input.headSha, "restore head SHA"],
    [restore.profile, input.profile, "restore profile"],
    [restore.artifactSemanticRootSha256, input.artifactSemanticRootSha256, "restore semantic root"],
    [restore.snapshotBoundarySha256, input.snapshotBoundarySha256, "restore snapshot boundary"],
    [restore.restoredTargetIdentitySha256, input.restoredTargetIdentitySha256, "restore target identity"],
    [search.headSha, input.headSha, "search head SHA"],
    [search.artifactSemanticRootSha256, input.artifactSemanticRootSha256, "search semantic root"],
    [search.snapshotBoundarySha256, input.snapshotBoundarySha256, "search snapshot boundary"],
    [search.restoredTargetIdentitySha256, input.restoredTargetIdentitySha256, "search target identity"],
    [protectedEvidence.artifactSemanticRootSha256, input.artifactSemanticRootSha256, "protected semantic root"],
    [protectedEvidence.restoredTargetIdentitySha256, input.restoredTargetIdentitySha256, "protected target identity"],
  ] as const;
  for (const [actual, expected, label] of links) {
    if (actual !== expected) throw new Error(`Linked Plan 7 evidence mismatch: ${label}.`);
  }

  if (!restore.artifactValid || !restore.restoreVerified || !restore.trusted || restore.failures.length || restore.unknown.length) {
    throw new Error("Final certification requires a trusted verified restore with no failed or UNKNOWN mandatory assertions.");
  }
  if (!search.sameRestoredTargetVerified || !search.rebuildVerified || !search.goldenSearchVerified || !search.staleGenerationIsolationVerified) {
    throw new Error("Final certification requires verified search rebuild/golden/stale-generation evidence from the same restored target.");
  }
  if (input.profile === "FULL_DR" && !protectedEvidence.verified) {
    throw new Error("FULL_DR final certification requires authenticated protected-segment verification.");
  }

  const recoveryEligibility = input.recoveryEvaluation
    ? evaluateRecoveryEligibility({
        artifactValid: restore.artifactValid,
        capturedAt: input.recoveryEvaluation.capturedAt,
        evaluationTime: input.recoveryEvaluation.evaluationTime,
        maxArtifactAgeMs: input.recoveryEvaluation.maxArtifactAgeMs,
      })
    : null;
  const recoveryEligible = recoveryEligibility?.eligible === true;
  if (input.profile === "FULL_DR" && !recoveryEligible) {
    throw new Error("FULL_DR final certification requires canonical recovery/RPO eligibility.");
  }

  return Object.freeze({
    certificationVersion: 1,
    profile: input.profile,
    headSha: input.headSha,
    artifactSemanticRootSha256: input.artifactSemanticRootSha256,
    snapshotBoundarySha256: input.snapshotBoundarySha256,
    restoredTargetIdentitySha256: input.restoredTargetIdentitySha256,
    linkedEvidenceVerified: true,
    canonicalProfileVerified: true,
    restoreVerified: true,
    trusted: true,
    protectedSegmentsVerified: input.profile === "FULL_DR" ? true : false,
    searchVerified: true,
    recoveryEligibility,
    recoveryEligible,
    drReady: input.profile === "FULL_DR" && recoveryEligible,
  });
}
