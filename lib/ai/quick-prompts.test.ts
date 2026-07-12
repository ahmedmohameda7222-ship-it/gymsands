import { describe, expect, it } from "vitest";
import { filterPromptLibrary, getPromptAvailability, getPromptHomeSections, QUICK_PROMPTS, rankQuickPrompts, type QuickPromptContext } from "@/lib/ai/quick-prompts";

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

const internalActions = [
  "build_meal_plan", "replace_exercise", "adjust_next_workout", "rebalance_week", "review_workout_session",
  "adjust_for_low_readiness", "explain_progression", "reduce_workout_volume", "reduce_workout_intensity",
  "recovery_workout", "reduce_next_session", "regenerate_meal", "make_meal_cheaper", "make_meal_faster",
  "make_meal_higher_protein", "replace_meal_ingredient", "make_meal_dairy_free", "make_meal_gluten_free",
  "make_meal_cuisine", "build_grocery_list", "review_week"
];

describe("canonical ChatGPT prompt catalog", () => {
  it("contains one unique definition for every supported task", () => {
    expect(QUICK_PROMPTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(QUICK_PROMPTS.map((prompt) => prompt.id)).size).toBe(QUICK_PROMPTS.length);
    expect(QUICK_PROMPTS.every((prompt) => prompt.supportedBy.length > 0)).toBe(true);
  });

  it("covers the real internal Plaivra actions without fake medical tools", () => {
    const supported = new Set(QUICK_PROMPTS.flatMap((prompt) => prompt.supportedBy));
    expect(internalActions.every((action) => supported.has(action))).toBe(true);
    expect(supported.has("diagnose_injury")).toBe(false);
    expect(supported.has("prescribe_supplement_dose")).toBe(false);
  });

  it("creates one recommended prompt and bounded non-duplicated home sections", () => {
    const sections = getPromptHomeSections(completeContext);
    expect(sections.recommended).not.toBeNull();
    expect(sections.quick.length).toBeLessThanOrEqual(6);
    expect(sections.dynamic.length).toBeLessThanOrEqual(5);
    const ids = [...(sections.recommended ? [sections.recommended.id] : []), ...sections.quick.map((prompt) => prompt.id), ...sections.dynamic.map((prompt) => prompt.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not rank unknown food data as zero consumption", () => {
    const context: QuickPromptContext = { ...completeContext, nutrition: { ...completeContext.nutrition!, foodLogsState: "failed", foodLogCount: null, remainingCalories: null, remainingProtein: null } };
    const ranked = rankQuickPrompts(context);
    expect(ranked.some((prompt) => prompt.id === "finish-macros")).toBe(false);
  });

  it("does not create daily prompts from loading-only context", () => {
    const sections = getPromptHomeSections({ nutrition: { hasTargets: false, targetsState: "loading", foodLogsState: "loading", foodLogCount: null, mealPlanCount: null }, grocery: { state: "loading", itemCount: null }, hydration: { state: "loading", logCount: null }, recovery: { state: "loading", hasData: false }, wellness: { state: "loading", habitCount: null, supplementCount: null }, progress: { state: "loading", entryCount: null }, profile: { state: "loading" } });
    const all = [sections.recommended, ...sections.quick, ...sections.dynamic].filter(Boolean);
    expect(all.some((prompt) => prompt!.category === "daily")).toBe(false);
  });

  it("reports exact missing context instead of hiding library actions", () => {
    const prompt = QUICK_PROMPTS.find((item) => item.id === "replace-exercise")!;
    const availability = getPromptAvailability(prompt, completeContext, "en");
    expect(availability.available).toBe(false);
    expect(availability.missingContext.join(" ")).toMatch(/exercise/i);
  });

  it("filters the full registry by search and category", () => {
    const bySearch = filterPromptLibrary({ search: "grocery", category: "all", language: "en" });
    expect(bySearch.length).toBeGreaterThan(0);
    const training = filterPromptLibrary({ search: "", category: "training", language: "en" });
    expect(training.length).toBeGreaterThan(5);
    expect(training.every((prompt) => prompt.category === "training")).toBe(true);
  });
});

describe("professional prompt generation", () => {
  it.each(["en", "de", "ar"] as const)("uses the full professional structure in %s", (language) => {
    const body = QUICK_PROMPTS.find((item) => item.id === "review-week")!.buildPrompt(completeContext, language);
    const headings = language === "de" ? ["Rolle:", "Ziel:", "Autorisierter Plaivra-Kontext:", "Rahmenbedingungen:", "Erwartete Ausgabe:", "Bestätigungsregel:"] : language === "ar" ? ["الدور:", "الهدف:", "سياق Plaivra المصرح به:", "القيود:", "المخرجات المطلوبة:", "قاعدة التأكيد:"] : ["Role:", "Objective:", "Authorized Plaivra context:", "Constraints:", "Required output:", "Confirmation rule:"];
    headings.forEach((heading) => expect(body).toContain(heading));
  });

  it("uses task-specific roles", () => {
    const training = QUICK_PROMPTS.find((item) => item.id === "create-workout-plan")!;
    const nutrition = QUICK_PROMPTS.find((item) => item.id === "create-meal-plan")!;
    const recovery = QUICK_PROMPTS.find((item) => item.id === "review-recovery")!;
    expect(new Set([training.role.en, nutrition.role.en, recovery.role.en]).size).toBe(3);
  });

  it("keeps read prompts non-mutating and write prompts confirmation-gated", () => {
    const read = QUICK_PROMPTS.find((item) => item.id === "review-week")!.buildPrompt(completeContext, "en");
    const write = QUICK_PROMPTS.find((item) => item.id === "create-workout-plan")!.buildPrompt(completeContext, "en");
    expect(read).toContain("Do not change any Plaivra data.");
    expect(write).toContain("Show the complete proposed changes first.");
    expect(write).toContain("until I explicitly confirm");
    expect(write).toContain("do not claim success until the tool confirms it");
  });

  it("does not dump raw objects or internal identifiers", () => {
    const body = QUICK_PROMPTS.find((item) => item.id === "adjust-today-workout")!.buildPrompt(completeContext, "en");
    expect(body).not.toContain("[object Object]");
    expect(body).not.toMatch(/user_id|plan_day_id|internal id/i);
    expect(body).not.toContain(JSON.stringify(completeContext));
  });

  it("preserves photo upload, uncertainty and confirmation rules", () => {
    const photo = QUICK_PROMPTS.find((item) => item.id === "estimate-meal-photo")!;
    const body = photo.buildPrompt(completeContext, "en");
    expect(photo.attachmentExpected).toBe(true);
    expect(body).toContain("I will attach it directly in ChatGPT");
    expect(body).toMatch(/oils|sauces|fillings/);
    expect(body).toContain("Log nothing until I explicitly confirm");
  });
});
