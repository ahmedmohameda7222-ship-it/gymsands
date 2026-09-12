import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("integrated FULL_DR proves semantic corruption blocks current-generation pointer activation", () => {
  const workflow = readFileSync(".github/workflows/food-catalog-plan7-integrated-full-dr.yml", "utf8");
  const step = workflow.match(/- name: Prove pre-pointer semantic corruption blocks activation[\s\S]*?- name: Capture source RLS ACL identity/)?.[0] ?? "";

  assert.match(step, /buildPrePointerVerificationSql/);
  assert.match(step, /71000000-0000-4000-8000-000000000903/);
  assert.match(step, /71000000-0000-4000-8000-000000000911/);
  assert.match(step, /71000000-0000-4000-8000-000000000921/);
  assert.match(step, /validation report\/checksum\/blocker gate failed/);
  assert.match(step, /current_generation_id='71000000-0000-4000-8000-000000000901'/);
});
