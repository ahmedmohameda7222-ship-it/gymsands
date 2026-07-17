import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260717032851_retire_legacy_600_exercise_catalog.sql";
const verificationPath = "supabase/verification/legacy-600-exercise-catalog-retirement.sql";
const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const verification = readFileSync(verificationPath, "utf8").toLowerCase();
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  pendingCount: number;
  schemaVerifiedUntrackedCount: number;
  unresolvedCount: number;
  historyRepair: { state: string };
  entries: Array<{ productionVersion?: string; productionName?: string; localFile: string; state: string }>;
};

describe("legacy 600-exercise catalog retirement migration", () => {
  it("is one forward-only provenance-based transaction", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("source = 'plaivra_legacy_workouts'");
    expect(migration).toContain("notes ilike 'real fitlife exercise library seed%'");
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.exercises\s*;/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.workouts\s*;/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.exercise_library\s*;/);
  });

  it("fails closed unless all three exact 600-row layers and provenance links are present", () => {
    expect(migration).toContain("target_exercise_count <> 600");
    expect(migration).toContain("target_workout_count <> 600");
    expect(migration).toContain("target_library_count <> 600");
    expect(migration).toContain("count(distinct legacy_workout_id)");
    expect(migration).toContain("linked_count <> 600");
    expect(migration).toContain("is_global is distinct from true");
    expect(migration).toContain("is_approved is distinct from true");
  });

  it("protects user, provider-link, mapping, plan, session, favorite, and video references", () => {
    for (const table of [
      "user_workout_plan_block_items",
      "user_workout_plan_exercises",
      "workout_sessions",
      "workout_exercises",
      "user_exercise_favorites",
      "user_exercise_videos",
      "exercise_provider_links",
      "exercise_muscle_mapping_sets"
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("user-owned workout or custom-exercise data changed");
  });

  it("deletes only the three legacy layers and verifies non-target preservation", () => {
    const exerciseDelete = migration.indexOf("delete from public.exercises");
    const libraryDelete = migration.indexOf("delete from public.exercise_library");
    const workoutDelete = migration.indexOf("delete from public.workouts");
    expect(exerciseDelete).toBeGreaterThan(-1);
    expect(libraryDelete).toBeGreaterThan(exerciseDelete);
    expect(workoutDelete).toBeGreaterThan(libraryDelete);
    expect(migration).toContain("non-target exercises changed");
    expect(migration).toContain("non-target workouts changed");
    expect(migration).toContain("non-target exercise_library rows changed");
    expect(migration).toContain("legacy 600-exercise catalog retirement postcondition failed");
  });

  it("has executable zero-target verification", () => {
    expect(verification.trimStart().startsWith("begin;")).toBe(true);
    expect(verification.trimEnd().endsWith("rollback;")).toBe(true);
    expect(verification).toContain("expected zero retired legacy canonical exercises");
    expect(verification).toContain("expected zero retired legacy workouts");
    expect(verification).toContain("expected zero retired legacy exercise_library rows");
  });

  it("keeps the retirement applied while later migration state remains truthfully classified", () => {
    const entry = ledger.entries.find((item) => item.productionVersion === "20260717032851");
    const pendingEntries = ledger.entries.filter((item) => item.state === "pending");
    expect(entry).toEqual(expect.objectContaining({
      productionName: "retire_legacy_600_exercise_catalog",
      localFile: "20260717032851_retire_legacy_600_exercise_catalog.sql",
      state: "applied"
    }));
    expect(ledger.productionMigrationCount).toBe(39);
    expect(ledger.pendingCount).toBe(pendingEntries.length);
    expect(ledger.schemaVerifiedUntrackedCount).toBe(0);
    expect(ledger.unresolvedCount).toBe(ledger.pendingCount);
    expect(ledger.historyRepair.state).toBe("reconciled");
  });
});
