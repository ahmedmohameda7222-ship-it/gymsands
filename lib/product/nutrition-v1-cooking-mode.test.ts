import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const routePath = "app/(private)/my-recipes/[recipeId]/cook/page.tsx";
const modePath = "components/nutrition/cooking/cooking-mode.tsx";
const resumePath = "components/nutrition/cooking/cooking-resume.tsx";

describe("Nutrition V1 focused Cooking Mode product contract", () => {
  it("implements the planned authenticated route and focused Cooking components", () => {
    for (const path of [routePath, modePath, resumePath]) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("renders the deterministic hierarchy ATTENTION > NOW > RUNNING > UP NEXT in that order", () => {
    const mode = source(modePath);
    const attention = mode.indexOf("ATTENTION");
    const now = mode.indexOf("NOW");
    const running = mode.indexOf("RUNNING");
    const upNext = mode.indexOf("UP NEXT");

    expect(attention).toBeGreaterThanOrEqual(0);
    expect(now).toBeGreaterThan(attention);
    expect(running).toBeGreaterThan(now);
    expect(upNext).toBeGreaterThan(running);
    expect(mode).toContain("deriveCookingTimeline");
  });

  it("keeps the complete touch path available with Done only, conditional Later, and lower-prominence Skip", () => {
    const mode = source(modePath);
    expect(mode).toContain("Back");
    expect(mode).toContain("Repeat");
    expect(mode).toContain("Done");
    expect(mode).toContain("Later");
    expect(mode).toContain("Skip");
    expect(mode).toContain("canDefer");
    expect(mode).toMatch(/Skip[\s\S]{0,500}(ghost|secondary|text-muted)|(?:ghost|secondary|text-muted)[\s\S]{0,500}Skip/);
    expect(mode).not.toMatch(/Done\s*\/\s*Next|Done\s*&\s*Next/i);
  });

  it("keeps Back navigation distinct from explicit End Cooking", () => {
    const mode = source(modePath);
    expect(mode).toContain("onBack");
    expect(mode).toContain("onEndCooking");
    expect(mode).toMatch(/onClick=\{onBack\}/);
    expect(mode).toMatch(/onClick=\{onEndCooking\}/);
    expect(mode).toContain("End Cooking");
  });

  it("offers Resume and Start Over as explicit interruption-recovery choices", () => {
    const resume = source(resumePath);
    expect(resume).toContain("Resume");
    expect(resume).toContain("Start Over");
    expect(resume).toContain("onResume");
    expect(resume).toContain("onStartOver");
  });

  it("requests microphone access only from user activation and keeps touch controls complete without voice", () => {
    const mode = source(modePath);
    expect(mode).toContain("navigator.mediaDevices.getUserMedia");
    expect(mode).toContain("requestMicrophone");
    expect(mode).toMatch(/onClick=\{requestMicrophone\}/);
    expect(mode).toContain("Back");
    expect(mode).toContain("Repeat");
    expect(mode).toContain("Done");
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
    expect(mode).not.toMatch(/truncate[^\n]*instruction|line-clamp-1[^\n]*instruction/i);
  });

  it("never treats finishing Cooking Mode as Diary consumption", () => {
    const combined = [source(routePath), source(modePath), source(resumePath)].join("\n");
    expect(combined).not.toMatch(/food_logs|nutrition_log_groups|logMeal|consumeRecipe|auto.?log/i);
  });
});
