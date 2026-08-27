import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260827103000_nutrition_v1_long_term_architecture_corrections.sql",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();
const verification = readFileSync(
  "supabase/verification/nutrition-v1-long-term-architecture.sql",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();
const databaseVerification = readFileSync(
  "scripts/run-database-verification.mjs",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

describe("Nutrition V1 long-term architecture correction migration", () => {
  it("moves Food Library filtering/ranking/keyset pagination into one owner-derived database authority", () => {
    expect(migration).toContain("create or replace function public.search_nutrition_food_library");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("food.lifecycle_status = 'active'");
    expect(migration).toContain("food.is_global = true");
    expect(migration).toContain("candidate.match_tier");
    expect(migration).toContain("after_cursor as");
    expect(migration).toContain("limit v_limit + 1");
    expect(migration).not.toMatch(/limit\s+80\b/);
    expect(verification).toContain("valid 81st catalog match");
  });

  it("makes Cooking Start Over one idempotent transactional operation", () => {
    expect(migration).toContain("create or replace function public.start_over_nutrition_cooking_session");
    expect(migration).toContain("restart_parent_session_id");
    expect(migration).toContain("nutrition_cooking_sessions_restart_once_idx");
    expect(migration).toContain("for update");
    expect(migration).toContain("nutrition_cooking_action_states");
    expect(verification).toContain("partial replacement after injected failure");
    expect(verification).toContain("duplicate start over did not converge");
    expect(verification).toContain("exists without its complete required initial state");
  });

  it("creates the Recipe root and initial Working Draft in one transaction", () => {
    expect(migration).toContain("create or replace function public.create_nutrition_recipe_draft");
    expect(migration).toContain("insert into public.nutrition_recipes");
    expect(migration).toContain("insert into public.nutrition_recipe_drafts");
    expect(verification).toContain("partial recipe root behind");
  });

  it("installs one repository-controlled automatic retention purge schedule", () => {
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("nutrition-v1-retention-purge-hourly");
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain("purge_expired_nutrition_reusable_sources");
    expect(verification).toContain("automatic retention purge scheduler");
    expect(verification).toContain("frozen meal plan or diary/history consumers were lost");
  });

  it("registers disposable integration verification before release preflight", () => {
    const correction = databaseVerification.indexOf("nutrition-v1-long-term-architecture.sql");
    const preflight = databaseVerification.indexOf("production-release-migration-preflight.sql");
    expect(correction).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(correction);
  });
});
