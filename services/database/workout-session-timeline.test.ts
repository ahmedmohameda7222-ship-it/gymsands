import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./workout-session-timeline.ts", import.meta.url), "utf8");
const workoutSessions = readFileSync(new URL("./workout-sessions.ts", import.meta.url), "utf8");
const privacyExport = readFileSync(new URL("../../lib/privacy/data-export.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../../types/workout-session-timeline.ts", import.meta.url), "utf8");

describe("workout session timeline service contract", () => {
  it("uses an owner/session-scoped ascending sequence cursor", () => {
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain('.eq("workout_session_id", workoutSessionId)');
    expect(service).toContain('.order("sequence_number", { ascending: true })');
    expect(service).toContain('.gt("sequence_number", afterSequence)');
    expect(service).toContain("MAX_TIMELINE_LIMIT = 200");
    expect(service).toContain("DEFAULT_TIMELINE_LIMIT = 50");
  });

  it("exports the required durable event and page types", () => {
    expect(types).toContain("export type WorkoutSessionTimelineEventType");
    expect(types).toContain("export type WorkoutSessionTimelineEventSource");
    expect(types).toContain("export type WorkoutSessionTimelinePayload");
    expect(types).toContain("export type WorkoutSessionTimelineEvent");
    expect(types).toContain("export type WorkoutSessionTimelinePage");
  });

  it("routes all AW-2C mutation surfaces through atomic RPC authorities", () => {
    expect(workoutSessions).toContain('rpc("upsert_workout_set_logs_atomic"');
    expect(workoutSessions).toContain('rpc("skip_workout_day_atomic"');
    expect(workoutSessions).toContain('rpc("cancel_workout_session_atomic"');
    expect(workoutSessions).toContain("startOrResumeDirectWorkoutSession");
    expect(workoutSessions).not.toContain('.from("workout_sessions").delete()');
    expect(workoutSessions).not.toContain('.from("workout_sessions").insert(');
  });

  it("exports meaningful timeline data without internal correlation fields", () => {
    const select = privacyExport.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";
    expect(select).toContain("workout_session_id");
    expect(select).toContain("sequence_number");
    expect(select).toContain("payload");
    expect(select).not.toContain("command_id");
    expect(select).not.toContain("idempotency_key");
  });
});
