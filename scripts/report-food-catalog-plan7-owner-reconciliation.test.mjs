import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOwnerFavoriteReconciliationReadSql,
  buildOwnerFavoriteReconciliationReport,
  stableFavoriteRowId,
} from "./report-food-catalog-plan7-owner-reconciliation.mjs";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const catalogId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const myFoodId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const blockedId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function snapshot() {
  return {
    favorites: [
      { userId: ownerA, foodKey: catalogId },
      { userId: ownerB, foodKey: catalogId },
      { userId: ownerA, foodKey: myFoodId },
      { userId: ownerA, foodKey: "greek yogurt|170 g" },
      { userId: ownerA, foodKey: blockedId },
    ],
    catalogFoodIds: [catalogId],
    myFoods: [{ id: myFoodId, userId: ownerA, deletedAt: null }],
    canonicalFavorites: [{ userId: ownerA, foodId: catalogId }],
    personalCorrectionCount: 2,
  };
}

describe("Plan 7 owner reconciliation report", () => {
  it("builds a repeatable read-only query over only required owner evidence", () => {
    const sql = buildOwnerFavoriteReconciliationReadSql();

    assert.match(sql, /begin\s+transaction\s+isolation\s+level\s+repeatable\s+read\s+read\s+only/i);
    assert.match(sql, /from\s+public\.user_food_favorites/i);
    assert.match(sql, /from\s+public\.food_items/i);
    assert.match(sql, /from\s+public\.user_food_items/i);
    assert.match(sql, /from\s+public\.food_favorites/i);
    assert.match(sql, /from\s+public\.food_personal_corrections/i);
    assert.match(sql, /rollback/i);
    assert.doesNotMatch(sql, /\b(insert|update|drop|alter|truncate)\b/i);
  });

  it("reports aggregate counts only by default and scopes canonical duplicates to the same owner", () => {
    const report = buildOwnerFavoriteReconciliationReport(snapshot());

    assert.deepEqual(report, {
      total: 5,
      catalog_mappable: 1,
      catalog_already_mapped: 1,
      my_food_preserved: 1,
      legacy_text_preserved: 1,
      blocked: 1,
      personal_correction_count: 2,
    });
    assert.equal(JSON.stringify(report).includes(ownerA), false);
    assert.equal(JSON.stringify(report).includes(ownerB), false);
    assert.equal(JSON.stringify(report).includes("greek yogurt"), false);
  });

  it("emits only stable opaque row identifiers in explicit diagnostic mode", () => {
    const report = buildOwnerFavoriteReconciliationReport(snapshot(), { diagnostic: true });

    assert.ok(Array.isArray(report.diagnostics));
    assert.equal(report.diagnostics.length, 5);
    for (const item of report.diagnostics) {
      assert.match(item.row_id, /^[0-9a-f]{64}$/);
      assert.ok(["catalog_mappable", "catalog_already_mapped", "my_food_preserved", "legacy_text_preserved", "blocked"].includes(item.disposition));
      assert.equal(JSON.stringify(item).includes(ownerA), false);
      assert.equal(JSON.stringify(item).includes(ownerB), false);
      assert.equal(JSON.stringify(item).includes("greek yogurt"), false);
    }
    assert.equal(
      report.diagnostics[0].row_id,
      stableFavoriteRowId(ownerA, catalogId),
    );
  });
});
