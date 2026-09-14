import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("integrated FULL_DR runs the canonical Plan3-strength pre-pointer adversarial matrix", () => {
  const workflow = readFileSync(".github/workflows/food-catalog-plan7-integrated-full-dr.yml", "utf8");
  const step = workflow.match(/- name: Prove Plan 3-strength pre-pointer corruption blocks activation[\s\S]*?- name: Capture source RLS ACL identity/)?.[0] ?? "";
  const adversarial = readFileSync("scripts/verify-food-catalog-plan7-pre-pointer-adversarial.mjs", "utf8");

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
  assert.match(adversarial, /stored validation findings contain blockers|blocker/i);
  assert.match(adversarial, /assertPointer\(databaseUrl, preRestorePointer/);
});
