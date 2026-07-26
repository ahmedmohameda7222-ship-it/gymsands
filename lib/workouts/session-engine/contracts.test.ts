import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVITY_TIMER_DURATION_SECONDS,
  sessionCommandTypes,
  validateSessionCommandIntent,
  validateSessionCommandRequest
} from "./contracts";
import { fixtureIds } from "./fixtures";

describe("AW-4 pure engine contract", () => {
  it("contains the complete current and AW-4 command set", () => {
    expect(sessionCommandTypes).toEqual([
      "move_cursor",
      "complete_set_transition",
      "start_rest",
      "clear_rest",
      "reset_timer",
      "pause",
      "resume",
      "import_legacy_cache",
      "start_activity_timer",
      "clear_activity_timer",
      "reset_activity_timer"
    ]);
    expect(MAX_ACTIVITY_TIMER_DURATION_SECONDS).toBe(86_400);
  });

  it("keeps the pure engine free of React, Supabase, browser, and service authority", () => {
    for (const file of [
      "contracts.ts",
      "commands.ts",
      "invariants.ts",
      "reducer.ts",
      "timers.ts",
      "selectors.ts",
      "fixtures.ts"
    ]) {
      const source = readFileSync(`lib/workouts/session-engine/${file}`, "utf8");
      expect(source).not.toMatch(/from ["']react|from ["']next|supabase|localStorage|window\.|document\.|services\/database/);
    }
    expect(readFileSync("lib/workouts/session-engine/reducer.ts", "utf8")).not.toContain("Date.now");
  });

  it("validates every command payload with exact keys and bounded values", () => {
    expect(() => validateSessionCommandIntent({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      commandId: fixtureIds.commandId,
      commandType: "start_activity_timer",
      payload: {
        kind: "block",
        duration_seconds: 86_400,
        controller_device_id: null
      }
    })).not.toThrow();
    for (const invalid of [
      {
        commandType: "start_activity_timer",
        payload: { kind: "block", duration_seconds: null, controller_device_id: null }
      },
      {
        commandType: "clear_activity_timer",
        payload: { completion_reason: "expired", controller_device_id: null }
      },
      {
        commandType: "clear_rest",
        payload: {
          view_state: "set_entry",
          completion_reason: "restarted",
          controller_device_id: null
        }
      },
      {
        commandType: "pause",
        payload: { controller_device_id: null, unexpected: true }
      }
    ]) {
      expect(() => validateSessionCommandIntent({
        userId: fixtureIds.userId,
        workoutSessionId: fixtureIds.sessionId,
        commandId: fixtureIds.commandId,
        ...invalid
      })).toThrow(/invalid|bounded|keys/i);
    }
  });

  it("rejects malformed command identities, revisions, and legacy timestamps", () => {
    expect(() => validateSessionCommandIntent({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      commandId: "not-a-command-id",
      commandType: "pause",
      payload: { controller_device_id: null }
    })).toThrow(/identity/i);
    expect(() => validateSessionCommandRequest({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      commandId: fixtureIds.commandId,
      expectedRevision: -1,
      commandType: "pause",
      payload: { controller_device_id: null }
    })).toThrow(/revision/i);
    expect(() => validateSessionCommandIntent({
      userId: fixtureIds.userId,
      workoutSessionId: fixtureIds.sessionId,
      commandId: fixtureIds.commandId,
      commandType: "import_legacy_cache",
      payload: {
        cached_started_at: "not-a-timestamp",
        cached_rest_ends_at: null,
        cached_rest_duration_seconds: null,
        controller_device_id: null
      }
    })).toThrow(/timestamp/i);
  });
});
