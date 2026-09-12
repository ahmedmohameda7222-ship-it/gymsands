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

test("security evidence summary fails closed when a critical boundary is false", () => {
  assert.throws(
    () => evaluateFoodCatalogSecurityEvidence({
      relations: [{ name: "food_catalog_search_documents", rls: true, forceRls: false, acl: "" }],
      policies: [],
      privileges: [],
      critical: {
        searchDocumentsRls: true,
        searchDocumentsMutationIsolated: true,
        rebuildServiceOnly: true,
        searchMemberBoundary: true,
        currentGenerationServiceMutationDenied: true,
        governanceDirectMemberMutationDenied: true,
        personalOverrideDirectMutationDenied: false,
      },
      behavioral: {
        ownerScopedReadVerified: true,
        wrongOwnerReadDenied: true,
        ownMutationAllowed: true,
        wrongOwnerMutationDenied: true,
        personalizedSearchIsolationVerified: true,
      },
    }),
    /personalOverrideDirectMutationDenied/,
  );
});

test("security evidence requires behavioral owner isolation in addition to matching metadata", () => {
  const observed = {
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
    },
  };
  const summary = evaluateFoodCatalogSecurityEvidence(observed);
  assert.equal(summary.criticalBoundariesVerified, true);
  assert.equal(summary.behavioralBoundariesVerified, true);

  const wrongOwnerLeak = structuredClone(observed);
  wrongOwnerLeak.behavioral.wrongOwnerReadDenied = false;
  assert.throws(() => evaluateFoodCatalogSecurityEvidence(wrongOwnerLeak), /wrongOwnerReadDenied|behavioral/i);
});
