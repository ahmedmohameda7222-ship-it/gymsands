import { describe, expect, it } from "vitest";
import { createPromptPrerequisite } from "@/lib/ai/prompt-catalog/prerequisites";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";

const completeContext: QuickPromptContext = {
  today: "2026-07-13",
  profile: {
    state: "loaded",
    hasGoals: true,
    hasTrainingPreferences: true,
    hasNutritionPreferences: true,
    hasConstraints: true
  },
  progress: { state: "loaded", entryCount: 2 },
  workout: { hasPlan: true, historyCount: 1 }
};

describe("Dashboard prompt prerequisite context", () => {
  it("keeps profile-backed prompts available after Dashboard simplification", () => {
    for (const prerequisite of ["goals", "trainingPreferences", "nutritionPreferences", "constraints"]) {
      expect(createPromptPrerequisite(prerequisite).isMet(completeContext), prerequisite).toBe(true);
    }
  });

  it("keeps progress and workout-history prompts available", () => {
    expect(createPromptPrerequisite("progressData").isMet(completeContext)).toBe(true);
    expect(createPromptPrerequisite("progressOrHistory").isMet(completeContext)).toBe(true);
    expect(createPromptPrerequisite("workoutHistory").isMet(completeContext)).toBe(true);
  });

  it("does not reuse a previous user's loaded profile during a new request", () => {
    const resetContext: QuickPromptContext = {
      ...completeContext,
      profile: { state: "loading", hasGoals: false, hasTrainingPreferences: false, hasNutritionPreferences: false, hasConstraints: false },
      progress: { state: "loading", entryCount: null },
      workout: { hasPlan: undefined, historyCount: null }
    };
    expect(createPromptPrerequisite("goals").isMet(resetContext)).toBe(false);
    expect(createPromptPrerequisite("progressData").isMet(resetContext)).toBe(false);
    expect(createPromptPrerequisite("workoutHistory").isMet(resetContext)).toBe(false);
  });
});
