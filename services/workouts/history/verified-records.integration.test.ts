import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("services/workouts/history/verified-records.ts", "utf8");
const route = readFileSync("app/api/workouts/history/[sessionId]/verified-records/route.ts", "utf8");
const reader = readFileSync("services/workouts/history/server-reader.ts", "utf8");
const personalRecordsService = readFileSync("services/personal-records/server.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260801201500_workout_history_verified_record_rebuild.sql",
  "utf8",
);
const redesignMigration = readFileSync(
  "supabase/migrations/20260813071926_workout_history_redesign_read_contract.sql",
  "utf8",
);

describe("WH-6 verified record integration boundaries", () => {
  it("recomputes from owner-scoped canonical logs and frozen identities", () => {
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain("workout_session_muscle_snapshot_items");
    expect(service).toContain("actualExerciseIdentityKind");
    expect(service).toContain("plannedExerciseIdentityKind");
    expect(service).toContain("derivedExerciseIdentityParts");
  });

  it("rebuilds the complete affected history in deterministic chronology", () => {
    expect(service).toContain("discoverCandidateSessionIds");
    expect(service).toContain("effectiveAt(left) - effectiveAt(right)");
    expect(service).toContain("buildPersonalRecordCandidates(current, historicalLogs)");
    expect(service).toContain("historicalLogs.push(...current)");
    expect(service).toContain(
      '.rpc(\n    "replace_workout_derived_records_for_identities_atomic"',
    );
  });

  it("submits only a bounded versioned payload to the service-owned atomic RPC", () => {
    expect(service).toContain("MAX_AFFECTED_IDENTITIES = 100");
    expect(service).toContain("p_schema_version: DERIVED_METRICS_SCHEMA_VERSION");
    expect(service).toContain("p_formula_version: DERIVED_METRICS_FORMULA_VERSION");
    expect(service).not.toContain('.from("personal_records").insert');
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
  });

  it("requires auth, owner-safe session ids, rate limiting, and no-store responses", () => {
    expect(route).toContain("requireUser(request)");
    expect(route).toContain("isUuid(sessionId)");
    expect(route).toContain("rateLimit");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain("createSupabaseServerClient(null, true)");
  });

  it("hides stale derived rows and attaches current winners to exact source sets", () => {
    expect(reader).toContain("readWorkoutHistoryPersonalRecordSessions");
    expect(reader).not.toContain("current_personal_records");
    expect(personalRecordsService).toContain("get_workout_history_pr_projection_inputs_v1");
    expect(redesignMigration).toContain("get_workout_history_pr_projection_inputs_v1");
    expect(reader).toContain("verifiedRecordsByLog");
    expect(reader).toContain("sourceExerciseLogId");
  });
});
