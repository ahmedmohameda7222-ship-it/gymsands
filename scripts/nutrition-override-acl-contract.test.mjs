import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNutritionOverrideAuthenticatedAcl,
  REQUIRED_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES
} from "./nutrition-override-acl-contract.mjs";

test("accepts exactly the intended authenticated CRUD ACL", () => {
  const result = evaluateNutritionOverrideAuthenticatedAcl(
    REQUIRED_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES
  );
  assert.equal(result.exact, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.excess, []);
  assert.deepEqual(result.forbidden, []);
});

test("rejects a missing required CRUD privilege", () => {
  const result = evaluateNutritionOverrideAuthenticatedAcl(["SELECT", "INSERT", "DELETE"]);
  assert.equal(result.exact, false);
  assert.deepEqual(result.missing, ["UPDATE"]);
});

for (const privilege of ["TRUNCATE", "TRIGGER", "REFERENCES", "MAINTAIN"]) {
  test(`rejects extra ${privilege}`, () => {
    const result = evaluateNutritionOverrideAuthenticatedAcl([
      ...REQUIRED_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES,
      privilege
    ]);
    assert.equal(result.exact, false);
    assert.deepEqual(result.forbidden, [privilege]);
    assert.ok(result.excess.includes(privilege));
  });
}

test("normalizes duplicates and case without weakening exactness", () => {
  const result = evaluateNutritionOverrideAuthenticatedAcl([
    "select",
    "INSERT",
    "update",
    "delete",
    "SELECT"
  ]);
  assert.equal(result.exact, true);
});
