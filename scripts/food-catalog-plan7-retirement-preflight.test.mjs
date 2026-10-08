import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_CATALOG_PROJECT_REF,
  PLAN7_KEEP_OBJECTS,
  PLAN7_RETIREMENT_CANDIDATES,
  PLAIVRA_PROJECT_REF,
  buildPlan7RetirementDiscoverySql,
  evaluatePlan7RetirementPreflight,
} from "./food-catalog-plan7-retirement-preflight.mjs";

const DEPLOYED_SHA = "a182923399a41faf5ca7b79d947a992e94cdd27a";
const LATEST_VERSION = "20261008022805";
const LATEST_NAME = "food_catalog_plan7_owner_reconciliation_expand";
const MARKER = "20260724232734";

function keepEvidence() {
  return Object.fromEntries(PLAN7_KEEP_OBJECTS.map((id) => [id, true]));
}

function cleanCandidate(overrides = {}) {
  return {
    exists: true,
    rowCount: 0,
    databaseFunctionReferences: [],
    databaseViewReferences: [],
    databaseConstraintReferences: [],
    repositoryRuntimeReferences: [],
    liveObservedReferences: [],
    externalDependencyState: "clear",
    liveDependencyState: "clear",
    ...overrides,
  };
}

function baseEvidence() {
  return {
    projectRef: PLAIVRA_PROJECT_REF,
    expectedDeployedCommit: DEPLOYED_SHA,
    expectedLatestMigrationVersion: LATEST_VERSION,
    expectedLatestMigrationName: LATEST_NAME,
    deployment: {
      commitSha: DEPLOYED_SHA,
      environment: "production",
      artifactIdentityValid: true,
      releaseReady: true,
      expectedDatabaseMigrationVersion: MARKER,
    },
    migration: {
      recordCount: 128,
      latestVersion: LATEST_VERSION,
      latestName: LATEST_NAME,
    },
    ledger: {
      reconciliationState: "reconciled",
      pendingCount: 0,
      schemaAppliedUntrackedCount: 0,
      unresolvedCount: 0,
    },
    compatibility: {
      schemaCompatibilityVersion: "2",
      databaseMigrationVersion: MARKER,
    },
    portability: {
      profile: "FULL_DR",
      fresh: true,
      exactHead: DEPLOYED_SHA,
      latestMigrationVersion: LATEST_VERSION,
      drReady: true,
      productionMutationPerformed: false,
    },
    historicalConsumerReferences: {
      verified: true,
      unresolvedCount: 0,
    },
    ownerReconciliation: {
      total: 0,
      blocked: 0,
      retirementSafe: true,
    },
    keepObjects: keepEvidence(),
    candidates: {},
  };
}

test("discovery SQL is read-only and covers migration, compatibility, owner and legacy candidates", () => {
  const sql = buildPlan7RetirementDiscoverySql();
  assert.match(sql, /begin read only;/i);
  assert.match(sql, /rollback;/i);
  assert.match(sql, /supabase_migrations\.schema_migrations/i);
  assert.match(sql, /food_catalog_current_generation/i);
  assert.match(sql, /release_schema_compatibility/i);
  assert.match(sql, /food_aliases/i);
  assert.match(sql, /food_market_relevance/i);
  assert.match(sql, /food_personal_corrections/i);
  assert.match(sql, /user_food_favorites/i);
  assert.match(sql, /search_nutrition_food_library\(text,text,text,integer,text,text,text,jsonb\)/i);
  assert.match(sql, /pg_get_functiondef/i);
  assert.match(sql, /pg_get_constraintdef/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate|alter|drop|create)\b/i);
});

test("a clean candidate subset may be proposed while blocked candidates remain deferred", () => {
  const evidence = baseEvidence();
  evidence.candidates["table:public.food_market_relevance"] = cleanCandidate();

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.equal(result.approvable, true);
  assert.deepEqual(result.globalBlockers, []);
  assert.deepEqual(result.proposedDestructiveObjects, ["table:public.food_market_relevance"]);
  assert.ok(result.blockedCandidates.length > 0);
  assert.equal(result.plannerApprovalRequired, true);
  assert.equal(result.destructiveSqlAuthorized, false);
  assert.equal(result.productionMutationAuthorized, false);
});

test("missing fresh exact-head FULL_DR evidence blocks the whole retirement preflight", () => {
  const evidence = baseEvidence();
  evidence.portability = {
    profile: "CORE_PORTABLE",
    fresh: false,
    exactHead: DEPLOYED_SHA,
    latestMigrationVersion: LATEST_VERSION,
    drReady: false,
    productionMutationPerformed: false,
  };
  evidence.candidates["table:public.food_market_relevance"] = cleanCandidate();

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.equal(result.approvable, false);
  assert.ok(result.globalBlockers.includes("fresh_full_dr_missing"));
  assert.ok(result.globalBlockers.includes("full_dr_not_ready"));
});

test("wrong project and Activity Catalog targets fail closed", () => {
  const wrong = baseEvidence();
  wrong.projectRef = "aaaaaaaaaaaaaaaaaaaa";
  assert.ok(evaluatePlan7RetirementPreflight(wrong).globalBlockers.includes("wrong_production_project"));

  const activity = baseEvidence();
  activity.projectRef = ACTIVITY_CATALOG_PROJECT_REF;
  const result = evaluatePlan7RetirementPreflight(activity);
  assert.ok(result.globalBlockers.includes("activity_catalog_target_forbidden"));
  assert.ok(result.globalBlockers.includes("wrong_production_project"));
});

test("deployed commit and reconciled migration identity are exact global gates", () => {
  const evidence = baseEvidence();
  evidence.deployment.commitSha = "b".repeat(40);
  evidence.migration.latestVersion = "20261008014223";
  evidence.ledger.pendingCount = 1;
  evidence.ledger.unresolvedCount = 1;

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.ok(result.globalBlockers.includes("deployed_commit_mismatch"));
  assert.ok(result.globalBlockers.includes("latest_migration_mismatch"));
  assert.ok(result.globalBlockers.includes("pending_migrations_present"));
  assert.ok(result.globalBlockers.includes("unresolved_migrations_present"));
});

test("legacy owner favorites are retained owner state, not a Plan 7 retirement candidate", () => {
  const evidence = baseEvidence();
  evidence.ownerReconciliation = {
    total: 1,
    blocked: 1,
    retirementSafe: false,
  };

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.ok(!PLAN7_RETIREMENT_CANDIDATES.includes("table:public.user_food_favorites"));
  assert.ok(PLAN7_KEEP_OBJECTS.includes("table:public.user_food_favorites"));
  assert.equal(
    result.candidateResults.some((item) => item.id === "table:public.user_food_favorites"),
    false,
  );
  assert.ok(!result.proposedDestructiveObjects.includes("table:public.user_food_favorites"));
});

test("zero personal-correction rows are still blocked while database functions reference the table", () => {
  const evidence = baseEvidence();
  evidence.candidates["table:public.food_personal_corrections"] = cleanCandidate({
    rowCount: 0,
    databaseFunctionReferences: [
      "private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)",
    ],
  });

  const result = evaluatePlan7RetirementPreflight(evidence);
  const candidate = result.candidateResults.find((item) => item.id === "table:public.food_personal_corrections");

  assert.ok(candidate.blockers.includes("candidate_still_referenced"));
  assert.ok(!candidate.blockers.includes("personal_corrections_nonzero"));
});

test("legacy search remains blocked while application roles retain EXECUTE", () => {
  const evidence = baseEvidence();
  evidence.candidates["function:public.search_nutrition_food_library"] = cleanCandidate({
    executableRoles: ["authenticated", "service_role"],
  });

  const result = evaluatePlan7RetirementPreflight(evidence);
  const candidate = result.candidateResults.find(
    (item) => item.id === "function:public.search_nutrition_food_library",
  );

  assert.ok(candidate.blockers.includes("candidate_still_executable"));
  assert.ok(!result.proposedDestructiveObjects.includes("function:public.search_nutrition_food_library"));
});

test("zero food_market_relevance rows are insufficient without external/live clearance", () => {
  const evidence = baseEvidence();
  evidence.candidates["table:public.food_market_relevance"] = cleanCandidate({
    rowCount: 0,
    externalDependencyState: "unknown",
  });

  const result = evaluatePlan7RetirementPreflight(evidence);
  const candidate = result.candidateResults.find((item) => item.id === "table:public.food_market_relevance");

  assert.ok(candidate.blockers.includes("external_dependency_not_cleared"));
  assert.ok(!result.proposedDestructiveObjects.includes("table:public.food_market_relevance"));
});

test("keep-object evidence is mandatory and cannot self-authorize destructive SQL", () => {
  const evidence = baseEvidence();
  delete evidence.keepObjects["column:public.food_items.id"];
  evidence.candidates["table:public.food_market_relevance"] = cleanCandidate();

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.equal(result.approvable, false);
  assert.ok(result.globalBlockers.includes("keep_object_evidence_incomplete"));
  assert.deepEqual(result.keepViolations, ["column:public.food_items.id"]);
  assert.equal(result.destructiveSqlAuthorized, false);
  assert.equal(result.productionMutationAuthorized, false);
});

test("current live blocker shape produces no proposed destructive set", () => {
  const evidence = baseEvidence();
  evidence.ownerReconciliation = {
    total: 1,
    blocked: 1,
    retirementSafe: false,
  };
  evidence.candidates["table:public.food_personal_corrections"] = cleanCandidate({
    databaseFunctionReferences: [
      "private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)",
    ],
  });
  evidence.candidates["table:public.food_aliases"] = cleanCandidate({
    databaseFunctionReferences: [
      "search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)",
    ],
  });
  evidence.candidates["table:public.food_market_relevance"] = cleanCandidate({
    externalDependencyState: "unknown",
  });
  evidence.candidates["function:public.search_nutrition_food_library"] = cleanCandidate({
    liveDependencyState: "unknown",
    externalDependencyState: "unknown",
  });

  const result = evaluatePlan7RetirementPreflight(evidence);

  assert.equal(result.approvable, false);
  assert.deepEqual(result.proposedDestructiveObjects, []);
  assert.equal(result.plannerApprovalRequired, true);
});

test("candidate inventory preserves the frozen keep-versus-retire boundary", () => {
  assert.ok(PLAN7_RETIREMENT_CANDIDATES.includes("column:public.food_items.food_name"));
  assert.ok(PLAN7_RETIREMENT_CANDIDATES.includes("table:public.food_aliases"));
  assert.ok(!PLAN7_RETIREMENT_CANDIDATES.includes("table:public.user_food_favorites"));
  assert.ok(PLAN7_KEEP_OBJECTS.includes("table:public.user_food_favorites"));
  assert.ok(!PLAN7_RETIREMENT_CANDIDATES.includes("column:public.food_items.id"));
  assert.ok(!PLAN7_RETIREMENT_CANDIDATES.includes("column:public.food_items.lifecycle_status"));
  assert.ok(PLAN7_KEEP_OBJECTS.includes("function:public.search_food_catalog_v2"));
  assert.ok(PLAN7_KEEP_OBJECTS.includes("function:public.rebuild_food_catalog_search_projection_v2"));
  assert.ok(PLAN7_KEEP_OBJECTS.includes("table:public.food_barcodes"));
});
