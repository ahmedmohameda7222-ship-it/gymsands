import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDisposableRestoreTarget,
  buildExactRestoreRowSql,
  buildPreseedValidationSql,
  decodeCanonicalSegmentRow,
  buildTransitionalFoodItemsStages,
} from "./restore-food-catalog-portable.mjs";

const row = '[["amount","numeric","90071992547409931234567890.1200"],["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["label","text","null"],["optional","text",null],["verified_source_record_id","uuid","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]]';

describe("Plan 7 disposable restore CLI primitives", () => {
  it("decodes canonical rows without converting typed scalar text into JavaScript numbers", () => {
    const decoded = decodeCanonicalSegmentRow(row);
    assert.deepEqual(decoded.amount, { pgType: "numeric", text: "90071992547409931234567890.1200" });
    assert.deepEqual(decoded.label, { pgType: "text", text: "null" });
    assert.deepEqual(decoded.optional, { pgType: "text", text: null });
  });

  it("hex-encodes scalar material and makes conflicting stable IDs fail instead of overwriting", () => {
    const sql = buildExactRestoreRowSql({
      relation: "food_items",
      stableKey: ["id"],
      targetColumns: {
        amount: "numeric",
        id: "uuid",
        label: "text",
        optional: "text",
        verified_source_record_id: "uuid",
      },
      canonicalRow: row,
    });
    assert.ok(sql.includes("ON CONFLICT"));
    assert.ok(sql.includes("DO NOTHING"));
    assert.match(sql, /RAISE EXCEPTION.*conflict/i);
    assert.ok(!sql.includes("90071992547409931234567890.1200"));
    assert.ok(!sql.includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
    assert.ok(sql.includes("decode("));
  });

  it("validates migration-seeded rows without INSERT, UPDATE, UPSERT or DELETE", () => {
    const sql = buildPreseedValidationSql({
      relation: "release_schema_compatibility",
      stableKey: ["singleton"],
      targetColumns: { singleton: "boolean", version: "integer", migration_version: "text" },
      canonicalRow: '[["migration_version","text","20260724232734"],["singleton","boolean","true"],["version","integer","2"]]',
    });
    assert.match(sql, /SELECT|PERFORM|IF/i);
    assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bUPSERT\b/i);
  });

  it("neutralizes only verified_source_record_id for food_items, then reconstructs it after source records", () => {
    const stages = buildTransitionalFoodItemsStages({
      stableKey: ["id"],
      targetColumns: {
        amount: "numeric",
        id: "uuid",
        label: "text",
        optional: "text",
        verified_source_record_id: "uuid",
      },
      canonicalRow: row,
    });
    assert.ok(stages.initialSql.includes("verified_source_record_id"));
    assert.match(stages.initialSql, /NULL/);
    assert.ok(stages.reconstructSql.includes("verified_source_record_id"));
    assert.deepEqual(stages.reconstructAfterRelations, ["food_source_records"]);
  });

  it("requires an explicit disposable-target acknowledgement and rejects provider production hosts", () => {
    assert.throws(() => assertDisposableRestoreTarget("postgresql://localhost:5432/restore", false), /disposable/i);
    assert.throws(() => assertDisposableRestoreTarget("postgresql://project.supabase.co:5432/postgres", true), /production|provider/i);
    assert.doesNotThrow(() => assertDisposableRestoreTarget("postgresql://127.0.0.1:55432/restore", true));
  });
});
