import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFoodCatalogSecurityEvidenceSql,
  evaluateFoodCatalogSecurityEvidence,
} from "./capture-food-catalog-security-evidence.mjs";

test("security evidence SQL preserves canonical pg_policies predicate aliases and owner metadata including My Foods", () => {
  const sql = buildFoodCatalogSecurityEvidenceSql();

  assert.match(sql, /coalesce\(qual,''\)\s+AS\s+qual/i);
  assert.match(sql, /coalesce\(with_check,''\)\s+AS\s+with_check/i);
  assert.match(sql, /'qual',qual,'withCheck',with_check/);
  assert.match(sql, /user_food_favorites/);
  assert.match(sql, /'user_food_items'/);
});

function completeObserved() {
  return {
    relations: [
      { name: "food_catalog_search_documents", rls: true, forceRls: false, acl: "" },
      { name: "user_food_favorites", rls: true, forceRls: false, acl: "" },
      { name: "user_food_items", rls: true, forceRls: false, acl: "" },
    ],
    policies: [
      { table: "food_favorites", name: "food_favorites_select_own" },
      { table: "user_food_favorites", name: "user_food_favorites_own_all" },
      { table: "user_food_items", name: "user_food_items_own_all" },
    ],
    privileges: [
      { table: "food_favorites", grantee: "authenticated", privilege: "SELECT" },
      { table: "user_food_items", grantee: "authenticated", privilege: "SELECT" },
    ],
    critical: {
      searchDocumentsRls: true,
      searchDocumentsMutationIsolated: true,
      rebuildServiceOnly: true,
      searchMemberBoundary: true,
      currentGenerationServiceMutationDenied: true,
      governanceDirectMemberMutationDenied: true,
      personalOverrideDirectMutationDenied: true,
    },
    behavioral: {
      ownerScopedReadVerified: true,
      wrongOwnerReadDenied: true,
      ownMutationAllowed: true,
      wrongOwnerMutationDenied: true,
      transitionalOwnerScopedReadVerified: true,
      transitionalWrongOwnerReadDenied: true,
      transitionalOwnMutationAllowed: true,
      transitionalWrongOwnerMutationDenied: true,
      myFoodsOwnerScopedReadVerified: true,
      myFoodsWrongOwnerReadDenied: true,
      myFoodsOwnerInsertUpdateDeleteVerified: true,
      myFoodsWrongOwnerMutationDenied: true,
      personalizedSearchIsolationVerified: true,
      authenticatedServiceOnlyDenied: true,
      anonUnauthorizedVerified: true,
      serviceOutboxAuthorizedVerified: true,
    },
    schemaIdentityAdversarial: {
      userFoodItemsDriftDetected: true,
      privateFoodCatalogAclDriftDetected: true,
      searchNormalizationHelperDriftDetected: true,
      rollbackVerified: true,
    },
  };
}

test("security evidence summary fails closed when a critical boundary is false", () => {
  const observed = completeObserved();
  observed.critical.personalOverrideDirectMutationDenied = false;
  assert.throws(() => evaluateFoodCatalogSecurityEvidence(observed), /personalOverrideDirectMutationDenied/);
});

test("security evidence requires current, transitional, and My Foods behavioral owner isolation", () => {
  const observed = completeObserved();
  const summary = evaluateFoodCatalogSecurityEvidence(observed);
  assert.equal(summary.criticalBoundariesVerified, true);
  assert.equal(summary.behavioralBoundariesVerified, true);

  for (const field of [
    "wrongOwnerReadDenied",
    "transitionalWrongOwnerReadDenied",
    "transitionalWrongOwnerMutationDenied",
    "myFoodsOwnerScopedReadVerified",
    "myFoodsWrongOwnerReadDenied",
    "myFoodsOwnerInsertUpdateDeleteVerified",
    "myFoodsWrongOwnerMutationDenied",
  ]) {
    const leak = structuredClone(observed);
    leak.behavioral[field] = false;
    assert.throws(() => evaluateFoodCatalogSecurityEvidence(leak), new RegExp(`${field}|behavioral`, "i"));
  }
});

test("security evidence fails closed without actual anon, authenticated service-only, and positive service execution proof", () => {
  for (const field of ["authenticatedServiceOnlyDenied", "anonUnauthorizedVerified", "serviceOutboxAuthorizedVerified"]) {
    const missing = completeObserved();
    delete missing.behavioral[field];
    assert.throws(() => evaluateFoodCatalogSecurityEvidence(missing), new RegExp(`${field}|behavioral`, "i"));
  }
});

test("security certification fails closed without adversarial schema identity drift detection", () => {
  for (const field of ["userFoodItemsDriftDetected", "privateFoodCatalogAclDriftDetected", "searchNormalizationHelperDriftDetected", "rollbackVerified"]) {
    const missing = completeObserved();
    missing.schemaIdentityAdversarial[field] = false;
    assert.throws(() => evaluateFoodCatalogSecurityEvidence(missing), new RegExp(`${field}|schema identity|adversarial`, "i"));
  }
});
