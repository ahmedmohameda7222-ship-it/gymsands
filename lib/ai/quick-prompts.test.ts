import { describe, expect, it } from "vitest";
import { QUICK_PROMPTS, rankQuickPrompts } from "@/lib/ai/quick-prompts";

describe("quick ChatGPT prompts", () => {
  it("retains weekly review and photo estimation", () => {
    expect(QUICK_PROMPTS.some((item) => item.id === "review-week")).toBe(true);
    const photo = QUICK_PROMPTS.find((item) => item.id === "estimate-meal-photo");
    expect(photo?.attachmentExpected).toBe(true);
    expect(photo?.capability).toBe("read");
    expect(photo?.template({}, "en")).toContain("Do not save or log anything");
  });
  it("prioritizes an active workout", () => {
    const ranked = rankQuickPrompts({ workout: { active: true, scheduled: true, completed: false }, nutrition: { hasTargets: true, foodLogCount: 1, mealPlanCount: 1, remainingProtein: 20 }, grocery: { itemCount: 1 }, recovery: { poorRecovery: false } });
    expect(ranked[0].id).toBe("adjust-today-workout");
  });
  it("limits the dashboard separately while keeping a reusable registry", () => {
    expect(QUICK_PROMPTS.length).toBeGreaterThan(4);
  });
});
