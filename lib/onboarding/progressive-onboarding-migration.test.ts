import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const progressiveMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260710211000_progressive_onboarding_and_legacy_constraints.sql"), "utf8");
const adaptiveMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260711213000_adaptive_onboarding_v2.sql"), "utf8");
const onboardingPage = fs.readFileSync(path.join(root, "app/(private)/onboarding/page.tsx"), "utf8");
const onboardingForm = fs.readFileSync(path.join(root, "components/onboarding/adaptive-onboarding-form.tsx"), "utf8");

describe("progressive onboarding migrations", () => {
  it("preserves legacy completion evidence before the seven-section upgrade", () => {
    expect(progressiveMigration).toContain("setup_stage integer not null default 0");
    expect(progressiveMigration).toContain("completed_at timestamptz");
    expect(progressiveMigration).toContain("completed_at = coalesce(completed_at, updated_at, created_at, now())");
    expect(progressiveMigration).not.toMatch(/delete\s+from\s+public\.onboarding_answers/i);
  });

  it("retains legacy functional notes without overwriting saved context", () => {
    expect(progressiveMigration).toContain("legacy_context_notes text");
    expect(progressiveMigration).toContain("public.user_fitness_constraints.legacy_context_notes");
    expect(adaptiveMigration).toContain("legacy_context_notes = coalesce(excluded.legacy_context_notes");
  });

  it("upgrades setup_stage to seven sections and uses the adaptive component", () => {
    expect(adaptiveMigration).toContain("check (setup_stage between 0 and 6)");
    expect(onboardingPage).toContain("AdaptiveOnboardingForm");
    expect(onboardingForm).toContain("Step");
    expect(onboardingForm).toContain("SPORT_FIELD_CONFIG");
    expect(onboardingForm).toContain("ALL_AI_PERMISSION_SECTIONS.map");
    expect(onboardingForm).not.toContain("permissionsForFirstJob");
    expect(onboardingForm).not.toContain("first=true");
  });
});
