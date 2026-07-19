import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFile = "20260717194847_muscle_intelligence_phase3_session_snapshots.sql";
const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const correctionFile = "20260717202151_muscle_intelligence_phase3_integrity_corrections.sql";
const correction = readFileSync(`supabase/migrations/${correctionFile}`, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const verificationEntrypoint = readFileSync("supabase/verification/muscle-intelligence-phase3-session-snapshots.sql", "utf8");
const verification = [
  verificationEntrypoint,
  "01-schema-plan-and-replacement.sql",
  "02-replacement-and-privacy.sql",
  "03-terminal-and-plan-lifecycle.sql",
  "04-direct-privacy-and-cleanup.sql"
].map((file, index) => index === 0
  ? file
  : readFileSync(`supabase/verification/muscle-intelligence-phase3-session-snapshots/${file}`, "utf8"))
  .join("\n")
  .toLowerCase();
type LedgerEntry = {
  productionVersion?: string;
  productionName?: string;
  localFile: string;
  state: string;
};
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; pendingCount: number; unresolvedCount: number };
  entries: LedgerEntry[];
};
const expectedCorrectionEntries = [
  {
    localFile: "20260717215400_muscle_intelligence_phase3_account_deletion_authority.sql",
    productionVersion: "20260717215400",
    productionName: "muscle_intelligence_phase3_account_deletion_authority"
  },
  {
    localFile: "20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections.sql",
    productionVersion: "20260717215500",
    productionName: "muscle_intelligence_phase3_lifecycle_provider_corrections"
  },
  {
    localFile: "20260717215600_muscle_intelligence_phase3_direct_session_authority.sql",
    productionVersion: "20260717215600",
    productionName: "muscle_intelligence_phase3_direct_session_authority"
  },
  {
    localFile: "20260717215700_muscle_intelligence_phase3_replacement_repair_hardening.sql",
    productionVersion: "20260717215700",
    productionName: "muscle_intelligence_phase3_replacement_repair_hardening"
  },
  {
    localFile: "20260717215800_muscle_intelligence_phase3_plan_session_start_authority.sql",
    productionVersion: "20260717215800",
    productionName: "muscle_intelligence_phase3_plan_session_start_authority"
  },
  {
    localFile: "20260717215900_muscle_intelligence_phase3_set_log_completion_authority.sql",
    productionVersion: "20260717215900",
    productionName: "muscle_intelligence_phase3_set_log_completion_authority"
  }
] as const;

function exactLedgerEntry(localFile: string) {
  const entries = ledger.entries.filter((entry) => entry.localFile === localFile);
  expect(entries, localFile).toHaveLength(1);
  return entries[0]!;
}

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
    expect(verification).toContain("public can execute reviewed phase 3 rpc");
    expect(correction).toContain("get_workout_session_frozen_global_mappings");
    expect(correction).toContain("mapping.status = 'published'");
    expect(correction).toContain("mapping.retired_at <= snapshot.frozen_at");
    expect(correction).toContain("not exists (select 1 from public.workout_sessions");
  });

  it("keeps applied identities exact and classifies all reviewed correction migrations", () => {
    expect(exactLedgerEntry(migrationFile)).toMatchObject({
      state: "applied",
      productionVersion: "20260717194847",
      productionName: "muscle_intelligence_phase3_session_snapshots"
    });
    expect(exactLedgerEntry(correctionFile)).toMatchObject({
      state: "applied",
      productionVersion: "20260717202151",
      productionName: "muscle_intelligence_phase3_integrity_corrections"
    });

    const correctionEntries = expectedCorrectionEntries.map((expected) => {
      const entry = exactLedgerEntry(expected.localFile);
      expect(["pending", "applied"], expected.localFile).toContain(entry.state);
      if (entry.state === "applied") {
        expect(entry).toMatchObject(expected);
      } else {
        expect(entry.productionVersion, `${expected.localFile} pending productionVersion`).toBeUndefined();
        expect(entry.productionName, `${expected.localFile} pending productionName`).toBeUndefined();
      }
      return entry;
    });
    const pendingCorrectionCount = correctionEntries.filter((entry) => entry.state === "pending").length;
    const appliedCorrectionCount = correctionEntries.filter((entry) => entry.state === "applied").length;

    expect(ledger.productionMigrationCount).toBe(ledger.entries.filter((entry) => entry.state === "applied").length);
    expect(ledger.pendingCount).toBe(pendingCorrectionCount);
    expect(ledger.unresolvedCount).toBe(pendingCorrectionCount);
    expect(ledger.historyRepair.pendingCount).toBe(pendingCorrectionCount);
    expect(ledger.historyRepair.unresolvedCount).toBe(pendingCorrectionCount);
    expect(ledger.historyRepair.state).toBe(pendingCorrectionCount > 0 ? "pending" : "reconciled");
    expect(pendingCorrectionCount + appliedCorrectionCount).toBe(expectedCorrectionEntries.length);

    expect(verificationEntrypoint.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("applies integrity corrections only through forward transactions", () => {
    expect(correction.trimStart().startsWith("begin;")).toBe(true);
    expect(correction.trimEnd().endsWith("commit;")).toBe(true);
    expect(correction).not.toMatch(/drop\s+(?:table|column|schema)/);
    expect(verification).toContain("identical replacement retry rewrote the frozen mapping version");
    expect(verification).toContain("authoritative account-data purge did not remove owner-scoped application data");
    expect(verification).toContain("auth deletion did not complete after the authoritative application-data purge");
    expect(verification).toContain("custom exercise deletion erased copied historical interpretation");
  });
});
