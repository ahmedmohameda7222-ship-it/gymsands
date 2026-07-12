import { describe, expect, it } from "vitest";
import { buildRuntimePrompt } from "@/lib/ai/prompt-runtime";
import { filterPromptLibrary, getPromptAvailability, getPromptHomeSections, QUICK_PROMPTS, rankQuickPrompts, type PromptLanguage, type QuickPromptContext } from "@/lib/ai/quick-prompts";

const completeContext: QuickPromptContext = {
  today: "2026-07-12",
  localHour: 18,
  units: { energy: "kcal", liquid: "ml", weight: "kg" },
  workout: { hasPlan: true, scheduled: true, active: true, completed: true, title: "Upper A", exerciseCount: 6, durationMinutes: 45, historyCount: 8 },
  nutrition: { hasTargets: true, targetsState: "loaded", foodLogsState: "loaded", remainingCalories: 620, remainingProtein: 55, foodLogCount: 2, mealPlanCount: 8 },
  grocery: { state: "loaded", itemCount: 4 },
  hydration: { state: "loaded", hasTarget: true, logCount: 2, remainingMl: 1200 },
  recovery: { state: "loaded", hasData: true, sleepHours: 5.5, poorRecovery: true },
  wellness: { state: "loaded", habitCount: 3, supplementCount: 2 },
  progress: { state: "loaded", entryCount: 4 },
  profile: { state: "loaded", hasGoals: true, hasTrainingPreferences: true, hasNutritionPreferences: true, hasConstraints: true },
  endOfWeek: true
};

const prompt = (id: string) => QUICK_PROMPTS.find((item) => item.id === id)!;

describe("canonical ChatGPT prompt catalog", () => {
  it("contains one unique metadata definition for every supported task", () => {
    expect(QUICK_PROMPTS).toHaveLength(44);
    expect(new Set(QUICK_PROMPTS.map((item) => item.id)).size).toBe(QUICK_PROMPTS.length);
    expect(QUICK_PROMPTS.every((item) => item.supportedBy.length > 0)).toBe(true);
    expect(QUICK_PROMPTS.every((item) => !("buildPrompt" in item) && !("template" in item) && !("contextChips" in item))).toBe(true);
    expect(QUICK_PROMPTS.map((item) => item.id)).not.toEqual(expect.arrayContaining(["update-training-preferences", "update-nutrition-preferences"]));
  });

  it("creates bounded, non-duplicated home sections", () => {
    const sections = getPromptHomeSections(completeContext);
    expect(sections.recommended).not.toBeNull();
    expect(sections.quick.length).toBeLessThanOrEqual(6);
    expect(sections.dynamic.length).toBeLessThanOrEqual(5);
    const ids = [...(sections.recommended ? [sections.recommended.id] : []), ...sections.quick.map((item) => item.id), ...sections.dynamic.map((item) => item.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not rank macro completion when required values are unavailable", () => {
    const failed: QuickPromptContext = { ...completeContext, nutrition: { ...completeContext.nutrition!, foodLogsState: "failed", foodLogCount: null, remainingCalories: null, remainingProtein: null } };
    expect(rankQuickPrompts(failed).some((item) => item.id === "finish-macros")).toBe(false);
    const unknownRemaining: QuickPromptContext = { ...completeContext, nutrition: { ...completeContext.nutrition!, remainingCalories: null } };
    expect(rankQuickPrompts(unknownRemaining).some((item) => item.id === "finish-macros")).toBe(false);
  });

  it("does not create daily prompts from loading-only context", () => {
    const sections = getPromptHomeSections({ nutrition: { hasTargets: false, targetsState: "loading", foodLogsState: "loading", foodLogCount: null, mealPlanCount: null }, grocery: { state: "loading", itemCount: null }, hydration: { state: "loading", logCount: null }, recovery: { state: "loading", hasData: false }, wellness: { state: "loading", habitCount: null, supplementCount: null }, progress: { state: "loading", entryCount: null }, profile: { state: "loading" } });
    const all = [sections.recommended, ...sections.quick, ...sections.dynamic].filter(Boolean);
    expect(all.some((item) => item!.category === "daily")).toBe(false);
  });

  it("reports exact missing context instead of hiding library actions", () => {
    const availability = getPromptAvailability(prompt("replace-exercise"), completeContext, "en");
    expect(availability.available).toBe(false);
    expect(availability.missingContext.join(" ")).toMatch(/exercise/i);
  });

  it("filters the full metadata registry by search and category", () => {
    expect(filterPromptLibrary({ search: "grocery", category: "all", language: "en" }).length).toBeGreaterThan(0);
    const training = filterPromptLibrary({ search: "", category: "training", language: "en" });
    expect(training.length).toBeGreaterThan(5);
    expect(training.every((item) => item.category === "training")).toBe(true);
  });
});

describe("runtime generation from catalog metadata", () => {
  it.each(["en", "de", "ar"] as const)("uses the professional structure in %s", (language: PromptLanguage) => {
    const body = buildRuntimePrompt(prompt("review-week"), completeContext, language);
    const headings = language === "de" ? ["Rolle:", "Ziel:", "Autorisierter Plaivra-Kontext:", "Rahmenbedingungen:", "Aufgabenspezifische erwartete Ausgabe:", "Bestätigungsregel:"] : language === "ar" ? ["الدور:", "الهدف:", "سياق Plaivra المصرح به:", "القيود:", "المخرجات المطلوبة الخاصة بالمهمة:", "قاعدة التأكيد:"] : ["Role:", "Objective:", "Authorized Plaivra context:", "Constraints:", "Task-specific required output:", "Confirmation rule:"];
    headings.forEach((heading) => expect(body).toContain(heading));
  });

  it("keeps photo upload and uncertainty rules", () => {
    const photo = prompt("estimate-meal-photo");
    const body = buildRuntimePrompt(photo, completeContext, "en");
    expect(photo.attachmentExpected).toBe(true);
    expect(body).toMatch(/visible evidence|hidden ingredients|portion uncertainty/i);
    expect(body).toContain("Do not change any Plaivra data.");
  });
});
