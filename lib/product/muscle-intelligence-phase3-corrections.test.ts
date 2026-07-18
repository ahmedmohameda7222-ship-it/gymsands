import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrations = [
  "supabase/migrations/20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections.sql",
  "supabase/migrations/20260717215600_muscle_intelligence_phase3_direct_session_authority.sql",
  "supabase/migrations/20260717215700_muscle_intelligence_phase3_replacement_repair_hardening.sql",
  "supabase/migrations/20260717215800_muscle_intelligence_phase3_plan_session_start_authority.sql"
];

function gitBlobSha(content: Buffer) {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

describe("Phase 3 required corrections", () => {
  it("preserves both already-applied Phase 3 migrations byte-for-byte", () => {
    expect(gitBlobSha(readFileSync("supabase/migrations/20260717194847_muscle_intelligence_phase3_session_snapshots.sql")))
      .toBe("865f918091fbb9cf054e170417caaf384c65f049");
    expect(gitBlobSha(readFileSync("supabase/migrations/20260717202151_muscle_intelligence_phase3_integrity_corrections.sql")))
      .toBe("af02da43e4d61f9248ad6110b9e58f99cac84560");
  });

  it("uses only explicit transactional forward corrections", () => {
    expect(migrations).toHaveLength(4);
    for (const path of migrations) {
      const sql = readFileSync(path, "utf8").toLowerCase();
      expect(sql.trimStart().startsWith("begin;")).toBe(true);
      expect(sql.trimEnd().endsWith("commit;")).toBe(true);
      expect(sql).toContain("$preflight$");
      expect(sql).toContain("$postconditions$");
      expect(sql).not.toMatch(/drop\s+(?:table|column|schema)/);
      expect(sql).not.toContain("update public.release_schema_compatibility");
    }
  });

  it("covers lifecycle, provider, direct-session, eligibility, proven repair, and plan-session authority", () => {
    const sql = migrations.map((path) => readFileSync(path, "utf8").toLowerCase()).join("\n");
    for (const required of [
      "terminal_insert",
      "freeze_workout_session_muscle_snapshot_on_started_transition",
      "provider_bridge_unavailable",
      "start_or_resume_direct_workout_session_atomic",
      "get_workout_replacement_candidate_eligibility",
      "workout_sessions_one_active_direct_session_uidx",
      "phase3_terminal_insert_repairs",
      "direct workout sessions must use the authoritative start operation",
      "start_or_resume_workout_session_atomic(uuid, uuid, uuid)",
      "security definer set search_path = ''"
    ]) expect(sql).toContain(required);
  });
});
