import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFile = "20260717194847_muscle_intelligence_phase3_session_snapshots.sql";
const correctionFile = "20260717202151_muscle_intelligence_phase3_integrity_corrections.sql";
const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8").toLowerCase();
const correction = readFileSync(`supabase/migrations/${correctionFile}`, "utf8").toLowerCase();
const verification = readFileSync("supabase/verification/muscle-intelligence-phase3.sql", "utf8").toLowerCase();
const verificationEntrypoint = readFileSync("supabase/verification/muscle-intelligence-phase3-concurrency.sql", "utf8").toLowerCase();
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; pendingCount: number; unresolvedCount: number };
  entries: Array<{
    localFile: string;
    state: string;
    productionVersion?: string;
    productionName?: string;
  }>;
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
  const matches = ledger.entries.filter((entry) => entry.localFile === localFile);
  expect(matches, `ledger entries for ${localFile}`).toHaveLength(1);
  return matches[0];
}

describe("Muscle Intelligence Phase 3 migration contract", () => {
  it("is one forward transactional migration that preserves the existing roots", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("create table if not exists public.workout_session_exercise_mappings");
    expect(migration).toContain("create table if not exists public.workout_set_performance_details");
    expect(migration).toContain("create table if not exists public.workout_session_muscle_metrics");
    expect(migration).toContain("create table if not exists public.user_muscle_training_status");
    expect(migration).not.toMatch(/drop\s+(?:table|column|schema)/);
  });

  it("freezes exactly once at performed-session insert and never name-matches identity", () => {
    expect(migration).toContain("create or replace function private.freeze_workout_session_exercise_mapping_v1");
    expect(migration).toContain("create trigger freeze_workout_session_exercise_mapping_v1");
    expect(migration).toContain("after insert on public.workout_session_exercises");
    expect(migration).toContain("new.exercise_id");
    expect(migration).toContain("new.custom_exercise_id");
    expect(migration).not.toMatch(/lower\s*\(.*name/);
    expect(migration).not.toMatch(/ilike/);
  });

  it("retains planned and actual mapping identities with guarded mutation", () => {
    expect(migration).toContain("planned_exercise_id");
    expect(migration).toContain("planned_custom_exercise_id");
    expect(migration).toContain("actual_exercise_id");
    expect(migration).toContain("actual_custom_exercise_id");
    expect(migration).toContain("replacement_reason");
    expect(migration).toContain("replacement_at");
    expect(migration).toContain("create or replace function private.guard_workout_session_exercise_mapping_v1");
    expect(migration).toContain("create trigger guard_workout_session_exercise_mapping_v1");
  });

  it("enforces owner read-only RLS, no anonymous privileges, and hardened RPC ACL", () => {
    for (const table of [
      "workout_session_exercise_mappings",
      "workout_set_performance_details",
      "workout_session_muscle_metrics",
      "user_muscle_training_status"
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon`);
    }
    expect(migration).toContain("revoke all on function public.update_user_muscle_training_status(uuid,uuid,date) from public");
    expect(migration).toContain("grant execute on function public.update_user_muscle_training_status(uuid,uuid,date) to authenticated, service_role");
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
    const totalPendingCount = ledger.entries.filter((entry) => entry.state === "pending").length;
    const totalDriftReviewCount = ledger.entries.filter((entry) => entry.state === "ledger_drift_review").length;
    const totalUnresolvedCount = totalPendingCount + totalDriftReviewCount;

    expect(ledger.productionMigrationCount).toBe(ledger.entries.filter((entry) => entry.state === "applied").length);
    expect(ledger.pendingCount).toBe(totalPendingCount);
    expect(ledger.unresolvedCount).toBe(totalUnresolvedCount);
    expect(ledger.historyRepair.pendingCount).toBe(totalPendingCount);
    expect(ledger.historyRepair.unresolvedCount).toBe(totalUnresolvedCount);
    expect(ledger.historyRepair.state).toBe(totalUnresolvedCount > 0 ? "pending" : "reconciled");
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
