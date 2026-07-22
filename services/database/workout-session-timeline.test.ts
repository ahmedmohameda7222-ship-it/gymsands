import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./workout-session-timeline.ts", import.meta.url), "utf8");
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
});
