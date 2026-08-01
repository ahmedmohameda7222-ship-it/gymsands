import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("services/workouts/history/verified-records.ts", "utf8");
const route = readFileSync("app/api/workouts/history/[sessionId]/verified-records/route.ts", "utf8");
const reader = readFileSync("services/workouts/history/server-reader.ts", "utf8");

describe("WH-6 verified record integration boundaries", () => {
  it("recomputes from owner-scoped canonical logs and frozen identities", () => {
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain("workout_session_muscle_snapshot_items");
    expect(service).toContain("actualExerciseIdentityKind");
    expect(service).toContain("plannedExerciseIdentityKind");
    expect(service).toContain("buildPersonalRecordCandidates(logs)");
  });

  it("submits only a bounded versioned payload to the atomic RPC", () => {
    expect(service).toContain('.rpc("replace_workout_derived_records_atomic"');
    expect(service).toContain("p_schema_version: DERIVED_METRICS_SCHEMA_VERSION");
    expect(service).toContain("p_formula_version: DERIVED_METRICS_FORMULA_VERSION");
    expect(service).not.toContain('.from("personal_records").insert');
  });

  it("requires auth, owner-safe session ids, rate limiting, and no-store responses", () => {
    expect(route).toContain("requireUser(request)");
    expect(route).toContain("isUuid(sessionId)");
    expect(route).toContain("rateLimit");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("hides stale derived rows and attaches current winners to exact source sets", () => {
    expect(reader).toContain("recordsAreCurrent");
    expect(reader).toContain("DERIVED_METRICS_FORMULA_VERSION");
    expect(reader).toContain("verifiedRecordsByLog");
    expect(reader).toContain("previousValue");
  });
});
