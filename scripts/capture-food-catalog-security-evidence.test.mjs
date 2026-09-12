import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFoodCatalogSecurityEvidenceSql,
  evaluateFoodCatalogSecurityEvidence,
} from "./capture-food-catalog-security-evidence.mjs";

test("security evidence SQL preserves canonical pg_policies predicate aliases", () => {
  const sql = buildFoodCatalogSecurityEvidenceSql();

  assert.match(sql, /coalesce\(qual,''\)\s+AS\s+qual/i);
  assert.match(sql, /coalesce\(with_check,''\)\s+AS\s+with_check/i);
  assert.match(sql, /'qual',qual,'withCheck',with_check/);
});

function completeObserved() {
  return {
    relations: [{ name: "food_catalog_search_documents", rls: true, forceRls: false, acl: "" }],
    policies: [{ table: "food_favorites", name: "food_favorites_select_own" }],
    privileges: [{ table: "food_favorites", grantee: "authenticated", privilege: "SELECT" }],
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
      personalizedSearchIsolationVerified: true,
      authenticatedServiceOnlyDenied: true,
      anonUnauthorizedVerified: true,
      serviceOutboxAuthorizedVerified: true,
    },
  };
}

test("security evidence summary fails closed when a critical boundary is false", () => {
  const observed = completeObserved();
  observed.critical.personalOverrideDirectMutationDenied = false;
  assert.throws(() => evaluateFoodCatalogSecurityEvidence(observed), /personalOverrideDirectMutationDenied/);
});

test("security evidence requires behavioral owner isolation in addition to matching metadata", () => {
  const observed = completeObserved();
  const summary = evaluateFoodCatalogSecurityEvidence(observed);
  assert.equal(summary.criticalBoundariesVerified, true);
  assert.equal(summary.behavioralBoundariesVerified, true);

  const wrongOwnerLeak = structuredClone(observed);
  wrongOwnerLeak.behavioral.wrongOwnerReadDenied = false;
  assert.throws(() => evaluateFoodCatalogSecurityEvidence(wrongOwnerLeak), /wrongOwnerReadDenied|behavioral/i);
});

test("security evidence fails closed without actual anon, authenticated service-only, and positive service execution proof", () => {
  for (const field of ["authenticatedServiceOnlyDenied", "anonUnauthorizedVerified", "serviceOutboxAuthorizedVerified"]) {
    const missing = completeObserved();
    delete missing.behavioral[field];
    assert.throws(() => evaluateFoodCatalogSecurityEvidence(missing), new RegExp(`${field}|behavioral`, "i"));
  }
});
