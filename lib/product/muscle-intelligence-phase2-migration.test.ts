import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaPath = "supabase/migrations/20260717051008_muscle_intelligence_phase2_curated_schema.sql";
const seedPath = "supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql";
const verificationPath = "supabase/verification/muscle-intelligence-phase2.sql";
const schema = readFileSync(schemaPath, "utf8").toLowerCase();
const seed = readFileSync(seedPath, "utf8").toLowerCase();
const verification = readFileSync(verificationPath, "utf8").toLowerCase();
const quality = readFileSync(".github/workflows/quality.yml", "utf8");
const registry = JSON.parse(readFileSync("data/muscle-intelligence/v1/registry.json", "utf8")) as {
  exercises: Array<{ exercise_id: string; mapping_set_id: string; mapping_checksum: string; provider_decision: { status: string; provider_activity_id?: string } }>;
  relationships: unknown[];
};
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  schemaVerifiedUntrackedCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; schemaAppliedUntrackedCount: number; pendingCount: number; unresolvedCount: number };
  entries: Array<{ productionVersion?: string; productionName?: string; localFile: string; state: string }>;
};

const phase2Tables = [
  "exercise_localizations", "exercise_aliases", "exercise_relationships", "exercise_research_sources",
  "exercise_mapping_evidence", "exercise_mapping_reviews"
];

describe("Muscle Intelligence Phase 2 migration contract", () => {
  it("adds exactly the six normalized curation tables with RLS and no destructive DDL", () => {
    expect(schema.trimStart().startsWith("begin;")).toBe(true);
    expect(schema.trimEnd().endsWith("commit;")).toBe(true);
    expect(schema).not.toMatch(/drop\s+(?:table|column|function|schema)/);
    for (const table of phase2Tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
  });

  it("keeps member reads narrow and all writes admin/service controlled", () => {
    expect(schema).toContain("exercise_localizations_member_select");
    expect(schema).toContain("exercise_aliases_member_select");
    expect(schema).toContain("exercise_relationships_member_select");
    expect(schema).toContain("exercise_mapping_reviews_admin_all");
    expect(schema).toContain("(select private.is_admin())");
    expect(schema).not.toContain("to anon");
    expect(verification).toContain("internal phase 2 research or review data leaked to a member");
    expect(verification).toContain("member phase 2 write unexpectedly succeeded");
  });

  it("seeds every deterministic authority identity and checksum exactly once", () => {
    expect(seed.trimStart().startsWith("begin;")).toBe(true);
    expect(seed.trimEnd().endsWith("commit;")).toBe(true);
    for (const exercise of registry.exercises) {
      expect(seed).toContain(exercise.exercise_id);
      expect(seed).toContain(exercise.mapping_set_id);
      expect(seed).toContain(exercise.mapping_checksum);
    }
    for (const exercise of registry.exercises.filter((item) => item.provider_decision.status === "verified_exact_match")) {
      expect(seed).toContain(exercise.provider_decision.provider_activity_id!.toLowerCase());
    }
    expect(registry.exercises.filter((exercise) => exercise.provider_decision.status === "verified_exact_match")).toHaveLength(9);
    expect(registry.relationships).toHaveLength(32);
  });

  it("publishes only through the atomic function and proves preservation/count postconditions", () => {
    expect(seed).toContain("perform public.publish_exercise_muscle_mapping_set(target.id)");
    expect(seed).not.toMatch(/update\s+public\.exercise_muscle_mapping_sets[\s\S]{0,300}set\s+status\s*=\s*'published'/);
    expect(seed).toContain("exactly 60 published mappings and zero target drafts");
    expect(seed).toContain("phase 2 modified non-target or user-owned data");
    expect(seed).toContain("the retired legacy target catalog must remain empty");
    expect(verification).toContain("published phase 2 mapping unexpectedly mutable");
  });

  it("rehearses Phase 2 in the authoritative database quality path", () => {
    expect(quality).toContain("supabase/verification/muscle-intelligence-phase2.sql");
    expect(quality).toContain("npm run registry:phase2:seed:check");
    expect(verification.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("keeps both Phase 2 migrations applied while later migration state remains truthfully classified", () => {
    const schemaEntry = ledger.entries.find((entry) => entry.localFile === schemaPath.split("/").at(-1));
    const seedEntry = ledger.entries.find((entry) => entry.localFile === seedPath.split("/").at(-1));
    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");

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
    expect(ledger.productionMigrationCount).toBe(39);
    expect(ledger.schemaVerifiedUntrackedCount).toBe(0);
    expect(ledger.pendingCount).toBe(pendingEntries.length);
    expect(ledger.unresolvedCount).toBe(ledger.pendingCount);
    expect(ledger.historyRepair).toMatchObject({
      state: "pending",
      schemaAppliedUntrackedCount: 0,
      pendingCount: ledger.pendingCount,
      unresolvedCount: ledger.unresolvedCount
    });
  });
});
