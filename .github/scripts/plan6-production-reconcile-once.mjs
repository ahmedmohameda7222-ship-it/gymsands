import { readFileSync, writeFileSync } from "node:fs";

const EVIDENCE_COMMIT = "c911cfde91ea50814c71072f52bf2f4808401881";
const PLAN6 = "20260908100000_food_catalog_governance_control_plane.sql";
const CORRECTION = "20260909083000_food_catalog_governance_gtin_lock_exactness.sql";
const PLAN6_PROD_VERSION = "20260909081402";
const CORRECTION_PROD_VERSION = "20260910071241";
const PLAN6_BLOB = "6f71952c0ec40e84b8bbe0ff4df47804fdee1478";
const CORRECTION_BLOB = "9e7d10d441858ebe7386b244fa6cd80c2339fd3b";
const PLAN6_SHA256 = "b0dfd506ef8ac47249e6ff1572b843d7abe94e70adbe4cd0ec7e189ada9e7edb";
const CORRECTION_SHA256 = "fe60fd9db45e15397f6c7fda65db7ce67154486bf17113fd727a5b4ddf987f11";

function read(path) { return readFileSync(path, "utf8"); }
function write(path, value) { writeFileSync(path, value); }
function replaceOnce(path, source, search, replacement) {
  const count = typeof search === "string"
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, search.flags.includes("g") ? search.flags : `${search.flags}g`))].length;
  if (count !== 1) throw new Error(`${path}: expected exactly one replacement target, found ${count}`);
  return source.replace(search, replacement);
}

// 1. Machine ledger: preserve physical-vs-exact semantics and attach immutable merged-main evidence.
{
  const path = "supabase/migration-ledger.json";
  const ledger = JSON.parse(read(path));
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6);
  const correction = ledger.entries.find((entry) => entry.localFile === CORRECTION);
  if (!plan6 || !correction) throw new Error("Plan 6 ledger entries are missing");
  if (plan6.productionVersion !== PLAN6_PROD_VERSION || plan6.productionName !== "food_catalog_governance_control_plane") {
    throw new Error("Unexpected original Plan 6 Production identity");
  }
  if (plan6.state !== "ledger_drift_review" || correction.state !== "pending") {
    throw new Error("Plan 6 ledger is not in the expected pre-reconciliation state");
  }

  ledger.capturedAt = new Date().toISOString();
  ledger.auditedRepositoryCommit = EVIDENCE_COMMIT;
  ledger.productionRecordCount = 123;
  ledger.productionMigrationCount = 63;
  ledger.schemaVerifiedUntrackedCount = 0;
  ledger.pendingCount = 0;
  ledger.unresolvedCount = 0;
  ledger.historyRepair = {
    state: "reconciled",
    schemaAppliedUntrackedCount: 0,
    pendingCount: 0,
    unresolvedCount: 0,
    note: "Production migration history is reconciled through the Plan 6 GTIN-lock exactness correction. The original Plan 6 migration and its forward-only exactness correction are mapped to their verified generated Production identities; the historical transfer-time divergence remains recorded on the Plan 6 entry. Do not replay applied migrations."
  };

  // The ledger checker requires every durable evidence tuple to share the audited commit.
  for (const entry of ledger.entries) {
    if (entry.evidenceCommit || entry.repositorySha256 || entry.repositoryGitBlob) {
      if (!(entry.evidenceCommit && entry.repositorySha256 && entry.repositoryGitBlob)) {
        throw new Error(`Incomplete pre-existing evidence tuple for ${entry.localFile}`);
      }
      entry.evidenceCommit = EVIDENCE_COMMIT;
    }
  }

  Object.assign(plan6, {
    state: "applied_version_alias",
    note: `differs; repository migration applied exactly once to Plaivra Production as generated identity ${PLAN6_PROD_VERSION}_food_catalog_governance_control_plane. Post-apply exactness inspection preserved the historical transfer-time divergence in the GTIN UPDATE serialization path: Production initially used a direct Food row lock instead of the reviewed canonical private.food_catalog_lock_food_authority(v_food) helper. The merged forward-only correction ${CORRECTION} was subsequently applied and verified in Production as ${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness, restoring the reviewed canonical helper path without replaying this migration. Do not replay either Plan 6 migration.`,
    productionVersion: PLAN6_PROD_VERSION,
    productionName: "food_catalog_governance_control_plane",
    evidenceCommit: EVIDENCE_COMMIT,
    repositorySha256: PLAN6_SHA256,
    repositoryGitBlob: PLAN6_BLOB,
  });
  Object.assign(correction, {
    state: "applied_version_alias",
    note: `differs; repository migration applied exactly once to Plaivra Production on 2026-09-10 as generated identity ${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness from merged-main Git blob ${CORRECTION_BLOB}. Fresh read-back proved private.food_catalog_serialize_gtin_write() now acquires private.food_catalog_lock_food_authority(v_food) before GTIN authority locks while Food/source/ingestion/generation/search populations remained zero, current_generation_id remained NULL, pointer_revision remained 0, schema compatibility remained 2, and compatibility marker remained 20260724232734. Do not replay.`,
    productionVersion: CORRECTION_PROD_VERSION,
    productionName: "food_catalog_governance_gtin_lock_exactness",
    evidenceCommit: EVIDENCE_COMMIT,
    repositorySha256: CORRECTION_SHA256,
    repositoryGitBlob: CORRECTION_BLOB,
  });

  write(path, JSON.stringify(ledger));
}

// 2. Current human reconciliation authority. Preserve older Plan 5+ history below this section.
{
  const path = "docs/architecture/migration-ledger-reconciliation.md";
  const source = read(path);
  const historyMarker = "## Food Catalog Plan 5 serving-semantics correction — Production application 2026-09-07";
  const index = source.indexOf(historyMarker);
  if (index < 0) throw new Error("Could not locate historical Plan 5 section");
  const history = source.slice(index);
  const current = `# Production migration ledger reconciliation

**Project:** \`bkwezjxvapaeasfvlhvv\`
**Current reconciliation date:** 2026-09-10
**Machine authority:** \`supabase/migration-ledger.json\`
**Status:** Plan 6 governance control plane and its forward-only GTIN-lock exactness correction are both mapped to verified Production identities; migration history is reconciled

This document is the human-readable current migration authority. Exhaustive immutable repository-to-Production identity mappings live in \`supabase/migration-ledger.json\`; immutable SQL lives under \`supabase/migrations/\`; executable verification lives under \`supabase/verification/\`.

Historical PR descriptions, completed implementation reports, and old audit snapshots are evidence only. They do not override the current state below.

## Current state

Fresh Plaivra Production read-only inspection on 2026-09-10 established:

- Physical Production migration records: **123**
- Exact repository-name applications tracked as \`state = applied\`: **63**
- Latest physical Production record: \`${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness\`
- Original Plan 6 Production identity: \`${PLAN6_PROD_VERSION}_food_catalog_governance_control_plane\`
- Forward exactness-correction Production identity: \`${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness\`
- Released compatibility marker: \`20260724232734\`
- Schema compatibility: \`2\`
- \`food_items\`, Food source/ingestion/generation/search populations remain **0**
- \`current_generation_id = NULL\` and \`pointer_revision = 0\`
- Activity Catalog Production remains isolated from the Main Plaivra migration ledger

The current repository/machine-ledger state records:

- \`${PLAN6}\`: \`applied_version_alias\` → \`${PLAN6_PROD_VERSION}_food_catalog_governance_control_plane\`
- \`${CORRECTION}\`: \`applied_version_alias\` → \`${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness\`
- \`pendingCount = 0\`
- \`schemaVerifiedUntrackedCount = 0\`
- \`unresolvedCount = 0\`
- \`historyRepair.state = reconciled\`
- migration-ledger \`release_ready = true\`

The machine-ledger \`productionMigrationCount\` counts exact \`state = applied\` entries; it is not the total number of physical Supabase migration-history records. Generated Production identities remain represented separately as \`applied_version_alias\`. Applied migrations must not be replayed.

## Food Catalog Plan 6 governance control plane — Production exactness reconciled 2026-09-10

Repository migration \`${PLAN6}\` was merged and applied exactly once to Plaivra Production as generated physical identity \`${PLAN6_PROD_VERSION}_food_catalog_governance_control_plane\`. Immediate read-back proved expected Plan 6 governance authority while canonical Food/source/ingestion/generation/search data remained unpopulated and the current-generation pointer remained \`NULL / 0\`.

Post-apply exactness inspection then found one connector-transfer divergence in the UPDATE branch of \`private.food_catalog_serialize_gtin_write()\`: Production used \`perform 1 from public.food_items where id=v_food for update;\` where the reviewed repository migration calls \`perform private.food_catalog_lock_food_authority(v_food);\`. That applied migration remains immutable and was never replayed or rewritten.

PR #174 merged the forward-only repository correction \`${CORRECTION}\` at merged main commit \`${EVIDENCE_COMMIT}\`. Under explicit Planner authorization, that exact correction was applied once to Plaivra Production as generated physical identity \`${CORRECTION_PROD_VERSION}_food_catalog_governance_gtin_lock_exactness\`. Fresh read-back proved the UPDATE Food loop now executes \`perform private.food_catalog_lock_food_authority(v_food);\` before GTIN authority locks.

Post-apply safety read-back proved Food/source/ingestion/generation/search populations remain zero, \`current_generation_id = NULL\`, \`pointer_revision = 0\`, schema compatibility remains \`2\`, and compatibility marker remains \`20260724232734\`. No Food population, provider ingestion, activation, verification approval, Catalog Generation creation/promotion, current-pointer movement, SearchDocument population, compatibility promotion, deployment, or Activity Catalog mutation occurred.

Repository reconciliation therefore resolves the historical Plan 6 drift and pending correction into two immutable \`applied_version_alias\` mappings. The historical divergence remains documented as causal evidence. Neither migration may be replayed.

`;
  write(path, current + history);
}

// 3. Small current-state product contracts.
{
  const path = "lib/product/nullable-meal-plan-snapshot-migration.test.ts";
  let s = read(path);
  s = replaceOnce(path, s,
    'it("preserves authorized Production aliases while Plan 6 is under drift review and the exactness correction remains pending", () => {',
    'it("preserves authorized Production aliases after Plan 6 exactness reconciliation", () => {');
  s = replaceOnce(path, s, 'state: "ledger_drift_review",\n      productionVersion: "20260909081402",', 'state: "applied_version_alias",\n      productionVersion: "20260909081402",');
  s = replaceOnce(path, s,
    'expect(plan6CorrectionEntry).toEqual(expect.objectContaining({\n      localFile: plan6ExactnessCorrectionName,\n      state: "pending",\n    }));\n    expect(pendingEntries).toEqual([plan6CorrectionEntry]);',
    'expect(plan6CorrectionEntry).toEqual(expect.objectContaining({\n      localFile: plan6ExactnessCorrectionName,\n      state: "applied_version_alias",\n      productionVersion: "20260910071241",\n      productionName: "food_catalog_governance_gtin_lock_exactness",\n    }));\n    expect(pendingEntries).toEqual([]);');
  s = replaceOnce(path, s,
    'expect(ledger.pendingCount).toBe(1);\n    expect(ledger.unresolvedCount).toBe(2);\n    expect(ledger.historyRepair.state).toBe("pending");\n    expect(ledger.historyRepair.pendingCount).toBe(1);\n    expect(ledger.historyRepair.unresolvedCount).toBe(2);',
    'expect(ledger.pendingCount).toBe(0);\n    expect(ledger.unresolvedCount).toBe(0);\n    expect(ledger.historyRepair.state).toBe("reconciled");\n    expect(ledger.historyRepair.pendingCount).toBe(0);\n    expect(ledger.historyRepair.unresolvedCount).toBe(0);');
  write(path, s);
}

for (const path of [
  "lib/product/food-catalog-generation-authority-migration.test.ts",
  "lib/product/food-catalog-ingestion-v2-authority-migration.test.ts",
]) {
  let s = read(path);
  s = s.replace(/while Plan 6 drift review and exactness correction remain unresolved/g, "after Plan 6 exactness reconciliation");
  s = replaceOnce(path, s, "expect(ledger.productionRecordCount).toBe(122);", "expect(ledger.productionRecordCount).toBe(123);");
  s = replaceOnce(path, s,
    'expect(ledger.pendingCount).toBe(1);\n    expect(ledger.unresolvedCount).toBe(2);\n    expect(ledger.historyRepair.state).toBe("pending");\n    expect(ledger.historyRepair.pendingCount).toBe(1);\n    expect(ledger.historyRepair.unresolvedCount).toBe(2);',
    'expect(ledger.pendingCount).toBe(0);\n    expect(ledger.unresolvedCount).toBe(0);\n    expect(ledger.historyRepair.state).toBe("reconciled");\n    expect(ledger.historyRepair.pendingCount).toBe(0);\n    expect(ledger.historyRepair.unresolvedCount).toBe(0);');
  s = replaceOnce(path, s, 'state: "ledger_drift_review",\n      productionVersion: "20260909081402",', 'state: "applied_version_alias",\n      productionVersion: "20260909081402",');
  const pendingBlock = /const pendingEntries = ledger\.entries\.filter\(\(item|entry) => \1\.state === "pending"\);\n    expect\(pendingEntries\)\.toEqual\(\[\n      expect\.objectContaining\(\{\n        localFile: PLAN6_EXACTNESS_CORRECTION,\n        state: "pending",\n      \}\),\n    \]\);/;
  const match = s.match(pendingBlock);
  if (!match) throw new Error(`${path}: pending Plan6 block not found`);
  const variable = match[1];
  s = s.replace(pendingBlock,
    `const pendingEntries = ledger.entries.filter((${variable}) => ${variable}.state === "pending");\n    expect(pendingEntries).toEqual([]);\n    const plan6Correction = ledger.entries.find((${variable}) => ${variable}.localFile === PLAN6_EXACTNESS_CORRECTION);\n    expect(plan6Correction).toEqual(expect.objectContaining({\n      state: "applied_version_alias",\n      productionVersion: "20260910071241",\n      productionName: "food_catalog_governance_gtin_lock_exactness",\n    }));`);
  write(path, s);
}

{
  const path = "lib/product/food-catalog-ingestion-boundary.test.ts";
  let s = read(path);
  s = replaceOnce(path, s, 'state: "ledger_drift_review",\n        productionVersion: "20260909081402",', 'state: "applied_version_alias",\n        productionVersion: "20260909081402",');
  s = replaceOnce(path, s,
    'expect(currentPlan6ExactnessEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN6_EXACTNESS_CORRECTION,\n        state: "pending",\n      }),\n    ]);\n    expect(currentPendingEntries).toEqual(currentPlan6ExactnessEntries);\n    expect(current.pendingCount).toBe(1);\n    expect(current.unresolvedCount).toBe(2);',
    'expect(currentPlan6ExactnessEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN6_EXACTNESS_CORRECTION,\n        state: "applied_version_alias",\n        productionVersion: "20260910071241",\n        productionName: "food_catalog_governance_gtin_lock_exactness",\n      }),\n    ]);\n    expect(currentPendingEntries).toEqual([]);\n    expect(current.pendingCount).toBe(0);\n    expect(current.unresolvedCount).toBe(0);');
  s = replaceOnce(path, s,
    'state: "pending",\n        pendingCount: 1,\n        unresolvedCount: 2,',
    'state: "reconciled",\n        pendingCount: 0,\n        unresolvedCount: 0,');
  write(path, s);
}

// 4. Release compatibility current-state contracts.
{
  const path = "scripts/release-compatibility-contract.test.mjs";
  let s = read(path);
  const pattern = /test\("declared database marker[\s\S]*?\n\}\);\n\ntest\("Next build metadata[\s\S]*?\n\}\);/;
  const replacement = `test("declared database marker remains distinct from the reconciled physical migration head", () => {
  const resolved = resolveReleaseCompatibilityContract({ ledger, contract });
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan4 = ledger.entries.find((entry) => entry.localFile === PLAN4_MIGRATION);
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);
  const correction = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);
  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);

  assert.equal(resolved.schemaCompatibilityVersion, "2");
  assert.equal(resolved.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(resolved.latestAppliedMigrationVersion, "20260910071241");
  assert.ok(resolved.latestAppliedMigrationVersion.localeCompare(resolved.expectedDatabaseMigrationVersion) > 0);
  assert.equal(pendingEntries.length, 0);
  assert.equal(plan4.state, "applied_version_alias");
  assert.equal(plan5.state, "applied_version_alias");
  assert.equal(correction.state, "applied_version_alias");
  assert.equal(plan6.state, "applied_version_alias");
  assert.equal(plan6.productionVersion, "20260909081402");
  assert.equal(plan6.productionName, "food_catalog_governance_control_plane");
  assert.equal(plan6Correction.state, "applied_version_alias");
  assert.equal(plan6Correction.productionVersion, "20260910071241");
  assert.equal(plan6Correction.productionName, "food_catalog_governance_gtin_lock_exactness");
  assert.equal(resolved.migrationLedgerReconciliationState, "reconciled");
  assert.equal(ledger.pendingCount, 0);
  assert.equal(resolved.pendingMigrationCount, 0);
  assert.equal(resolved.schemaAppliedUntrackedCount, 0);
  assert.equal(resolved.unresolvedMigrationCount, 0);
});

test("Next build metadata preserves the declared marker and exposes reconciled Plan 6 authority", async () => {
  const { releaseMetadata } = await import("../next.config.mjs");

  assert.equal(releaseMetadata.schemaCompatibilityVersion, "2");
  assert.equal(releaseMetadata.expectedDatabaseMigrationVersion, "20260724232734");
  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "20260910071241");
  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "reconciled");
  assert.equal(releaseMetadata.pendingMigrationCount, "0");
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");
  assert.equal(releaseMetadata.unresolvedMigrationCount, "0");
});`;
  s = replaceOnce(path, s, pattern, replacement);
  write(path, s);
}

{
  const path = "scripts/release-target-compatibility.test.mjs";
  let s = read(path);
  const first = /test\("release consumers[\s\S]*?\n\}\);\n\ntest\("preflight preserves[\s\S]*?\n\}\);/;
  const replacement = `test("release consumers preserve the declared marker with reconciled Plan 6 physical authority", () => {
  const releaseTarget = deriveReleaseTarget(ledger);
  const releaseReadyTarget = deriveReleaseReadyTarget(ledger);
  const qualityTarget = deriveQualityLedgerTarget(ledger);
  const environment = qualityLedgerEnvironment(qualityTarget);
  const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
  const plan5 = ledger.entries.find((entry) => entry.localFile === PLAN5_MIGRATION);
  const correction = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);
  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);
  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);

  assert.equal(releaseTarget.expectedMigration, "20260724232734");
  assert.equal(releaseTarget.latestAppliedMigrationVersion, "20260910071241");
  assert.equal(releaseTarget.schemaCompatibilityVersion, "2");
  assert.equal(releaseTarget.reconciliationState, "reconciled");
  assert.equal(pendingEntries.length, 0);
  assert.equal(plan5.state, "applied_version_alias");
  assert.equal(correction.state, "applied_version_alias");
  assert.equal(plan6.state, "applied_version_alias");
  assert.equal(plan6.productionVersion, "20260909081402");
  assert.equal(plan6.productionName, "food_catalog_governance_control_plane");
  assert.equal(plan6Correction.state, "applied_version_alias");
  assert.equal(plan6Correction.productionVersion, "20260910071241");
  assert.equal(plan6Correction.productionName, "food_catalog_governance_gtin_lock_exactness");
  assert.equal(ledger.pendingCount, 0);
  assert.equal(releaseTarget.pendingCount, 0);
  assert.equal(releaseTarget.schemaAppliedUntrackedCount, 0);
  assert.equal(releaseTarget.unresolvedCount, 0);
  assert.equal(releaseTarget.releaseReady, true);
  assert.deepEqual(releaseReadyTarget, releaseTarget);
  assert.equal(qualityTarget.expectedMigration, releaseTarget.expectedMigration);
  assert.equal(qualityTarget.latestAppliedMigrationVersion, releaseTarget.latestAppliedMigrationVersion);
  assert.equal(qualityTarget.reconciliationState, "reconciled");
  assert.equal(qualityTarget.pendingCount, 0);
  assert.equal(qualityTarget.unresolvedCount, 0);
  assert.equal(qualityTarget.releaseReady, true);
  assert.equal(environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION, releaseTarget.expectedMigration);
  assert.equal(environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE, "reconciled");
  assert.equal(environment.PLAIVRA_PENDING_MIGRATION_COUNT, "0");
  assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "0");
  assert.notEqual(releaseTarget.expectedMigration, releaseTarget.latestAppliedMigrationVersion);
});

test("preflight preserves the declared compatibility marker with a reconciled migration ledger", () => {
  const expectedCommit = "a".repeat(40);
  const releaseTarget = deriveReleaseTarget(ledger);
  const migrationState = deriveMigrationLedgerState(ledger);
  const manifest = {
    release: {
      commitSha: expectedCommit,
      buildTimestamp: new Date().toISOString(),
      expectedDatabaseMigrationVersion: releaseTarget.expectedMigration,
      migrationLedgerReconciliationState: migrationState.reconciliationState,
      pendingMigrationCount: migrationState.pendingCount,
      schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
      unresolvedMigrationCount: migrationState.unresolvedCount,
    },
    runtime: { nextVersion: "16.2.11" },
    qualityGates: {},
  };
  const baseInput = {
    mode: "release",
    expectedCommit,
    checkedOutCommit: expectedCommit,
    expectedRepository: "ahmedmohameda7222-ship-it/gymsands",
    remoteUrl: "https://github.com/ahmedmohameda7222-ship-it/gymsands.git",
    packageJson: { engines: { node: "24.x" } },
    nodeVersion: "v24.18.0",
    nvmVersion: "24",
    nodeFileVersion: "24",
    installedNextVersion: "16.2.11",
    migrationState,
    releaseTarget,
    artifactFailures: [],
  };

  const markerResult = evaluateReleasePreflight({ ...baseInput, manifest });
  assert.equal(markerResult.failures.includes("release_manifest_migration_mismatch"), false);
  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), false);
  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);

  const physicalHeadResult = evaluateReleasePreflight({
    ...baseInput,
    manifest: {
      ...manifest,
      release: { ...manifest.release, expectedDatabaseMigrationVersion: releaseTarget.latestAppliedMigrationVersion },
    },
  });
  assert.equal(physicalHeadResult.failures.includes("release_manifest_migration_mismatch"), true);
  assert.equal(physicalHeadResult.failures.includes("migration_ledger_not_reconciled"), false);
  assert.equal(physicalHeadResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);
});`;
  s = replaceOnce(path, s, first, replacement);
  write(path, s);
}

{
  const path = "scripts/promote-release-schema-compatibility.test.mjs";
  let s = read(path);
  const fixture = /const currentLedger =[\s\S]*?\nfunction successfulPreflight/;
  s = replaceOnce(path, s, fixture, `const currentLedger = JSON.parse(readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"));
const ledger = structuredClone(currentLedger);

function successfulPreflight`);
  const tests = /test\("controlled downstream fixture[\s\S]*?\n\}\);\n\ntest\("rejects the real current repository ledger[\s\S]*?\n\}\);/;
  s = replaceOnce(path, s, tests, `test("current repository ledger satisfies normal release-ready invariants", () => {
  const state = deriveMigrationLedgerState(currentLedger);
  assert.equal(state.reconciliationState, "reconciled");
  assert.equal(state.pendingCount, 0);
  assert.equal(state.schemaAppliedUntrackedCount, 0);
  assert.equal(state.ledgerDriftReviewCount, 0);
  assert.equal(state.unresolvedCount, 0);
  assert.equal(state.releaseReady, true);
  assert.equal(state.latestAppliedMigrationVersion, TARGET_MARKER);
});

test("still rejects a synthetically unresolved repository ledger", () => {
  const unresolvedLedger = structuredClone(currentLedger);
  const correction = unresolvedLedger.entries.find((entry) => entry.localFile === "20260909083000_food_catalog_governance_gtin_lock_exactness.sql");
  correction.state = "pending";
  delete correction.productionVersion;
  delete correction.productionName;
  unresolvedLedger.pendingCount = 1;
  unresolvedLedger.unresolvedCount = 1;
  unresolvedLedger.historyRepair = { ...unresolvedLedger.historyRepair, state: "pending", pendingCount: 1, unresolvedCount: 1 };
  assert.throws(
    () => validatePromotionRequest({ ...validRequest(), ledger: unresolvedLedger }),
    /Repository migration ledger is not release-ready/,
  );
});`);
  write(path, s);
}

console.log("Plan 6 repository reconciliation edits prepared.");
