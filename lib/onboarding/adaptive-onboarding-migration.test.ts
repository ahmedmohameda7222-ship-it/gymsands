import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260711213000_adaptive_onboarding_v2.sql", "utf8");
const profileService = readFileSync("services/database/profile.ts", "utf8");
const onboardingPage = readFileSync("app/(private)/onboarding/page.tsx", "utf8");
const settingsConnection = readFileSync("components/settings/connected-apps.tsx", "utf8");

describe("adaptive onboarding persistence and regressions", () => {
  it("adds one atomic authenticated completion RPC and writes completed_at last", () => {
    expect(migration).toContain("create or replace function public.complete_adaptive_onboarding_v2");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("update public.onboarding_answers set completed_at = v_completed_at");
    expect(migration).toContain("grant execute on function public.complete_adaptive_onboarding_v2");
  });

  it("preserves own-row RLS models and does not create competing profile tables", () => {
    expect(migration).toContain("alter table public.user_fitness_constraints");
    expect(migration).toContain("alter table public.user_nutrition_preference_profiles");
    expect(migration).not.toMatch(/create table .*constraint/i);
    expect(migration).not.toMatch(/create table .*nutrition.*profile/i);
  });

  it("allows drafts while enforcing required values only at final completion", () => {
    expect(migration).toContain("alter column height_cm drop not null");
    expect(migration).toContain("alter column weight_kg drop not null");
    expect(migration).toContain("check (setup_stage between 0 and 6)");
    expect(migration).toContain("Age must be between 16 and 100");
  });

  it("makes getOnboarding return completed rows only", () => {
    expect(profileService).toContain("return isOnboardingComplete(onboarding) ? onboarding : null");
    expect(profileService).not.toContain("compatiblePayload");
  });

  it("replaces the old first-outcome page and preserves the temporary ChatGPT setup", () => {
    expect(onboardingPage).toContain("AdaptiveOnboardingForm");
    expect(onboardingPage).not.toContain("first=true");
    expect(settingsConnection).toContain("TemporaryChatGptDeveloperSetupCard");
    expect(settingsConnection).toContain("env.manualChatGptSetupEnabled");
  });
});
