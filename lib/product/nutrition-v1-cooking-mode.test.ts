import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const routePath = "app/(private)/my-recipes/[recipeId]/cook/page.tsx";
const modePath = "components/nutrition/cooking/cooking-mode.tsx";
const resumePath = "components/nutrition/cooking/cooking-resume.tsx";
const i18nPath = "lib/i18n/nutrition-v1.ts";

describe("Nutrition V1 focused Cooking Mode product contract", () => {
  it("implements the planned authenticated route and focused Cooking components", () => {
    for (const path of [routePath, modePath, resumePath]) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("renders the deterministic localized hierarchy ATTENTION > NOW > RUNNING > UP NEXT in that order", () => {
    const mode = source(modePath);
    const attention = mode.indexOf('nt("cookingAttention")');
    const now = mode.indexOf('nt("cookingNow")');
    const running = mode.indexOf('nt("cookingRunning")');
    const upNext = mode.indexOf('nt("cookingUpNext")');

    expect(mode).toContain("useNutritionV1Translation");
    expect(attention).toBeGreaterThanOrEqual(0);
    expect(now).toBeGreaterThan(attention);
    expect(running).toBeGreaterThan(now);
    expect(upNext).toBeGreaterThan(running);
    expect(mode).toContain("deriveCookingTimeline");

    const i18n = source(i18nPath);
    expect(i18n).toContain('cookingAttention: "ATTENTION"');
    expect(i18n).toContain('cookingAttention: "ACHTUNG"');
    expect(i18n).toContain('cookingAttention: "انتباه"');
  });

  it("keeps the complete touch path available with Done only, conditional Later, and lower-prominence Skip", () => {
    const mode = source(modePath);
    expect(mode).toContain('nt("cookingBack")');
    expect(mode).toContain('nt("cookingRepeat")');
    expect(mode).toContain('nt("cookingDone")');
    expect(mode).toContain('nt("cookingLater")');
    expect(mode).toContain('nt("cookingSkip")');
    expect(mode).toContain("canDefer");
    expect(mode).toMatch(/updateAction\("skipped"\)[\s\S]{0,500}text-muted|text-muted[\s\S]{0,500}cookingSkip/);
    expect(mode).not.toMatch(/Done\s*\/\s*Next|Done\s*&\s*Next/i);
  });

  it("keeps Back navigation distinct from explicit End Cooking", () => {
    const mode = source(modePath);
    expect(mode).toContain("onBack");
    expect(mode).toContain("onEndCooking");
    expect(mode).toMatch(/onClick=\{onBack\}/);
    expect(mode).toMatch(/onClick=\{onEndCooking\}/);
    expect(mode).toContain('nt("cookingEnd")');
  });

  it("offers localized Resume and Start Over as explicit interruption-recovery choices", () => {
    const resume = source(resumePath);
    expect(resume).toContain("useNutritionV1Translation");
    expect(resume).toContain('nt("cookingResume")');
    expect(resume).toContain('nt("cookingStartOver")');
    expect(resume).toContain("onResume");
    expect(resume).toContain("onStartOver");
  });

  it("requests microphone access only from user activation and keeps touch controls complete without voice", () => {
    const mode = source(modePath);
    expect(mode).toContain("navigator.mediaDevices.getUserMedia");
    expect(mode).toContain("requestMicrophone");
    expect(mode).toMatch(/onClick=\{requestMicrophone\}/);
    expect(mode).toContain('nt("cookingBack")');
    expect(mode).toContain('nt("cookingRepeat")');
    expect(mode).toContain('nt("cookingDone")');
  });

  it("owns screen-wake acquisition and release without making wake lock required for progress", () => {
    const mode = source(modePath);
    expect(mode).toContain("navigator.wakeLock");
    expect(mode).toContain("release()");
    expect(mode).toContain("visibilitychange");
  });

  it("supports RTL and large-text wrapping instead of fixed clipped instruction chrome", () => {
    const mode = source(modePath);
    expect(mode).toContain("dir={direction}");
    expect(mode).toContain("break-words");
    expect(mode).toContain("min-h-[44px]");
    expect(mode).toContain("min-h-[56px]");
    expect(mode).not.toMatch(/truncate[^\n]*instruction|line-clamp-1[^\n]*instruction/i);
  });

  it("never treats finishing Cooking Mode as Diary consumption", () => {
    const combined = [source(routePath), source(modePath), source(resumePath)].join("\n");
    expect(combined).not.toMatch(/food_logs|nutrition_log_groups|logMeal|consumeRecipe|auto.?log/i);
  });
});
