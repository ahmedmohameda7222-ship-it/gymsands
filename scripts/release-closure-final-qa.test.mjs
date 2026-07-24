import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVITY_CATALOG_PROJECT_REF,
  PLAIVRA_PROJECT_REF,
  PRODUCTION_AUTHORIZATION_CONTEXT,
  STAGE1_VALIDATION_CONTEXT,
  authorizeProductionPromotion,
  deriveReleaseTarget,
  productionAuthorizationToken,
  validateSupabaseProductionTarget,
} from "./release-identity-contract.mjs";

const root = new URL("../", import.meta.url);
const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const base = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const runId = "987654";
const migration = "20260721012814";

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("Stage-1 cannot authorize and exact Production token is identity bound", () => {
  assert.equal(authorizeProductionPromotion({
    context: STAGE1_VALIDATION_CONTEXT,
    token: "",
    reviewedCommit: commit,
    qualityRunId: runId,
    expectedMigration: migration,
  }), false);
  const exact = productionAuthorizationToken({ reviewedCommit: commit, qualityRunId: runId, expectedMigration: migration });
  assert.equal(authorizeProductionPromotion({
    context: PRODUCTION_AUTHORIZATION_CONTEXT,
    token: exact,
    reviewedCommit: commit,
    qualityRunId: runId,
    expectedMigration: migration,
  }), true);
  for (const token of ["yes", "production", exact.replace(commit, base), exact.replace(runId, "1"), exact.replace(migration, "20260721012815")]) {
    assert.throws(() => authorizeProductionPromotion({
      context: PRODUCTION_AUTHORIZATION_CONTEXT,
      token,
      reviewedCommit: commit,
      qualityRunId: runId,
      expectedMigration: migration,
    }), /exact release identity/);
  }
});

test("Plaivra direct and recognized pooler targets are accepted with redacted identity", () => {
  const direct = validateSupabaseProductionTarget(
    "postgresql://postgres:secret@db.bkwezjxvapaeasfvlhvv.supabase.co:5432/postgres?sslmode=require",
    PLAIVRA_PROJECT_REF,
  );
  assert.equal(direct.connectionKind, "supabase-direct");
  assert.equal(JSON.stringify(direct).includes("secret"), false);
  const pooler = validateSupabaseProductionTarget(
    "postgresql://postgres.bkwezjxvapaeasfvlhvv:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require",
    PLAIVRA_PROJECT_REF,
  );
  assert.equal(pooler.connectionKind, "supabase-pooler");
});

test("Activity Catalog, other projects, generic hosts and localhost are rejected", () => {
  const rejected = [
    ["postgresql://postgres:secret@db.khlcctuefiuhunqymkbp.supabase.co/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres.khlcctuefiuhunqymkbp:secret@aws-0-eu.pooler.supabase.com/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@db.otherprojectref.supabase.co/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@example.com/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@localhost/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@db.bkwezjxvapaeasfvlhvv.supabase.co/postgres?sslmode=require", ACTIVITY_CATALOG_PROJECT_REF],
  ];
  for (const [url, projectRef] of rejected) {
    assert.throws(() => validateSupabaseProductionTarget(url, projectRef));
  }
});

test("future reconciled ledger automatically derives its later target", () => {
  const current = JSON.parse(readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"));
  const reconciled = structuredClone(current);
  reconciled.entries = reconciled.entries.filter((entry) => entry.state !== "pending");
  reconciled.pendingCount = 0;
  reconciled.unresolvedCount = 0;
  reconciled.historyRepair = {
    ...reconciled.historyRepair,
    state: "reconciled",
    pendingCount: 0,
    unresolvedCount: 0,
    note: "Synthetic future-target fixture with every migration resolved.",
  };
  const currentTarget = deriveReleaseTarget(reconciled).expectedMigration;
  const futureVersion = (BigInt(currentTarget) + 1n).toString().padStart(currentTarget.length, "0");
  const future = structuredClone(reconciled);
  future.entries.push({
    productionVersion: futureVersion,
    productionName: "synthetic_future_release",
    localFile: `${futureVersion}_synthetic_future_release.sql`,
    state: "applied",
  });
  future.productionMigrationCount += 1;
  assert.equal(deriveReleaseTarget(future).expectedMigration, futureVersion);
});

test("generic workflow and evidence code contain no pinned AW-2A migration", () => {
  for (const path of [
    ".github/workflows/quality.yml",
    "scripts/quality-evidence-contract.mjs",
    "scripts/release-preflight.mjs",
  ]) {
    assert.equal(source(path).includes("20260721012814"), false, `${path} must derive the target`);
  }
  const quality = source(".github/workflows/quality.yml");
  assert.match(quality, /quality-ledger-target\.mjs/);
  assert.match(quality, /validation_request_id/);
  const qualityTarget = source("scripts/quality-ledger-target.mjs");
  assert.match(qualityTarget, /deriveMigrationLedgerState/);
  assert.match(qualityTarget, /expectedMigrationVersion/);
  assert.match(source("scripts/release-identity-contract.mjs"), /deriveReleaseTarget/);
  const preflight = source(".github/workflows/release-preflight.yml");
  assert.match(preflight, /type: choice[\s\S]*stage1-infrastructure-validation[\s\S]*production-marker-promotion-authorization/);
  assert.match(preflight, /comparison_base/);
  assert.match(preflight, /validation_request_id/);
  assert.match(preflight, /expected_migration/);
});

test("same-head run selection and artifact-only evidence permissions are exact", () => {
  const workflow = source(".github/workflows/exact-release-quality-validation.yml");
  assert.match(workflow, /displayTitle == env\.EXPECTED_TITLE/);
  assert.match(workflow, /stage1-q-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}-\$\{REVIEWED_COMMIT\}/);
  assert.match(workflow, /Download and independently verify canonical Quality evidence/);
  assert.match(workflow, /Download and independently verify preflight evidence/);
  assert.match(workflow, /plaivra_aw2b_command_authority_implementation_report\.md/);
  assert.match(workflow, /stage1-exact-release-validation-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /pre-application-exact-release-validation-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /if: steps\.identity\.outputs\.release_ready != 'true'/);
  assert.match(workflow, /if: steps\.identity\.outputs\.release_ready == 'true'/);
  assert.match(workflow, /releasePreflightDispatched: false/);
  assert.match(workflow, /schemaVersion: 3/);
  assert.match(workflow, /canonicalArtifact:/);
  assert.match(workflow, /preflightArtifact:/);
  assert.match(workflow, /exactValidation:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /issues:\s*write|pull-requests:\s*write|pull_request_target|contents:\s*write/);
  assert.doesNotMatch(workflow, /issues\/\$PULL_REQUEST_NUMBER\/comments|pr-comment|recorded_comment/i);
});

test("promotion target validation precedes adapter construction", () => {
  const sourceText = source("scripts/promote-release-schema-compatibility.mjs");
  assert.ok(sourceText.indexOf("validateSupabaseProductionTarget(databaseUrl") < sourceText.indexOf("adapter: productionAdapter(databaseUrl, targetIdentity)"));
  assert.match(sourceText, /databaseTarget = targetIdentity/);
});
