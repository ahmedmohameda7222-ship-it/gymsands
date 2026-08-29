import { describe, expect, it } from "vitest";

import { parseCookingVoiceCommand } from "@/lib/nutrition-v1/cooking-voice";

describe("Nutrition V1 deterministic Cooking Mode voice parser", () => {
  it.each([
    ["next", "next"],
    [" NEXT. ", "next"],
    ["back", "back"],
    ["repeat", "repeat"],
    ["start timer", "start_timer"],
    ["pause timer", "pause_timer"],
    ["resume", "resume"],
    ["what's next?", "whats_next"],
    ["what’s next", "whats_next"],
  ])("parses %j locally as %s", (spoken, expected) => {
    expect(parseCookingVoiceCommand(spoken)).toEqual({ kind: "command", command: expected });
  });

  it("returns a safe unknown result instead of guessing an unsupported or physical-state command", () => {
    expect(parseCookingVoiceCommand("is the chicken done?")).toEqual({
      kind: "unknown",
      raw: "is the chicken done?",
    });
    expect(parseCookingVoiceCommand("")).toEqual({ kind: "unknown", raw: "" });
  });
});
