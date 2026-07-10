import { describe, expect, it } from "vitest";
import { buildAiActionSummary, buildChatGptActionPrompt } from "@/components/ai/ai-action-summary";

const context = {
  workout_day: { id: "private-day-id", name: "Push Day" },
  active_exercise: { id: "private-exercise-id", exercise_name: "Bench Press" },
  replacement_reason: "pain_or_discomfort"
};

describe("ChatGPT action presentation", () => {
  it("builds a short human summary without internal fields", () => {
    expect(buildAiActionSummary("replace_exercise", context)).toEqual([
      { label: "Workout", value: "Push Day" },
      { label: "Exercise", value: "Bench Press" },
      { label: "Reason", value: "Pain Or Discomfort" },
      { label: "Goal", value: "Replace this exercise" }
    ]);
  });

  it("asks ChatGPT to use authorized Plaivra context and confirmed tools", () => {
    const prompt = buildChatGptActionPrompt(
      "replace_exercise",
      context,
      "Keep the movement shoulder friendly."
    );

    expect(prompt).toContain("Connect to my Plaivra account");
    expect(prompt).toContain("minimum authorized workouts context");
    expect(prompt).toContain("Workout: Push Day.");
    expect(prompt).toContain("Exercise: Bench Press.");
    expect(prompt).toContain("Keep the movement shoulder friendly.");
    expect(prompt).toContain("Plaivra tools");
    expect(prompt).toContain("tool confirms success");
    expect(prompt).not.toContain("private-day-id");
    expect(prompt).not.toContain("private-exercise-id");
    expect(prompt).not.toContain("context_json");
    expect(prompt).not.toContain("{");
  });
});
