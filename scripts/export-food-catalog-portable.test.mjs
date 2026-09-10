import { describe, expect, it } from "vitest";
import { buildSingleSnapshotPsqlProgram } from "./export-food-catalog-portable.mjs";

describe("Plan 7 authoritative export CLI SQL program", () => {
  it("uses one read-only REPEATABLE READ PostgreSQL transaction and snapshot-bound observations", () => {
    const sql = buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items", stableKey: ["id"] }],
    });
    expect(sql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sql).toContain("pg_export_snapshot()");
    expect(sql).toContain("supabase_migrations.schema_migrations");
    expect(sql).toContain("food_catalog_current_generation");
    expect(sql).toContain("release_schema_compatibility");
    expect(sql).toContain("COMMIT");
  });

  it("streams stable-key relation data without OFFSET pagination", () => {
    const sql = buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items", stableKey: ["id"] }],
    });
    expect(sql).toMatch(/COPY\s*\(/i);
    expect(sql).toMatch(/ORDER BY\s+"id"/i);
    expect(sql).not.toMatch(/\bOFFSET\b/i);
  });

  it("refuses relation identifiers or stable keys that are not SQL identifiers", () => {
    expect(() => buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items; drop table x", stableKey: ["id"] }],
    })).toThrow(/identifier/i);
  });
});
