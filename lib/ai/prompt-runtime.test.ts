import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROMPT_CONTEXT_FIELD_PERMISSIONS,
  TASK_CONTRACTS,
  auditPromptCatalog,
  buildPromptContextItems,
  buildRuntimePrompt,
  getBackingCapabilityStatus,
  getPromptTaskContract,
  getRuntimeContextChips,
  normalizeNutritionTargetState,
  RUNTIME_QUICK_PROMPTS,
  validatePromptContextPermissionContract
} from "@/lib/ai/prompt-runtime";
import { getPromptAvailability, QUICK_PROMPTS, type PromptLanguage, type QuickPromptContext } from "@/lib/ai/quick-prompts";
import type { AiPermissionSection } from "@/types";

const context: QuickPromptContext = {
  today: "2026-07-12",
  units: { energy: "kJ", liquid: "oz", weight: "lb" },
  workout: { hasPlan: true, scheduled: true, active: true, completed: false, title: "Upper A", exerciseCount: 6, durationMinutes: 45, historyCount: 7 },
  nutrition: { hasTargets: true, targetsState: "loaded", foodLogsState: "loaded", remainingCalories: -100, remainingProtein: 42, foodLogCount: 3, mealPlanCount: 8 },
  grocery: { state: "loaded", itemCount: 11 },
  hydration: { state: "loaded", hasTarget: true, logCount: 3, remainingMl: 1183 },
  recovery: { state: "loaded", hasData: true, sleepHours: 6.5, poorRecovery: true },
  wellness: { state: "loaded", habitCount: 3, supplementCount: 2 },
  progress: { state: "loaded", entryCount: 4 },
  profile: { state: "loaded", hasGoals: true, hasTrainingPreferences: true, hasNutritionPreferences: true, hasConstraints: true },
  selection: { exercise: "Seated Cable Row", meal: "Chicken rice bowl" }
};

const prompt = (id: string) => {
  const definition = QUICK_PROMPTS.find((item) => item.id === id);
  if (!definition) throw new Error(`Missing test prompt ${id}`);
  return definition;
};

const withPermissions = (id: string, permissionSections: AiPermissionSection[]) => ({ ...prompt(id), permissionSections });

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if ([".git", ".next", "node_modules", "coverage"].includes(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("prompt context permission contracts", () => {
  it("defines an authoritative permission mapping for every context field", () => {
    expect(Object.keys(PROMPT_CONTEXT_FIELD_PERMISSIONS).sort()).toEqual([
      "date", "grocery", "hydration", "meal_plan", "nutrition_progress", "nutrition_targets", "profile_constraints",
      "profile_goals", "profile_nutrition_preferences", "profile_training_preferences", "progress", "recovery",
      "selected_exercise", "selected_meal", "wellness", "workout", "workout_history", "workout_state"
    ].sort());
    expect(PROMPT_CONTEXT_FIELD_PERMISSIONS.date).toEqual([]);
  });

  it("audits every canonical prompt and rejects illegal field declarations", () => {
    for (const definition of QUICK_PROMPTS) {
      expect(validatePromptContextPermissionContract(definition), definition.id).toEqual({ valid: true, illegalFields: [] });
    }
    const invalidProfile = withPermissions("suggest-warmup", ["workouts"]);
    expect(validatePromptContextPermissionContract(invalidProfile).illegalFields).toContain("profile_constraints");
    const invalidNutrition = withPermissions("finish-macros", []);
    expect(validatePromptContextPermissionContract(invalidNutrition).illegalFields).toEqual(expect.arrayContaining(["nutrition_targets", "nutrition_progress"]));
    const invalidMealPlan = withPermissions("review-grocery-list", []);
    expect(validatePromptContextPermissionContract(invalidMealPlan).illegalFields).toEqual(expect.arrayContaining(["grocery", "meal_plan"]));
    const invalidHydration = withPermissions("review-hydration", []);
    expect(validatePromptContextPermissionContract(invalidHydration).illegalFields).toContain("hydration");
    const invalidWellness = withPermissions("review-recovery", ["workouts"]);
    expect(validatePromptContextPermissionContract(invalidWellness).illegalFields).toEqual(expect.arrayContaining(["recovery", "wellness"]));
  });

  it("uses only permission-compatible minimum context and keeps chips synchronized", () => {
    const workoutOnly = withPermissions("adjust-today-workout", ["workouts"]);
    const items = buildPromptContextItems(workoutOnly, context, "en");
    expect(items.some((item) => item.field.startsWith("profile_"))).toBe(false);
    expect(items.some((item) => item.field === "workout")).toBe(true);

    const nutritionItems = buildPromptContextItems(prompt("finish-macros"), context, "en");
    expect(nutritionItems.some((item) => item.field.startsWith("workout"))).toBe(false);
    expect(buildPromptContextItems(prompt("estimate-meal-photo"), context, "en")).toEqual([]);

    const reviewWeekFields = new Set(buildPromptContextItems(prompt("review-week"), context, "en").map((item) => item.field));
    expect(reviewWeekFields).toEqual(new Set(["date", "workout_history", "nutrition_progress", "hydration", "recovery", "progress"]));

    const allItems = buildPromptContextItems(prompt("review-week"), context, "en");
    expect(getRuntimeContextChips(prompt("review-week"), context, "en")).toEqual(allItems.slice(0, 6).map((item) => `${item.label}: ${item.value}`));
  });
});

describe("explicit task contracts", () => {
  it("has a complete localized task contract for every canonical prompt", () => {
    expect(Object.keys(TASK_CONTRACTS).sort()).toEqual(QUICK_PROMPTS.map((item) => item.id).sort());
    for (const definition of QUICK_PROMPTS) {
      const contract = getPromptTaskContract(definition);
      expect(contract.contextFields, definition.id).toBeDefined();
      expect(contract.constraints.length, definition.id).toBeGreaterThanOrEqual(1);
      expect(contract.output.length, definition.id).toBeGreaterThanOrEqual(3);
      for (const localized of [...contract.constraints, ...contract.output]) {
        for (const language of ["en", "de", "ar"] as const) expect(localized[language].trim(), `${definition.id}:${language}`).not.toBe("");
      }
    }
  });

  it.each([
    ["review-last-workout", "review-workout-consistency"],
    ["adjust-today-workout", "adapt-time"],
    ["create-meal-plan", "adjust-meal-plan"],
    ["build-grocery-list", "review-grocery-list"],
    ["review-recovery", "train-today"],
    ["review-week", "identify-plateau"],
    ["review-goals", "update-training-preferences"]
  ])("materially differentiates %s from %s", (first: string, second: string) => {
    expect(getPromptTaskContract(prompt(first)).output.map((item) => item.en)).not.toEqual(getPromptTaskContract(prompt(second)).output.map((item) => item.en));
  });

  it("contains the required task-specific output evidence", () => {
    expect(buildRuntimePrompt(prompt("review-last-workout"), context, "en")).toContain("Exercise, set, repetition, and load evidence");
    expect(buildRuntimePrompt(prompt("review-workout-consistency"), context, "en")).toContain("Attendance and adherence evidence");
    expect(buildRuntimePrompt(prompt("suggest-warmup"), context, "en")).toContain("Exercise-specific preparation and ramp-up sets");
    expect(buildRuntimePrompt(prompt("adapt-equipment"), context, "en")).toContain("Preserved movement and training intent");
    expect(buildRuntimePrompt(prompt("plan-rest-meals"), context, "en")).toContain("Remaining meal slots and timing");
    expect(buildRuntimePrompt(prompt("review-hydration"), context, "en")).toContain("Time-aware practical pacing");
    expect(buildRuntimePrompt(prompt("identify-plateau"), context, "en")).toContain("Evidence threshold and trend duration");
  });
});

describe("backing capability audit", () => {
  it("validates every declared backing name for every canonical prompt", () => {
    for (const definition of QUICK_PROMPTS) {
      const status = getBackingCapabilityStatus(definition);
      expect(status.declared.length, definition.id).toBeGreaterThan(0);
      expect(status.unknown, definition.id).toEqual([]);
      expect(status.known, definition.id).toHaveLength(status.declared.length);
      expect(new Set(status.declared).size, definition.id).toBe(status.declared.length);
      if (definition.capability === "write") expect(status.writeCapable.length, definition.id).toBeGreaterThan(0);
      expect(status.supported, definition.id).toBe(true);
    }
    expect(RUNTIME_QUICK_PROMPTS).toHaveLength(QUICK_PROMPTS.length);
  });

  it("rejects partial capability matches instead of accepting one real entry", () => {
    const base = prompt("review-last-workout");
    const invalid = { ...base, supportedBy: [...base.supportedBy, "retired_fake_action"] };
    expect(getBackingCapabilityStatus(invalid)).toMatchObject({ unknown: ["retired_fake_action"], supported: false });
  });

  it("produces a complete development audit for every canonical prompt", () => {
    const audit = auditPromptCatalog();
    expect(audit).toHaveLength(QUICK_PROMPTS.length);
    expect(audit.every((item) => item.contextPermissionContractValid && item.taskContractExists && item.backingActionsValid && item.writeBackingValid && item.runtimeExposed)).toBe(true);
  });
});

describe("nutrition target states and honest values", () => {
  it.each([
    [{ targetsState: "loaded", hasTargets: true }, "available"],
    [{ targetsState: "loaded", hasTargets: false }, "not-configured"],
    [{ targetsState: "failed", hasTargets: false }, "unavailable"],
    [{ targetsState: "loading", hasTargets: false }, "loading"]
  ] as const)("normalizes %o as %s", (nutrition: { readonly targetsState: "loaded" | "failed" | "loading"; readonly hasTargets: boolean }, expected: string) => {
    expect(normalizeNutritionTargetState({ nutrition: { ...nutrition, foodLogsState: "loaded", foodLogCount: 0, mealPlanCount: 0 } }).state).toBe(expected);
  });

  it.each([
    ["en", "available", "not configured", "unavailable"],
    ["de", "verfügbar", "nicht eingerichtet", "nicht verfügbar"],
    ["ar", "متاحة", "غير مُعدّة", "غير متاحة"]
  ] as const)("uses distinct localized target wording in %s", (language: PromptLanguage, available: string, notConfigured: string, unavailable: string) => {
    const baseNutrition = context.nutrition!;
    const availableItems = buildPromptContextItems(prompt("finish-macros"), context, language);
    expect(availableItems).toContainEqual(expect.objectContaining({ label: language === "de" ? "Ernährungsziele" : language === "ar" ? "أهداف التغذية" : "Nutrition targets", value: available }));

    const noTarget = { ...context, nutrition: { ...baseNutrition, targetsState: "loaded" as const, hasTargets: false, remainingCalories: null, remainingProtein: null } };
    const noTargetItems = buildPromptContextItems(prompt("finish-macros"), noTarget, language);
    expect(noTargetItems).toContainEqual(expect.objectContaining({ value: notConfigured }));
    expect(noTargetItems.some((item) => item.field === "nutrition_progress" && /balance|bilanz|رصيد/i.test(item.label))).toBe(false);

    const failed = { ...context, nutrition: { ...baseNutrition, targetsState: "failed" as const, hasTargets: false, remainingCalories: null, remainingProtein: null } };
    expect(buildPromptContextItems(prompt("finish-macros"), failed, language)).toContainEqual(expect.objectContaining({ value: unavailable }));

    const loading = { ...context, nutrition: { ...baseNutrition, targetsState: "loading" as const, hasTargets: false, remainingCalories: null, remainingProtein: null } };
    expect(buildPromptContextItems(prompt("finish-macros"), loading, language).some((item) => item.field === "nutrition_targets")).toBe(false);
  });

  it("keeps macro eligibility and prerequisite messages precise", () => {
    const definition = prompt("finish-macros");
    const noTarget = { ...context, nutrition: { ...context.nutrition!, targetsState: "loaded" as const, hasTargets: false, remainingCalories: null, remainingProtein: null } };
    expect(getPromptAvailability(definition, noTarget, "en")).toEqual({ available: false, missingContext: ["Requires nutrition targets"] });
    const failedTargets = { ...context, nutrition: { ...context.nutrition!, targetsState: "failed" as const, hasTargets: false, remainingCalories: null, remainingProtein: null } };
    expect(getPromptAvailability(definition, failedTargets, "en").missingContext).toEqual(["Nutrition targets could not be loaded"]);
    const failedLogs = { ...context, nutrition: { ...context.nutrition!, foodLogsState: "failed" as const, remainingCalories: null, remainingProtein: null } };
    expect(getPromptAvailability(definition, failedLogs, "en").missingContext).toEqual(["Food logs could not be loaded"]);
  });

  it("preserves negative balances and configured display units without zero fallbacks", () => {
    const body = buildRuntimePrompt(prompt("finish-macros"), context, "en");
    expect(body).toContain("418 kJ above target");
    expect(body).toContain("42 g remaining");
    expect(body).not.toMatch(/0 kcal|0 g remaining/);
    const hydration = buildRuntimePrompt(prompt("review-hydration"), context, "en");
    expect(hydration).toContain("oz remaining");
  });
});

describe("single prompt-generation path and localization", () => {
  it.each(["en", "de", "ar"] as PromptLanguage[])("builds localized runtime output in %s", (language: PromptLanguage) => {
    const body = buildRuntimePrompt(prompt("adjust-today-workout"), context, language);
    expect(body).toContain(language === "de" ? "Aufgabenspezifische erwartete Ausgabe" : language === "ar" ? "المخرجات المطلوبة الخاصة بالمهمة" : "Task-specific required output");
    if (language === "de") { expect(body).toContain("aktiv"); expect(body).not.toContain("Workout state: active"); }
    if (language === "ar") { expect(body).toContain("نشط"); expect(body).not.toMatch(/Workout state|active|remaining/); }
  });

  it("keeps read prompts non-mutating and write prompts confirmation-gated", () => {
    expect(buildRuntimePrompt(prompt("review-week"), context, "en")).toContain("Do not change any Plaivra data.");
    const write = buildRuntimePrompt(prompt("create-workout-plan"), context, "en");
    expect(write).toContain("Show the complete proposed changes first.");
    expect(write).toContain("until I explicitly confirm");
    expect(write).toContain("do not claim success until the tool confirms it");
  });

  it("removes the legacy builder from the catalog and all runtime callers", () => {
    const catalog = readFileSync(join(process.cwd(), "lib/ai/quick-prompts.ts"), "utf8");
    expect(catalog).not.toMatch(/contextLines|buildProfessionalPrompt|buildPrompt\s*:|template\s*:|contextChips\s*:/);
    expect(catalog).not.toMatch(/Math\.max\(0|\?\?\s*0\).*kcal|\?\?\s*0\).*ml/);

    const productionSources = sourceFiles(process.cwd()).map((file) => ({ file, source: readFileSync(file, "utf8") }));
    expect(productionSources.filter(({ source }) => /definition\.buildPrompt\(|definition\.template\(|definition\.contextChips\(/.test(source))).toEqual([]);
    expect(productionSources.filter(({ source }) => /function\s+buildProfessionalPrompt|function\s+contextLines/.test(source))).toEqual([]);
    expect(productionSources.filter(({ source }) => /export function buildRuntimePrompt/.test(source)).map(({ file }) => file.replaceAll("\\", "/"))).toEqual([expect.stringMatching(/lib\/ai\/prompt-runtime\.ts$/)]);
  });
});
