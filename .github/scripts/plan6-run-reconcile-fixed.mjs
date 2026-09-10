import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = ".github/scripts/plan6-production-reconcile-once.mjs";
const lines = readFileSync(sourcePath, "utf8").split("\n");
const index = lines.findIndex((line) => line.includes("const pendingBlock ="));
if (index < 0) throw new Error("pendingBlock line not found");
lines[index] = '  const pendingBlock = /const pendingEntries = ledger\\.entries\\.filter\\(\\((item|entry)\\) => \\1\\.state === "pending"\\);\\n    expect\\(pendingEntries\\)\\.toEqual\\(\\[\\n      expect\\.objectContaining\\(\\{\\n        localFile: PLAN6_EXACTNESS_CORRECTION,\\n        state: "pending",\\n      \\}\\),\\n    \\]\\);/;';
const fixedPath = "/tmp/plan6-production-reconcile-once.mjs";
writeFileSync(fixedPath, lines.join("\n"));
await import(pathToFileURL(fixedPath).href);

// Keep the established global historical evidence checkpoint immutable. Current merged-main
// evidence for Plan 6 is carried in the Plan 6 notes and independently proved by Actions.
const ledgerPath = "supabase/migration-ledger.json";
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
ledger.auditedRepositoryCommit = "dfa14c3bc2c1524ff185b1ee4e170f4537a80230";
const aw9 = ledger.entries.find((entry) => entry.localFile === "20260731090000_active_workout_aw9_offline_multi_device.sql");
if (!aw9) throw new Error("AW9 historical evidence entry missing");
aw9.evidenceCommit = "dfa14c3bc2c1524ff185b1ee4e170f4537a80230";

const plan6 = ledger.entries.find((entry) => entry.localFile === "20260908100000_food_catalog_governance_control_plane.sql");
const correction = ledger.entries.find((entry) => entry.localFile === "20260909083000_food_catalog_governance_gtin_lock_exactness.sql");
if (!plan6 || !correction) throw new Error("Plan 6 reconciliation entries missing");
for (const entry of [plan6, correction]) {
  delete entry.evidenceCommit;
  delete entry.repositorySha256;
  delete entry.repositoryGitBlob;
}
plan6.note += " Merged-main evidence commit c911cfde91ea50814c71072f52bf2f4808401881 resolves this repository migration to Git blob 6f71952c0ec40e84b8bbe0ff4df47804fdee1478 with SHA-256 b0dfd506ef8ac47249e6ff1572b843d7abe94e70adbe4cd0ec7e189ada9e7edb.";
correction.note += " Merged-main evidence commit c911cfde91ea50814c71072f52bf2f4808401881 resolves this repository migration to SHA-256 fe60fd9db45e15397f6c7fda65db7ce67154486bf17113fd727a5b4ddf987f11.";
writeFileSync(ledgerPath, JSON.stringify(ledger));

// Update the ingestion-v2 current-document assertions that intentionally described the
// pre-correction 122/pending/drift state. Historical Batch 0 assertions remain untouched.
const ingestionV2Path = "lib/product/food-catalog-ingestion-v2-authority-migration.test.ts";
let ingestionV2 = readFileSync(ingestionV2Path, "utf8");
const replacements = [
  ['expect(reconciliationDoc).toContain("physical production migration records: **122**");', 'expect(reconciliationDoc).toContain("physical production migration records: **123**");'],
  ['expect(reconciliationDoc).toContain("pending repository migrations: **1**");', 'expect(reconciliationDoc).toContain("`pendingcount = 0`");'],
  ['expect(reconciliationDoc).toContain("`unresolvedcount = 2`");', 'expect(reconciliationDoc).toContain("`unresolvedcount = 0`");'],
  ['expect(reconciliationDoc).toContain("ledger_drift_review");', 'expect(reconciliationDoc).toContain("20260910071241_food_catalog_governance_gtin_lock_exactness");'],
];
for (const [from, to] of replacements) {
  const count = ingestionV2.split(from).length - 1;
  if (count !== 1) throw new Error(`ingestion-v2 expected one stale doc assertion, found ${count}: ${from}`);
  ingestionV2 = ingestionV2.replace(from, to);
}
writeFileSync(ingestionV2Path, ingestionV2);
