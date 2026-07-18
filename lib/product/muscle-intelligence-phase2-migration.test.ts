import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaPath = "supabase/migrations/20260717051008_muscle_intelligence_phase2_curated_schema.sql";
const seedPath = "supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql";
const schema = readFileSync(schemaPath, "utf8").toLowerCase();
const seed = readFileSync(seedPath, "utf8").toLowerCase();
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  schemaVerifiedUntrackedCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; schemaAppliedUntrackedCount: number; pendingCount: number; unresolvedCount: number };
  entries: Array<{ productionVersion?: string; productionName?: string; localFile: string; state: string }>;
};

const phase2Tables = [
  "exercise_localizations",
  "exercise_aliases",
  "exercise_relationships",
  "exercise_research_sources",
  "exercise_mapping_evidence",
  "exercise_mapping_reviews"
];

describe("Muscle Intelligence Phase 2 migration safety", () => {
  it("keeps the schema migration transactional, additive, RLS-protected, and explicitly granted", () => {
    expect(schema.trimStart().startsWith("begin;")).toBe(true);
    expect(schema.trimEnd().endsWith("commit;")).toBe(true);
    expect(schema).not.toMatch(/drop\s+(?:table|column|function|schema)/);

    for (const table of phase2Tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
  });

  it("keeps member reads narrow and global writes admin or service controlled", () => {
    expect(schema).toContain("exercise_localizations_member_select");
    expect(schema).toContain("exercise_aliases_member_select");
    expect(schema).toContain("exercise_relationships_member_select");
    expect(schema).toContain("exercise_mapping_reviews_admin_all");
    expect(schema).toContain("(select private.is_admin())");
    expect(schema).not.toContain("to anon");
  });

  it("keeps the historical seed transactional and publishes mappings through database authority", () => {
    expect(seed.trimStart().startsWith("begin;")).toBe(true);
    expect(seed.trimEnd().endsWith("commit;")).toBe(true);
    expect(seed).toContain("perform public.publish_exercise_muscle_mapping_set(target.id)");
    expect(seed).not.toMatch(/update\s+public\.exercise_muscle_mapping_sets[\s\S]{0,300}set\s+status\s*=\s*'published'/);
    expect(seed).toContain("phase 2 modified non-target or user-owned data");
    expect(seed).toContain("the retired legacy target catalog must remain empty");
  });

  it("records both historical migrations as applied without coupling the living registry to seed row counts", () => {
    const schemaEntry = ledger.entries.find((entry) => entry.localFile === schemaPath.split("/").at(-1));
    const seedEntry = ledger.entries.find((entry) => entry.localFile === seedPath.split("/").at(-1));
    const appliedEntries = ledger.entries.filter((entry) => entry.state === "applied");
    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
    const expectedReconciliationState = pendingEntries.length > 0 ? "pending" : "reconciled";

    expect(schemaEntry).toMatchObject({
      state: "applied",
      productionVersion: "20260717051008",
      productionName: "muscle_intelligence_phase2_curated_schema"
    });
    expect(seedEntry).toMatchObject({
      state: "applied",
      productionVersion: "20260717051011",
      productionName: "muscle_intelligence_phase2_curated_seed"
    });
    expect(ledger.productionMigrationCount).toBe(appliedEntries.length);
    expect(ledger.schemaVerifiedUntrackedCount).toBe(0);
    expect(ledger.pendingCount).toBe(pendingEntries.length);
    expect(ledger.unresolvedCount).toBe(ledger.pendingCount);
    expect(ledger.historyRepair).toMatchObject({
      state: expectedReconciliationState,
      schemaAppliedUntrackedCount: 0,
      pendingCount: ledger.pendingCount,
      unresolvedCount: ledger.unresolvedCount
    });
  });
});
