import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/migration-ledger.json";
const ledger = JSON.parse(readFileSync(path, "utf8"));
const localFile = "20260907165500_food_catalog_search_serving_semantics_correction.sql";
const correction = ledger.entries.find((entry) => entry.localFile === localFile);

if (!correction || correction.state !== "pending") {
  throw new Error(`unexpected correction ledger state: ${JSON.stringify(correction)}`);
}

ledger.capturedAt = "2026-09-07T21:57:22.585279Z";
ledger.pendingCount = 0;
ledger.unresolvedCount = 0;
ledger.historyRepair = {
  ...ledger.historyRepair,
  state: "reconciled",
  pendingCount: 0,
  unresolvedCount: 0,
  note: "Production migration history is physically reconciled through generated identity 20260907215257_food_catalog_search_serving_semantics_correction. Frozen Plan 5 migration 20260906183000_food_catalog_search_projection_v2.sql at Git blob 7be00af5e347ca8d58abcac74cf4c816761a0745 was applied exactly once as generated identity 20260906200129_food_catalog_search_projection_v2. After PR #171 merged, frozen forward-only Plan 5 serving correction 20260907165500_food_catalog_search_serving_semantics_correction.sql at Git blob fd51c88a1326cc83d4532ac60a6e89650847f894 was applied exactly once to Plaivra Production on 2026-09-07 under standing migration authority as generated identity 20260907215257_food_catalog_search_serving_semantics_correction. Immediate read-back proved serving_label nullable, service_role-only public rebuild authority, private legacy rebuild non-executable to service_role/authenticated/anon, zero SearchDocument/Food/source/ingestion/generation rows, current_generation_id NULL with pointer_revision 0, and unchanged compatibility marker 20260724232734. No Food population, provider ingestion, activation, generation creation/promotion, current-pointer movement, runtime cutover, deployment, compatibility-marker promotion, or Activity Catalog mutation occurred. No repository migration remains pending or unresolved. Do not replay applied migrations.",
};

Object.assign(correction, {
  state: "applied_version_alias",
  note: "differs; repository migration applied exactly once to Plaivra Production on 2026-09-07 as generated identity 20260907215257_food_catalog_search_serving_semantics_correction from frozen Git blob fd51c88a1326cc83d4532ac60a6e89650847f894 after PR #171 merge and exact Production history/schema-drift preflight. Read-back proved serving_label nullable, service_role-only public rebuild authority, private legacy rebuild non-executable to service_role/authenticated/anon, zero SearchDocument/Food/source/ingestion/generation rows, current_generation_id NULL with pointer_revision 0, and unchanged compatibility marker 20260724232734. No Food population, provider ingestion, activation, generation creation/promotion, current-pointer movement, deployment, compatibility-marker promotion, or Activity Catalog mutation occurred. Do not replay.",
  productionVersion: "20260907215257",
  productionName: "food_catalog_search_serving_semantics_correction",
});

ledger.productionRecordCount = 121;
writeFileSync(path, JSON.stringify(ledger));
