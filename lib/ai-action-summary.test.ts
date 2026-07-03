import { describe, expect, it } from "vitest";
import { buildAiActionSummary, buildChatGptActionPrompt } from "@/components/ai/ai-action-summary";
import { getAiActionSafetyDecision } from "@/components/ai/ai-action-safety";
import type { AiActionRequest, UserSafetyProfile } from "@/types";

function request(overrides: Partial<AiActionRequest> = {}): AiActionRequest {
  return {
    id: "internal-request-id",
    user_id: "internal-user-id",
    action_type: "replace_exercise",
    source_type: "plan_exercise",
    source_id: "internal-source-id",
    status: "ready_for_chatgpt",
    context_json: {
      workout_day: { id: "private-day-id", name: "Push Day" },
      active_exercise: { id: "private-exercise-id", exercise_name: "Bench Press" },
      replacement_reason: "pain_or_discomfort"
    },
    user_note: "Keep the movement shoulder friendly.",
    created_at: "2026-07-03T08:00:00.000Z",
    updated_at: "2026-07-03T08:00:00.000Z",
    resolved_at: null,
    ...overrides
  };
}

function safety(riskLevel: UserSafetyProfile["risk_level"], eatingDisorderRisk = false) {
  return { risk_level: riskLevel, eating_disorder_risk_acknowledged: eatingDisorderRisk };
}

describe("human ChatGPT request presentation", () => {
  it("builds a short workout summary without internal fields", () => {
    expect(buildAiActionSummary("replace_exercise", request().context_json)).toEqual([
      { label: "Workout", value: "Push Day" },
      { label: "Exercise", value: "Bench Press" },
      { label: "Reason", value: "Pain Or Discomfort" },
      { label: "Goal", value: "Suggest a suitable replacement" }
    ]);
  });

  it("never copies serialized context or identifiers into the user request", () => {
    const prompt = buildChatGptActionPrompt(request());
    expect(prompt).toContain("Workout: Push Day.");
    expect(prompt).toContain("Exercise: Bench Press.");
    expect(prompt).toContain("Keep the movement shoulder friendly.");
    expect(prompt).not.toContain("internal-request-id");
    expect(prompt).not.toContain("internal-source-id");
    expect(prompt).not.toContain("private-day-id");
    expect(prompt).not.toContain("context_json");
    expect(prompt).not.toContain("{");
  });
});

describe("AI action safety decisions", () => {
  it("allows normal-profile requests", () => {
    expect(getAiActionSafetyDecision("adjust_next_workout", safety("green"))).toEqual({ decision: "allow" });
  });

  it("warns but allows recovery-focused actions at high caution", () => {
    expect(getAiActionSafetyDecision("reduce_workout_volume", safety("red")).decision).toBe("warn");
  });

  it("blocks risky progression and nutrition actions at high caution", () => {
    expect(getAiActionSafetyDecision("explain_progression", safety("red")).decision).toBe("block");
    expect(getAiActionSafetyDecision("make_meal_higher_protein", safety("yellow", true)).decision).toBe("block");
  });
});
