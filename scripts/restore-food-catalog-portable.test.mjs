import { describe, expect, it } from "vitest";
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
    expect(decoded.amount).toEqual({ pgType: "numeric", text: "90071992547409931234567890.1200" });
    expect(decoded.label).toEqual({ pgType: "text", text: "null" });
    expect(decoded.optional).toEqual({ pgType: "text", text: null });
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
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO NOTHING");
    expect(sql).toMatch(/RAISE EXCEPTION.*conflict/i);
    expect(sql).not.toContain("90071992547409931234567890.1200");
    expect(sql).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(sql).toContain("decode(");
  });

  it("validates migration-seeded rows without INSERT, UPDATE, UPSERT or DELETE", () => {
    const sql = buildPreseedValidationSql({
      relation: "release_schema_compatibility",
      stableKey: ["singleton"],
      targetColumns: { singleton: "boolean", version: "integer", migration_version: "text" },
      canonicalRow: '[["migration_version","text","20260724232734"],["singleton","boolean","true"],["version","integer","2"]]',
    });
    expect(sql).toMatch(/SELECT|PERFORM|IF/i);
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bUPSERT\b/i);
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
    expect(stages.initialSql).toContain("verified_source_record_id");
    expect(stages.initialSql).toMatch(/NULL/);
    expect(stages.reconstructSql).toContain("verified_source_record_id");
    expect(stages.reconstructAfterRelations).toEqual(["food_source_records"]);
  });

  it("requires an explicit disposable-target acknowledgement and rejects provider production hosts", () => {
    expect(() => assertDisposableRestoreTarget("postgresql://localhost:5432/restore", false)).toThrow(/disposable/i);
    expect(() => assertDisposableRestoreTarget("postgresql://project.supabase.co:5432/postgres", true)).toThrow(/production|provider/i);
    expect(() => assertDisposableRestoreTarget("postgresql://127.0.0.1:55432/restore", true)).not.toThrow();
  });
});
