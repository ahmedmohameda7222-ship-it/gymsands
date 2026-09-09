import fs from "node:fs";

const ORIGINAL = "20260908100000_food_catalog_governance_control_plane.sql";
const CORRECTION = "20260909083000_food_catalog_governance_gtin_lock_exactness.sql";
const PROD_VERSION = "20260909081402";
const PROD_NAME = "food_catalog_governance_control_plane";

function edit(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No change produced for ${path}`);
  fs.writeFileSync(path, after);
}

function once(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing ${label}:\n${from}`);
  const first = source.indexOf(from);
  if (source.indexOf(from, first + from.length) !== -1) throw new Error(`Non-unique ${label}`);
  return source.replace(from, to);
}

edit("supabase/migration-ledger.json", (raw) => {
  const ledger = JSON.parse(raw);
  if (ledger.productionMigrationCount !== 63) throw new Error("Unexpected productionMigrationCount semantics");
  const original = ledger.entries.find((entry) => entry.localFile === ORIGINAL);
  const correction = ledger.entries.find((entry) => entry.localFile === CORRECTION);
  if (!original || original.state !== "ledger_drift_review" || original.productionVersion !== PROD_VERSION || original.productionName !== PROD_NAME) {
    throw new Error("Unexpected Plan 6 drift-review authority");
  }
  if (!correction || correction.state !== "pending" || correction.productionVersion || correction.productionName) {
    throw new Error("Unexpected exactness-correction authority");
  }
  if (ledger.pendingCount !== 1 || ledger.unresolvedCount !== 2 || ledger.historyRepair?.state !== "pending") {
    throw new Error("Unexpected fail-closed ledger counts");
  }
  ledger.productionRecordCount = 122;
  ledger.capturedAt = new Date().toISOString();
  return JSON.stringify(ledger);
});

edit("docs/architecture/migration-ledger-reconciliation.md", (raw) => {
  let source = raw;
  const duplicate = "\n## Plan 6 production exactness reconciliation";
  if (source.includes(duplicate)) source = source.slice(0, source.indexOf(duplicate)).trimEnd() + "\n";
  const plan5Heading = "## Food Catalog Plan 5 serving-semantics correction — Production application 2026-09-07";
  const plan5Index = source.indexOf(plan5Heading);
  if (plan5Index < 0) throw new Error("Plan 5 history boundary not found");
  const prefix = `# Production migration ledger reconciliation

**Project:** \`bkwezjxvapaeasfvlhvv\`
**Current reconciliation date:** 2026-09-09
**Machine authority:** \`supabase/migration-ledger.json\`
**Status:** Plan 6 governance control plane is applied once in Production and held under \`ledger_drift_review\`; the forward-only GTIN-lock exactness correction is pending/unapplied

This document is the human-readable current migration authority. Exhaustive immutable repository-to-Production identity mappings live in \`supabase/migration-ledger.json\`; immutable SQL lives under \`supabase/migrations/\`; executable verification lives under \`supabase/verification/\`.

Historical PR descriptions, completed implementation reports, and old audit snapshots are evidence only. They do not override the current state below.

## Current state

Read-only Plaivra Production inspection on 2026-09-09 established:

- Physical Production migration records: **122**
- Exact repository-name applications tracked as \`state = applied\`: **63**
- Latest physical Production record: \`20260909081402_food_catalog_governance_control_plane\`
- Corresponding immutable repository migration: \`20260908100000_food_catalog_governance_control_plane.sql\`
- Released compatibility marker: \`20260724232734\`
- Activity Catalog Production remains isolated from the Main Plaivra migration ledger

The current repository/machine-ledger state records:

- Applied-under-review repository migration: **1** — \`20260908100000_food_catalog_governance_control_plane.sql\` as \`ledger_drift_review\`, mapped to Production identity \`20260909081402_food_catalog_governance_control_plane\`
- Pending repository migrations: **1** — \`20260909083000_food_catalog_governance_gtin_lock_exactness.sql\`
- \`pendingCount = 1\`
- \`schemaVerifiedUntrackedCount = 0\`
- \`unresolvedCount = 2\`
- \`historyRepair.state = pending\`
- migration-ledger \`release_ready = false\`

The machine-ledger \`productionMigrationCount\` counts exact \`state = applied\` entries; it is not the total number of physical Supabase migration-history records. Generated Production identities remain represented separately by their ledger state. Applied migrations must not be replayed.

## Food Catalog Plan 6 governance control plane — Production applied / exactness correction pending 2026-09-09

Repository migration \`20260908100000_food_catalog_governance_control_plane.sql\` was merged and applied exactly once to Plaivra Production as generated physical identity \`20260909081402_food_catalog_governance_control_plane\`. Immediate read-back proved expected Plan 6 governance authority while canonical Food/source/ingestion/generation/search data remained unpopulated and the current-generation pointer remained \`NULL / 0\`.

Post-apply exactness inspection found one connector-transfer divergence in the UPDATE branch of \`private.food_catalog_serialize_gtin_write()\`: Production used a direct Food row lock where the reviewed repository migration calls \`private.food_catalog_lock_food_authority(v_food)\`. The applied migration is immutable and must not be rewritten or replayed. It is therefore classified as \`ledger_drift_review\` while forward-only repository migration \`20260909083000_food_catalog_governance_gtin_lock_exactness.sql\` remains the sole pending correction.

Current fail-closed authority is \`historyRepair.state = pending\`, \`pendingCount = 1\`, \`unresolvedCount = 2\`, and \`release_ready = false\`. No Food population, provider ingestion, activation, verification approval, Catalog Generation creation/promotion, current-pointer movement, SearchDocument mutation outside existing derived authority, compatibility-marker promotion, runtime cutover, deployment, or Activity Catalog mutation is authorized by this reconciliation.

`;
  return prefix + source.slice(plan5Index);
});

edit("lib/product/nullable-meal-plan-snapshot-migration.test.ts", (source) => {
  source = once(
    source,
    `const plan6MigrationName = "${ORIGINAL}";\n`,
    `const plan6MigrationName = "${ORIGINAL}";\nconst plan6ExactnessCorrectionName = "${CORRECTION}";\n`,
    "nullable exactness constant",
  );
  source = source.replace(
    "preserves authorized Production aliases while Plan 6 remains explicitly pending",
    "preserves authorized Production aliases while Plan 6 is under drift review and the exactness correction remains pending",
  );
  source = once(
    source,
    `    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");\n`,
    `    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");\n    const plan6Entry = ledger.entries.find((entry) => entry.localFile === plan6MigrationName);\n    const plan6CorrectionEntry = ledger.entries.find((entry) => entry.localFile === plan6ExactnessCorrectionName);\n`,
    "nullable state variables",
  );
  source = once(
    source,
`    expect(pendingEntries).toEqual([
      expect.objectContaining({
        localFile: plan6MigrationName,
        state: "pending",
      }),
    ]);`,
`    expect(plan6Entry).toEqual(expect.objectContaining({
      localFile: plan6MigrationName,
      state: "ledger_drift_review",
      productionVersion: "${PROD_VERSION}",
      productionName: "${PROD_NAME}",
    }));
    expect(plan6CorrectionEntry).toEqual(expect.objectContaining({
      localFile: plan6ExactnessCorrectionName,
      state: "pending",
    }));
    expect(pendingEntries).toEqual([plan6CorrectionEntry]);`,
    "nullable current pending block",
  );
  source = source.replace("expect(ledger.unresolvedCount).toBe(1);", "expect(ledger.unresolvedCount).toBe(2);");
  source = source.replace("expect(ledger.historyRepair.unresolvedCount).toBe(1);", "expect(ledger.historyRepair.unresolvedCount).toBe(2);");
  return source;
});

edit("lib/product/food-catalog-generation-authority-migration.test.ts", (source) => {
  source = once(
    source,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\n`,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\nconst PLAN6_EXACTNESS_CORRECTION = "${CORRECTION}";\n`,
    "generation exactness constant",
  );
  source = source.replace(
    "preserves verified Plan 3/4/5 aliases while Plan 6 remains explicitly pending",
    "preserves verified Plan 3/4/5 aliases while Plan 6 drift review and exactness correction remain unresolved",
  );
  source = source.replace("expect(ledger.productionRecordCount).toBe(121);", "expect(ledger.productionRecordCount).toBe(122);");
  source = source.replace("expect(ledger.unresolvedCount).toBe(1);", "expect(ledger.unresolvedCount).toBe(2);");
  source = source.replace("expect(ledger.historyRepair.unresolvedCount).toBe(1);", "expect(ledger.historyRepair.unresolvedCount).toBe(2);");
  source = once(
    source,
`    const pendingEntries = ledger.entries.filter((item) => item.state === "pending");
    expect(pendingEntries).toEqual([
      expect.objectContaining({
        localFile: PLAN6_MIGRATION,
        state: "pending",
      }),
    ]);`,
`    const plan6 = ledger.entries.find((item) => item.localFile === PLAN6_MIGRATION);
    expect(plan6).toEqual(expect.objectContaining({
      state: "ledger_drift_review",
      productionVersion: "${PROD_VERSION}",
      productionName: "${PROD_NAME}",
    }));
    const pendingEntries = ledger.entries.filter((item) => item.state === "pending");
    expect(pendingEntries).toEqual([
      expect.objectContaining({
        localFile: PLAN6_EXACTNESS_CORRECTION,
        state: "pending",
      }),
    ]);`,
    "generation current pending block",
  );
  return source;
});

edit("lib/product/food-catalog-ingestion-v2-authority-migration.test.ts", (source) => {
  source = once(
    source,
    `const PLAN6_MIGRATION_FILE = "${ORIGINAL}";\n`,
    `const PLAN6_MIGRATION_FILE = "${ORIGINAL}";\nconst PLAN6_EXACTNESS_CORRECTION = "${CORRECTION}";\n`,
    "ingestion exactness constant",
  );
  source = source.replace(
    "records the verified Plan 4/5 aliases while Plan 6 remains explicitly pending",
    "records verified Plan 4/5 aliases while Plan 6 drift review and exactness correction remain unresolved",
  );
  source = source.replace("expect(ledger.productionRecordCount).toBe(121);", "expect(ledger.productionRecordCount).toBe(122);");
  source = source.replace("expect(ledger.unresolvedCount).toBe(1);", "expect(ledger.unresolvedCount).toBe(2);");
  source = source.replace("expect(ledger.historyRepair.unresolvedCount).toBe(1);", "expect(ledger.historyRepair.unresolvedCount).toBe(2);");
  source = once(
    source,
`    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
    expect(pendingEntries).toEqual([
      expect.objectContaining({
        localFile: PLAN6_MIGRATION_FILE,
        state: "pending",
      }),
    ]);`,
`    const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION_FILE);
    expect(plan6).toEqual(expect.objectContaining({
      state: "ledger_drift_review",
      productionVersion: "${PROD_VERSION}",
      productionName: "${PROD_NAME}",
    }));
    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
    expect(pendingEntries).toEqual([
      expect.objectContaining({
        localFile: PLAN6_EXACTNESS_CORRECTION,
        state: "pending",
      }),
    ]);`,
    "ingestion current pending block",
  );
  source = source.replace(
    'expect(reconciliationDoc).toContain("physical production migration records: **121**");',
    'expect(reconciliationDoc).toContain("physical production migration records: **122**");',
  );
  source = source.replace(
    'expect(reconciliationDoc).toContain("`unresolvedcount = 1`");',
    'expect(reconciliationDoc).toContain("`unresolvedcount = 2`");',
  );
  source = once(
    source,
    '    expect(reconciliationDoc).toContain(PLAN6_MIGRATION_FILE);\n    expect(reconciliationDoc).toContain(PLAN5_SERVING_CORRECTION);\n',
    '    expect(reconciliationDoc).toContain(PLAN6_MIGRATION_FILE);\n    expect(reconciliationDoc).toContain(PLAN6_EXACTNESS_CORRECTION);\n    expect(reconciliationDoc).toContain("ledger_drift_review");\n    expect(reconciliationDoc).toContain("20260909081402_food_catalog_governance_control_plane");\n    expect(reconciliationDoc).toContain(PLAN5_SERVING_CORRECTION);\n',
    "ingestion reconciliation doc assertions",
  );
  return source;
});

edit("lib/product/food-catalog-governance-plan6-database.test.ts", (source) => {
  source = once(
    source,
    'const LEDGER = "supabase/migration-ledger.json";\n',
    `const LEDGER = "supabase/migration-ledger.json";\nconst EXACTNESS_CORRECTION = "${CORRECTION}";\n`,
    "Plan6 database exactness constant",
  );
  source = once(
    source,
`  it("records Plan 6 as pending/unapplied in the repository migration ledger", () => {
    const ledger = JSON.parse(read(LEDGER)) as { pendingCount: number; unresolvedCount: number; historyRepair: { state: string }; entries: Array<Record<string, unknown>> };
    const entry = ledger.entries.find((item) => item.localFile === "${ORIGINAL}");
    expect(entry).toEqual(expect.objectContaining({ state: "pending" }));
    expect(entry).not.toHaveProperty("productionVersion");
    expect(ledger.pendingCount).toBe(1);
    expect(ledger.unresolvedCount).toBe(1);
    expect(ledger.historyRepair.state).toBe("pending");
  });`,
`  it("records applied Plan 6 under drift review while the forward exactness correction remains pending", () => {
    const ledger = JSON.parse(read(LEDGER)) as { pendingCount: number; unresolvedCount: number; historyRepair: { state: string }; entries: Array<Record<string, unknown>> };
    const entry = ledger.entries.find((item) => item.localFile === "${ORIGINAL}");
    const correction = ledger.entries.find((item) => item.localFile === EXACTNESS_CORRECTION);
    expect(entry).toEqual(expect.objectContaining({
      state: "ledger_drift_review",
      productionVersion: "${PROD_VERSION}",
      productionName: "${PROD_NAME}",
    }));
    expect(correction).toEqual(expect.objectContaining({ state: "pending" }));
    expect(correction).not.toHaveProperty("productionVersion");
    expect(ledger.pendingCount).toBe(1);
    expect(ledger.unresolvedCount).toBe(2);
    expect(ledger.historyRepair.state).toBe("pending");
  });`,
    "Plan6 database current-state test",
  );
  return source;
});

edit("scripts/release-target-compatibility.test.mjs", (source) => {
  source = once(
    source,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\n`,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\nconst PLAN6_EXACTNESS_CORRECTION = "${CORRECTION}";\n`,
    "release target exactness constant",
  );
  source = source.replace(
    "release consumers preserve the declared marker and block release while Plan 6 is pending",
    "release consumers preserve the declared marker and block release during Plan 6 drift review and pending exactness correction",
  );
  source = source.replace(
    "preflight preserves the declared marker but blocks release while Plan 6 remains pending",
    "preflight preserves the declared marker but blocks release while Plan 6 reconciliation remains unresolved",
  );
  source = once(
    source,
    '  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);\n',
    '  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);\n  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);\n',
    "release target state variables",
  );
  source = once(
    source,
`  assert.equal(plan6.state, "pending");
  assert.equal(plan6.productionVersion, undefined);`,
`  assert.equal(plan6.state, "ledger_drift_review");
  assert.equal(plan6.productionVersion, "${PROD_VERSION}");
  assert.equal(plan6.productionName, "${PROD_NAME}");
  assert.equal(plan6Correction.state, "pending");
  assert.equal(plan6Correction.productionVersion, undefined);
  assert.equal(pendingEntries[0].localFile, PLAN6_EXACTNESS_CORRECTION);`,
    "release target Plan6 assertions",
  );
  source = source.replace("assert.equal(releaseTarget.unresolvedCount, 1);", "assert.equal(releaseTarget.unresolvedCount, 2);");
  source = source.replace("assert.equal(qualityTarget.unresolvedCount, 1);", "assert.equal(qualityTarget.unresolvedCount, 2);");
  source = source.replace('assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "1");', 'assert.equal(environment.PLAIVRA_UNRESOLVED_MIGRATION_COUNT, "2");');
  return source;
});

edit("scripts/release-compatibility-contract.test.mjs", (source) => {
  source = once(
    source,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\n`,
    `const PLAN6_MIGRATION = "${ORIGINAL}";\nconst PLAN6_EXACTNESS_CORRECTION = "${CORRECTION}";\n`,
    "release compatibility exactness constant",
  );
  source = source.replace(
    "declared database marker remains distinct from the reconciled Plan 5 physical head while Plan 6 stays pending",
    "declared database marker remains distinct from the resolved release-ledger head while Plan 6 reconciliation stays unresolved",
  );
  source = source.replace(
    "Next build metadata preserves the declared marker and exposes pending Plan 6 reconciliation",
    "Next build metadata preserves the declared marker and exposes Plan 6 drift review plus pending exactness correction",
  );
  source = once(
    source,
    '  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);\n',
    '  const plan6 = ledger.entries.find((entry) => entry.localFile === PLAN6_MIGRATION);\n  const plan6Correction = ledger.entries.find((entry) => entry.localFile === PLAN6_EXACTNESS_CORRECTION);\n',
    "release compatibility state variables",
  );
  source = once(
    source,
`  assert.equal(plan6.state, "pending");
  assert.equal(plan6.productionVersion, undefined);`,
`  assert.equal(plan6.state, "ledger_drift_review");
  assert.equal(plan6.productionVersion, "${PROD_VERSION}");
  assert.equal(plan6.productionName, "${PROD_NAME}");
  assert.equal(plan6Correction.state, "pending");
  assert.equal(plan6Correction.productionVersion, undefined);
  assert.equal(pendingEntries[0].localFile, PLAN6_EXACTNESS_CORRECTION);`,
    "release compatibility Plan6 assertions",
  );
  source = source.replace("assert.equal(resolved.unresolvedMigrationCount, 1);", "assert.equal(resolved.unresolvedMigrationCount, 2);");
  source = source.replace('assert.equal(releaseMetadata.unresolvedMigrationCount, "1");', 'assert.equal(releaseMetadata.unresolvedMigrationCount, "2");');
  return source;
});

console.log("Plan 6 current-state reconciliation edits prepared.");
