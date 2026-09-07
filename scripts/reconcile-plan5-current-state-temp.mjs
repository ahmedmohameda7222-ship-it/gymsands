import { readFileSync, writeFileSync } from "node:fs";

function replaceRequired(path, from, to) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(from)) throw new Error(`missing expected text in ${path}: ${from.slice(0, 120)}`);
  writeFileSync(path, source.replace(from, to));
}

function replaceSection(path, start, end, replacement) {
  const source = readFileSync(path, "utf8");
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`missing section markers in ${path}`);
  writeFileSync(path, source.slice(0, startIndex) + replacement + source.slice(endIndex));
}

const correction = "20260907165500_food_catalog_search_serving_semantics_correction.sql";
const correctionVersion = "20260907215257";
const correctionName = "food_catalog_search_serving_semantics_correction";

// Release target contract: reconciled ledger is release-ready, while the declared
// compatibility marker remains distinct from the newer physical migration head.
{
  const path = "scripts/release-target-compatibility.test.mjs";
  replaceRequired(path,
    'test("preflight blocks release while the Plan 5 serving correction is pending", () => {',
    'test("preflight accepts the reconciled Plan 5 correction while preserving the declared marker", () => {');
  replaceRequired(path,
    '  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), true);\n  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), true);',
    '  assert.equal(markerResult.failures.includes("migration_ledger_not_reconciled"), false);\n  assert.equal(markerResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);');
  replaceRequired(path,
    '  assert.equal(physicalHeadResult.failures.includes("migration_ledger_not_reconciled"), true);\n  assert.equal(physicalHeadResult.releaseBlockers.includes("migration_ledger_not_reconciled"), true);',
    '  assert.equal(physicalHeadResult.failures.includes("migration_ledger_not_reconciled"), false);\n  assert.equal(physicalHeadResult.releaseBlockers.includes("migration_ledger_not_reconciled"), false);');
}

// Compatibility contract and Next metadata now expose a fully reconciled physical head.
{
  const path = "scripts/release-compatibility-contract.test.mjs";
  replaceRequired(path,
    'test("declared database marker remains distinct from the applied Plan 5 physical head while serving correction is pending", () => {',
    'test("declared database marker remains distinct from the reconciled Plan 5 physical head", () => {');
  replaceRequired(path,
    '  assert.equal(resolved.latestAppliedMigrationVersion, "20260906200129");',
    `  assert.equal(resolved.latestAppliedMigrationVersion, "${correctionVersion}");`);
  replaceRequired(path,
    '  assert.equal(pendingEntries.length, 1);\n  assert.equal(pendingEntries[0]?.localFile, PLAN5_SERVING_CORRECTION);',
    '  assert.equal(pendingEntries.length, 0);');
  replaceRequired(path,
    '  assert.equal(correction.state, "pending");\n  assert.equal(correction.productionVersion, undefined);\n  assert.equal(correction.productionName, undefined);\n  assert.equal(resolved.migrationLedgerReconciliationState, "pending");\n  assert.equal(ledger.pendingCount, 1);\n  assert.equal(resolved.pendingMigrationCount, 1);\n  assert.equal(resolved.schemaAppliedUntrackedCount, 0);\n  assert.equal(resolved.unresolvedMigrationCount, 1);',
    `  assert.equal(correction.state, "applied_version_alias");\n  assert.equal(correction.productionVersion, "${correctionVersion}");\n  assert.equal(correction.productionName, "${correctionName}");\n  assert.equal(resolved.migrationLedgerReconciliationState, "reconciled");\n  assert.equal(ledger.pendingCount, 0);\n  assert.equal(resolved.pendingMigrationCount, 0);\n  assert.equal(resolved.schemaAppliedUntrackedCount, 0);\n  assert.equal(resolved.unresolvedMigrationCount, 0);`);
  replaceRequired(path,
    'test("Next build metadata preserves the declared marker and exposes the pending serving correction", async () => {',
    'test("Next build metadata preserves the declared marker and exposes the reconciled physical head", async () => {');
  replaceRequired(path,
    '  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "20260906200129");\n  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "pending");\n  assert.equal(releaseMetadata.pendingMigrationCount, "1");\n  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");\n  assert.equal(releaseMetadata.unresolvedMigrationCount, "1");',
    `  assert.equal(releaseMetadata.latestAppliedMigrationVersion, "${correctionVersion}");\n  assert.equal(releaseMetadata.migrationLedgerReconciliationState, "reconciled");\n  assert.equal(releaseMetadata.pendingMigrationCount, "0");\n  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, "0");\n  assert.equal(releaseMetadata.unresolvedMigrationCount, "0");`);
}

// Nullable Meal Plan migration regression should see the current ledger as reconciled.
{
  const path = "lib/product/nullable-meal-plan-snapshot-migration.test.ts";
  replaceRequired(path,
    '  it("preserves authorized Production aliases while carrying the pending Plan 5 serving correction", () => {',
    '  it("preserves authorized Production aliases after the Plan 5 serving correction is reconciled", () => {');
  replaceRequired(path,
    '    expect(pendingEntries).toEqual([\n      expect.objectContaining({\n        localFile: plan5ServingCorrectionName,\n        state: "pending",\n      }),\n    ]);',
    '    expect(pendingEntries).toEqual([]);');
  replaceRequired(path,
    '    expect(ledger.pendingCount).toBe(1);\n    expect(ledger.unresolvedCount).toBe(1);\n    expect(ledger.historyRepair.state).toBe("pending");\n    expect(ledger.historyRepair.pendingCount).toBe(1);\n    expect(ledger.historyRepair.unresolvedCount).toBe(1);',
    `    const correctionEntry = ledger.entries.find((entry) => entry.localFile === plan5ServingCorrectionName);\n    expect(correctionEntry).toEqual(expect.objectContaining({\n      state: "applied_version_alias",\n      productionVersion: "${correctionVersion}",\n      productionName: "${correctionName}",\n    }));\n    expect(ledger.pendingCount).toBe(0);\n    expect(ledger.unresolvedCount).toBe(0);\n    expect(ledger.historyRepair.state).toBe("reconciled");\n    expect(ledger.historyRepair.pendingCount).toBe(0);\n    expect(ledger.historyRepair.unresolvedCount).toBe(0);`);
}

// Batch 0 historical snapshots remain historical; only the current ledger assertions move to reconciled.
{
  const path = "lib/product/food-catalog-ingestion-boundary.test.ts";
  replaceRequired(path,
    '  it("preserves finalized Batch 0 authority while recording later authorized Production aliases and the pending Plan 5 correction", () => {',
    '  it("preserves finalized Batch 0 authority while recording later authorized Production aliases and the reconciled Plan 5 correction", () => {');
  replaceRequired(path,
    '    expect(currentCorrectionEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN5_SERVING_CORRECTION,\n        state: "pending",\n      }),\n    ]);\n    expect(currentPendingEntries).toEqual(currentCorrectionEntries);\n    expect(current.pendingCount).toBe(1);\n    expect(current.unresolvedCount).toBe(1);\n    expect(current.historyRepair).toEqual(\n      expect.objectContaining({\n        state: "pending",\n        pendingCount: 1,\n        unresolvedCount: 1,\n      })\n    );',
    `    expect(currentCorrectionEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN5_SERVING_CORRECTION,\n        state: "applied_version_alias",\n        productionVersion: "${correctionVersion}",\n        productionName: "${correctionName}",\n      }),\n    ]);\n    expect(currentPendingEntries).toEqual([]);\n    expect(current.pendingCount).toBe(0);\n    expect(current.unresolvedCount).toBe(0);\n    expect(current.historyRepair).toEqual(\n      expect.objectContaining({\n        state: "reconciled",\n        pendingCount: 0,\n        unresolvedCount: 0,\n      })\n    );`);
}

// Plan 3 authority regression keeps its frozen entry exact while current ledger advances.
{
  const path = "lib/product/food-catalog-generation-authority-migration.test.ts";
  replaceRequired(path,
    '  it("preserves verified Plan 3/4/5 aliases while carrying the pending Plan 5 serving correction", () => {',
    '  it("preserves verified Plan 3/4/5 aliases after the Plan 5 serving correction is reconciled", () => {');
  replaceRequired(path,
    '    expect(ledger.productionRecordCount).toBe(120);\n    expect(ledger.pendingCount).toBe(1);\n    expect(ledger.unresolvedCount).toBe(1);\n    expect(ledger.historyRepair.state).toBe("pending");\n    expect(ledger.historyRepair.pendingCount).toBe(1);\n    expect(ledger.historyRepair.unresolvedCount).toBe(1);',
    '    expect(ledger.productionRecordCount).toBe(121);\n    expect(ledger.pendingCount).toBe(0);\n    expect(ledger.unresolvedCount).toBe(0);\n    expect(ledger.historyRepair.state).toBe("reconciled");\n    expect(ledger.historyRepair.pendingCount).toBe(0);\n    expect(ledger.historyRepair.unresolvedCount).toBe(0);');
  replaceRequired(path,
    '    const pendingEntries = ledger.entries.filter((item) => item.state === "pending");\n    expect(pendingEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN5_SERVING_CORRECTION,\n        state: "pending",\n      }),\n    ]);',
    `    const pendingEntries = ledger.entries.filter((item) => item.state === "pending");\n    expect(pendingEntries).toEqual([]);\n    const correction = ledger.entries.find((item) => item.localFile === PLAN5_SERVING_CORRECTION);\n    expect(correction).toEqual(expect.objectContaining({\n      state: "applied_version_alias",\n      productionVersion: "${correctionVersion}",\n      productionName: "${correctionName}",\n    }));`);
}

// Plan 4 regression and human migration authority both advance to the correction's generated identity.
{
  const path = "lib/product/food-catalog-ingestion-v2-authority-migration.test.ts";
  replaceRequired(path,
    '  it("records the verified Plan 4 alias while one Plan 5 serving correction remains pending", () => {',
    '  it("records the verified Plan 4 alias while the Plan 5 serving correction is reconciled", () => {');
  replaceRequired(path,
    '    expect(ledger.productionRecordCount).toBe(120);\n    expect(ledger.pendingCount).toBe(1);\n    expect(ledger.unresolvedCount).toBe(1);\n    expect(ledger.historyRepair.state).toBe("pending");\n    expect(ledger.historyRepair.pendingCount).toBe(1);\n    expect(ledger.historyRepair.unresolvedCount).toBe(1);',
    '    expect(ledger.productionRecordCount).toBe(121);\n    expect(ledger.pendingCount).toBe(0);\n    expect(ledger.unresolvedCount).toBe(0);\n    expect(ledger.historyRepair.state).toBe("reconciled");\n    expect(ledger.historyRepair.pendingCount).toBe(0);\n    expect(ledger.historyRepair.unresolvedCount).toBe(0);');
  replaceRequired(path,
    '    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");\n    expect(pendingEntries).toEqual([\n      expect.objectContaining({\n        localFile: PLAN5_SERVING_CORRECTION,\n        state: "pending",\n      }),\n    ]);',
    `    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");\n    expect(pendingEntries).toEqual([]);\n    const correctionEntry = ledger.entries.find((entry) => entry.localFile === PLAN5_SERVING_CORRECTION);\n    expect(correctionEntry).toEqual(expect.objectContaining({\n      state: "applied_version_alias",\n      productionVersion: "${correctionVersion}",\n      productionName: "${correctionName}",\n    }));`);
  replaceRequired(path,
    '    expect(reconciliationDoc).toContain("physical production migration records: **120**");\n    expect(reconciliationDoc).toContain("pending repository migrations: **1**");\n    expect(reconciliationDoc).toContain("`unresolvedcount = 1`");\n    expect(reconciliationDoc).toContain(PLAN5_SERVING_CORRECTION);',
    `    expect(reconciliationDoc).toContain("${correctionVersion}_${correctionName}");\n    expect(reconciliationDoc).toContain("physical production migration records: **121**");\n    expect(reconciliationDoc).toContain("pending repository migrations: **0**");\n    expect(reconciliationDoc).toContain("\`unresolvedcount = 0\`");\n    expect(reconciliationDoc).toContain(PLAN5_SERVING_CORRECTION);`);
}

// Human-readable migration authority: replace only the current-state/correction section.
{
  const path = "docs/architecture/migration-ledger-reconciliation.md";
  const start = "**Status:**";
  const end = "## Food Catalog Plan 5 Search Projection V2 — Production application 2026-09-06";
  const replacement = `**Status:** Production migration history and repository ledger are reconciled through the applied Food Catalog Plan 5 serving-semantics correction\n\nThis document is the human-readable current migration authority. Exhaustive immutable repository-to-Production identity mappings live in \`supabase/migration-ledger.json\`; immutable SQL lives under \`supabase/migrations/\`; executable verification lives under \`supabase/verification/\`.\n\nHistorical PR descriptions, completed implementation reports, and old audit snapshots are evidence only. They do not override the current state below.\n\n## Current state\n\nThe latest verified Plaivra Production inspection after the authorized 2026-09-07 Plan 5 serving-semantics correction established:\n\n- Physical Production migration records: **121**\n- Exact repository-name applications tracked as \`state = applied\`: **63**\n- Latest physical Production record: \`${correctionVersion}_${correctionName}\`\n- Corresponding immutable repository migration: \`${correction}\`\n- Frozen correction migration Git blob: \`fd51c88a1326cc83d4532ac60a6e89650847f894\`\n- Original applied Plan 5 migration: \`20260906183000_food_catalog_search_projection_v2.sql\` → \`20260906200129_food_catalog_search_projection_v2\`\n- Frozen original Plan 5 migration Git blob: \`7be00af5e347ca8d58abcac74cf4c816761a0745\`\n- Released compatibility marker: \`20260724232734\`\n- Activity Catalog Production remains isolated from the Main Plaivra migration ledger\n\nThe current repository/machine-ledger state records:\n\n- Pending repository migrations: **0**\n- \`pendingCount = 0\`\n- \`schemaVerifiedUntrackedCount = 0\`\n- \`unresolvedCount = 0\`\n- \`historyRepair.state = reconciled\`\n- migration-ledger \`release_ready = true\`\n\nThe machine-ledger \`productionMigrationCount\` counts exact \`state = applied\` entries; it is not the total number of physical Supabase migration-history records. Generated Production identities remain represented as \`applied_version_alias\`; physical Production history is now 121 records. Applied migrations must not be replayed.\n\n## Food Catalog Plan 5 serving-semantics correction — Production application 2026-09-07\n\nPlanner final QA/QC on PR #171 found a serving-authority correctness defect in the already-applied Plan 5 SearchDocument rebuild. The approved forward-only correction is:\n\n\`${correction}\`\n\nFrozen Git blob:\n\n\`fd51c88a1326cc83d4532ac60a6e89650847f894\`\n\nAfter PR #171 was merged at \`main@94553f79dbafb41a059f6ac07bcc2a48e9418414\`, read-only preflight confirmed that Production still ended at \`20260906200129_food_catalog_search_projection_v2\`, the correction had not been applied, SearchDocuments were empty, Food/source/ingestion/generation data were unpopulated, and the current-generation pointer remained \`NULL/0\`. Under standing migration authority, the exact frozen correction was then applied once through the tracked Supabase migration mechanism. Supabase generated physical identity:\n\n\`${correctionVersion}_${correctionName}\`\n\nImmediate read-back proved:\n\n- global SearchDocument \`serving_label\` is nullable;\n- \`public.rebuild_food_catalog_search_projection_v2(uuid,text,text)\` remains the public rebuild boundary and is executable by \`service_role\` but not \`authenticated\` or \`anon\`;\n- the internal legacy rebuild exists only under \`private\` and is not executable by \`service_role\`, \`authenticated\`, or \`anon\`;\n- \`food_catalog_search_documents = 0\`;\n- \`food_items = 0\`;\n- \`food_source_records = 0\`;\n- \`food_ingestion_batches = 0\`;\n- \`food_ingestion_runs = 0\`;\n- \`food_catalog_generations = 0\`;\n- \`food_catalog_generation_foods = 0\`;\n- \`current_generation_id = NULL\` and \`pointer_revision = 0\`;\n- the released compatibility marker remains \`20260724232734\`.\n\nThe correction preserves nullable nutrition, keeps nutrition normalization basis separate from serving-display authority, does not choose an arbitrary serving option, and leaves Plan 3 generation authority and Plan 5 derived-search authority intact. No Food population, provider ingestion, activation, generation creation/promotion, current-pointer movement, deployment, compatibility-marker promotion, or Activity Catalog mutation occurred. Do not replay either Plan 5 migration.\n\n`;
  replaceSection(path, start, end, replacement);
}
