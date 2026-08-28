import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql", "utf8").toLowerCase();
const verification = readFileSync("supabase/verification/nutrition-v1-cooking-sessions.sql", "utf8").toLowerCase();
const databaseVerification = readFileSync("scripts/run-database-verification.mjs", "utf8").toLowerCase();

describe("Nutrition V1 Cooking Session migration", () => {
  it("stores frozen recipe state and server-owned resumable execution state", () => {
    for (const required of [
      "nutrition_cooking_sessions",
      "frozen_recipe_snapshot",
      "serving_scale",
      "current_action_key",
      "state_revision",
      "nutrition_cooking_action_states",
      "action_key",
      "nutrition_cooking_timers",
      "timer_name",
      "duration_seconds",
      "target_at",
      "paused_remaining_seconds",
    ]) {
      expect(migration).toContain(required);
    }
  });

  it("keeps Cooking Session truth owner-scoped with RLS and immutable frozen snapshots", () => {
    for (const table of [
      "nutrition_cooking_sessions",
      "nutrition_cooking_action_states",
      "nutrition_cooking_timers",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("prevent_nutrition_cooking_snapshot_mutation");
    expect(migration).toContain("frozen Recipe snapshot is immutable".toLowerCase());
  });

  it("does not persist sensor-derived truth or automatic doneness claims", () => {
    for (const prohibited of [
      "is_boiling",
      "is_browned",
      "is_browning",
      "is_done",
      "is_doneness",
      "is_ready_to_eat",
      "is_safe_to_eat",
      "food_safety_state",
      "detected_temperature",
    ]) {
      expect(migration).not.toContain(prohibited);
    }
  });

  it("ships executable owner/resume/timer verification and registers it before release preflight", () => {
    for (const phrase of [
      "nutrition v1 cooking session rls missing",
      "nutrition v1 cooking frozen recipe snapshot missing",
      "nutrition v1 cooking action state vocabulary invalid",
      "nutrition v1 cooking timer display metadata is still acting as identity",
      "nutrition v1 cooking same-name timer lookup index missing",
      "nutrition v1 cooking cross-owner access leaked",
      "nutrition v1 cooking resumable state contract missing",
    ]) {
      expect(verification).toContain(phrase);
    }

    const nutritionVerification = databaseVerification.indexOf(
      "nutrition-v1-cooking-sessions.sql",
    );
    const releasePreflight = databaseVerification.indexOf(
      "production-release-migration-preflight.sql",
    );
    expect(nutritionVerification).toBeGreaterThanOrEqual(0);
    expect(releasePreflight).toBeGreaterThan(nutritionVerification);
  });
});