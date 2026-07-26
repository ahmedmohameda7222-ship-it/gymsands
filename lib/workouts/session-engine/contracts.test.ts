import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ACTIVITY_TIMER_DURATION_SECONDS, sessionCommandTypes } from "./contracts";

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
});
