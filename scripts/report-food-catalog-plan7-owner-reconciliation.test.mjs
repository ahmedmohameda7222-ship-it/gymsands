import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnerReconciliationSql } from "./report-food-catalog-plan7-owner-reconciliation.mjs";

test("owner reconciliation report is aggregate-only and read-only by default", () => {
  const sql = buildOwnerReconciliationSql();
  assert.match(sql, /begin read only;/i);
  assert.match(sql, /rollback;/i);
  for (const key of [
    "total",
    "catalog_mappable",
    "catalog_already_mapped",
    "my_food_preserved",
    "legacy_text_preserved",
    "blocked",
    "personal_corrections",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(sql, /diagnosticRows/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate|alter|drop)\b/i);
});

test("diagnostic mode emits stable identifiers and dispositions without raw owner/key payloads", () => {
  const sql = buildOwnerReconciliationSql({ diagnostic: true });
  assert.match(sql, /'diagnosticRows'/);
  assert.match(sql, /'rowId'/);
  assert.match(sql, /'disposition'/);
  assert.match(sql, /'reason'/);
  assert.doesNotMatch(sql, /'userId'/);
  assert.doesNotMatch(sql, /'foodKey'/);
});

test("classification SQL preserves heterogeneous owner semantics instead of blanket conversion", () => {
  const sql = buildOwnerReconciliationSql();
  assert.match(sql, /public\.food_items/);
  assert.match(sql, /public\.user_food_items/);
  assert.match(sql, /public\.food_favorites/);
  assert.match(sql, /same_owner_active_my_food_matches/);
  assert.match(sql, /cross_owner_my_food_matches/);
  assert.match(sql, /same_owner_deleted_my_food_matches/);
  assert.match(sql, /legacy_text_preserved/);
  assert.match(sql, /ambiguous_uuid/);
});
