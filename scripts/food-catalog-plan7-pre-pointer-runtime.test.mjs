import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sha256Canonical } from "../lib/food-catalog/canonical-hash.ts";
import {
  buildGenerationValidationReportSemanticPayload,
  computeGenerationValidationReportChecksum,
} from "../lib/food-catalog/generation-validation-report.ts";

test("shared generation validation report checksum preserves Plan 3 semantic payload compatibility", () => {
  const report = {
    generationId: "71000000-0000-4000-8000-000000000901",
    generationChecksumSha256: "a".repeat(64),
    validatorSetVersion: "food-catalog-generation-validator-set-v1",
    policyVersion: "plan7-fixture-v1",
    blockerCount: 0,
    errorCount: 0,
    warningCount: 1,
    infoCount: 0,
    findings: [{
      id: "71000000-0000-4000-8000-0000000009f2",
      findingOrdinal: 1,
      reasonCode: "PLAN7_COMPATIBILITY_WARNING",
      foodId: "71000000-0000-4000-8000-000000000101",
      severity: "warning",
      blocking: false,
      evidenceReference: "fixture://plan7/checksum-compatibility",
      validatorPolicyVersion: "food-catalog-generation-validator-set-v1",
      details: { beta: 2, alpha: 1 },
    }],
    verificationStates: [{
      foodId: "71000000-0000-4000-8000-000000000101",
      scope: "identity",
      assertionId: "71000000-0000-4000-8000-000000000701",
      state: "current",
    }],
  };
  const legacyPayload = {
    generationId: report.generationId,
    generationChecksumSha256: report.generationChecksumSha256,
    validatorSetVersion: report.validatorSetVersion,
    policyVersion: report.policyVersion,
    blockerCount: report.blockerCount,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    findings: report.findings.map(({ id: _id, ...finding }) => finding),
    verificationStates: report.verificationStates,
  };

  assert.deepEqual(buildGenerationValidationReportSemanticPayload(report), legacyPayload);
  assert.equal(computeGenerationValidationReportChecksum(report), sha256Canonical(legacyPayload));
  assert.equal(
    computeGenerationValidationReportChecksum({
      ...report,
      findings: report.findings.map((finding) => ({
        ...finding,
        id: "71000000-0000-4000-8000-0000000009f3",
      })),
    }),
    computeGenerationValidationReportChecksum(report),
  );
});

test("integrated FULL_DR runs the canonical Plan3-strength pre-pointer adversarial matrix", () => {
  const workflow = readFileSync(".github/workflows/food-catalog-plan7-integrated-full-dr.yml", "utf8");
  const step = workflow.match(/- name: Prove Plan 3-strength pre-pointer corruption blocks activation[\s\S]*?- name: Capture source RLS ACL identity/)?.[0] ?? "";
  const adversarial = readFileSync("scripts/verify-food-catalog-plan7-pre-pointer-adversarial.mjs", "utf8");
  const runtime = readFileSync("lib/food-catalog/portability/pre-pointer-generation-runtime.mjs", "utf8");

  assert.match(step, /verify-food-catalog-plan7-pre-pointer-adversarial\.mjs/);
  assert.match(step, /preRestorePointerUnchangedAcrossFailures/);
  assert.match(step, /finalSourcePointerRestored/);
  for (const corruptionCase of [
    "composition",
    "verification-selection",
    "activation-authority",
    "report-checksum-linkage",
    "blocking-finding",
  ]) assert.match(step, new RegExp(corruptionCase));

  assert.match(adversarial, /verifyCanonicalPrePointerGeneration/);
  assert.match(adversarial, /GENERATION_CHECKSUM_MISMATCH|recomputed checksum/);
  assert.match(adversarial, /INVALID_VERIFICATION_SELECTION/);
  assert.match(adversarial, /ACTIVE_FOOD_MISSING_ACTIVATION_GRANT/);
  assert.match(adversarial, /validation report linkage|generation_checksum|authority/i);
  assert.match(adversarial, /name: "report-semantic-checksum"/);
  assert.match(adversarial, /report_checksum_sha256/);
  assert.match(adversarial, /reportSemanticChecksumCase/);
  assert.match(adversarial, /stored validation findings contain blockers|blocker/i);
  assert.match(adversarial, /assertPointer\(databaseUrl, preRestorePointer/);

  assert.match(runtime, /computeGenerationValidationReportChecksum/);
  assert.match(runtime, /food_catalog_generation_validation_reports/);
  assert.match(runtime, /food_catalog_generation_validation_findings/);
  assert.match(runtime, /ORDER BY f\.finding_ordinal/);
  assert.match(runtime, /validation report semantic checksum mismatch before pointer restore/i);
  assert.match(runtime, /verificationStates: semantic\.verificationStates/);
});
