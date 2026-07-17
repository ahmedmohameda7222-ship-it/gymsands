import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFile = "20260717194847_muscle_intelligence_phase3_session_snapshots.sql";
const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8").toLowerCase();
const correctionFile = "20260717202151_muscle_intelligence_phase3_integrity_corrections.sql";
const correction = readFileSync(`supabase/migrations/${correctionFile}`, "utf8").toLowerCase();
const verification = readFileSync("supabase/verification/muscle-intelligence-phase3-session-snapshots.sql", "utf8").toLowerCase();
const quality = readFileSync(".github/workflows/quality.yml", "utf8").toLowerCase();
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; pendingCount: number; unresolvedCount: number };
  entries: Array<{ productionVersion?: string; productionName?: string; localFile: string; state: string }>;
};

describe("Muscle Intelligence Phase 3 migration contract", () => {
  it("is one forward transactional migration that preserves the existing roots", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("create table public.workout_session_muscle_snapshots");
    expect(migration).toContain("create table public.workout_session_muscle_snapshot_items");
    expect(migration).not.toMatch(/drop\s+(?:table|column|schema)/);
    expect(migration).not.toContain("create table public.workout_sessions");
    expect(migration).not.toContain("create table public.user_workout_plans");
  });

  it("freezes exactly once at performed-session insert and never name-matches identity", () => {
    expect(migration).toContain("constraint workout_session_muscle_snapshots_session_key unique (workout_session_id)");
    expect(migration).toContain("after insert on public.workout_sessions");
    expect(migration).toContain("on conflict (workout_session_id) do nothing");
    expect(migration).toContain("names are not accepted");
    expect(migration).not.toMatch(/(?:lower|btrim)\([^\n]*exercise_name[^\n]*=/);
    expect(verification).toContain("name-only replacement unexpectedly succeeded");
    expect(verification).toContain("start/resume did not preserve exactly one snapshot");
  });

  it("retains planned and actual mapping identities with guarded mutation", () => {
    for (const field of [
      "planned_mapping_set_id", "planned_mapping_version", "planned_mapping_checksum",
      "actual_mapping_set_id", "actual_mapping_version", "actual_mapping_checksum",
      "planned_custom_mapping_entries", "actual_custom_mapping_entries"
    ]) expect(migration).toContain(field);
    expect(migration).toContain("workout_session_muscle_snapshots_immutable");
    expect(migration).toContain("workout_session_muscle_snapshot_items_guard");
    expect(verification).toContain("completion lost planned or actual replacement identity");
    expect(verification).toContain("plan delete unexpectedly erased performed history");
    expect(correction).toContain("identity equality, not the latest mapping, defines an idempotent retry");
    expect(correction).toContain("workout_session_muscle_snapshot_items_planned_mapping_bundle_check");
    expect(correction).toContain("workout_session_muscle_snapshot_items_actual_mapping_bundle_check");
  });

  it("enforces owner read-only RLS, no anonymous privileges, and hardened RPC ACL", () => {
    expect(migration).toContain("workout_session_muscle_snapshots_member_select");
    expect(migration).toContain("workout_session_muscle_snapshot_items_member_select");
    expect(migration).toContain("revoke all on table public.workout_session_muscle_snapshots from public, anon, authenticated");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(verification).toContain("anonymous role has phase 3 table access");
    expect(verification).toContain("member has authoritative phase 3 table mutation access");
    expect(verification).toContain("cross-owner snapshot read unexpectedly succeeded");
    expect(correction).toContain("get_workout_session_frozen_global_mappings");
    expect(correction).toContain("mapping.status = 'published'");
    expect(correction).toContain("mapping.retired_at <= snapshot.frozen_at");
    expect(correction).toContain("not exists (select 1 from public.workout_sessions");
  });

  it("keeps the applied production identity exact and rehearsed in Quality", () => {
    expect(ledger.entries.find((entry) => entry.localFile === migrationFile)).toMatchObject({
      state: "applied",
      productionVersion: "20260717194847",
      productionName: "muscle_intelligence_phase3_session_snapshots"
    });
    expect(ledger).toMatchObject({
      productionMigrationCount: 39,
      pendingCount: 0,
      unresolvedCount: 0,
      historyRepair: { state: "reconciled", pendingCount: 0, unresolvedCount: 0 }
    });
    expect(quality).toContain("supabase/verification/muscle-intelligence-phase3-session-snapshots.sql");
    expect(verification.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("applies integrity corrections only through a second forward transaction", () => {
    expect(correction.trimStart().startsWith("begin;")).toBe(true);
    expect(correction.trimEnd().endsWith("commit;")).toBe(true);
    expect(correction).not.toMatch(/drop\s+(?:table|column|schema)/);
    expect(verification).toContain("identical replacement retry rewrote the frozen mapping version");
    expect(verification).toContain("account deletion did not remove owner-scoped snapshot history");
    expect(verification).toContain("custom exercise deletion erased compact historical interpretation");
    expect(ledger.entries.find((entry) => entry.localFile === correctionFile)).toMatchObject({
      state: "applied",
      productionVersion: "20260717202151",
      productionName: "muscle_intelligence_phase3_integrity_corrections"
    });
  });
});
