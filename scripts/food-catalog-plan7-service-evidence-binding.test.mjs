import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeRestoredTargetIdentitySha256,
  evaluateRestoredServiceAuthorityEvidence,
} from "./verify-food-catalog-integrated-restore.mjs";

const sha = (value) => value.repeat(64);
const expected = Object.freeze({
  headSha: "a".repeat(40),
  artifactSemanticRootSha256: sha("b"),
  snapshotBoundarySha256: sha("c"),
  migrationLedgerIdentity: sha("d"),
  schemaFingerprintSha256: sha("e"),
});

function evidence(overrides = {}) {
  return {
    format: "plaivra-food-catalog-restored-service-authority-evidence",
    version: 4,
    headSha: expected.headSha,
    artifactSemanticRootSha256: expected.artifactSemanticRootSha256,
    snapshotBoundarySha256: expected.snapshotBoundarySha256,
    targetMigrationLedgerIdentity: expected.migrationLedgerIdentity,
    targetSchemaFingerprintSha256: expected.schemaFingerprintSha256,
    sourceServiceIdentityRejected: true,
    authenticatedClaimRejected: true,
    randomServiceIdentityRejected: true,
    principalHistoryPreserved: true,
    capabilityHistoryPreserved: true,
    outboxPendingUnclaimed: true,
    serviceExecutionBindingUnavailable: true,
    automaticDeliveryObserved: false,
    ...overrides,
  };
}

test("restored Service authority evidence is bound to the exact head, artifact snapshot and current target profile", () => {
  const verified = evaluateRestoredServiceAuthorityEvidence(evidence(), expected);
  assert.equal(verified.verified, true);
  assert.match(verified.serviceAuthorityEvidenceSha256, /^[0-9a-f]{64}$/);

  assert.throws(() => evaluateRestoredServiceAuthorityEvidence(evidence({ headSha: "f".repeat(40) }), expected), /head|binding|service/i);
  assert.throws(() => evaluateRestoredServiceAuthorityEvidence(evidence({ artifactSemanticRootSha256: sha("f") }), expected), /artifact|binding|service/i);
  assert.throws(() => evaluateRestoredServiceAuthorityEvidence(evidence({ snapshotBoundarySha256: sha("f") }), expected), /snapshot|binding|service/i);
  assert.throws(() => evaluateRestoredServiceAuthorityEvidence(evidence({ targetMigrationLedgerIdentity: sha("f") }), expected), /migration|target|binding|service/i);
  assert.throws(() => evaluateRestoredServiceAuthorityEvidence(evidence({ targetSchemaFingerprintSha256: sha("f") }), expected), /schema|target|binding|service/i);
});

test("restored target identity is cryptographically sensitive to the bound Service-authority proof", () => {
  const common = {
    migrationLedgerIdentity: sha("1"),
    schemaFingerprintSha256: sha("2"),
    securityRlsAclIdentitySha256: sha("3"),
    ownerBindingSha256: sha("4"),
  };
  const first = computeRestoredTargetIdentitySha256({ ...common, serviceAuthorityEvidenceSha256: sha("5") });
  const second = computeRestoredTargetIdentitySha256({ ...common, serviceAuthorityEvidenceSha256: sha("6") });
  assert.notEqual(first, second);
});
