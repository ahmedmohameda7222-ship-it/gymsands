import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

const verification = readFileSync(
  "supabase/verification/nutrition-v1-cooking-sessions.sql",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

const databaseVerification = readFileSync(
  "scripts/run-database-verification.mjs",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

function tableDefinition(table: string) {
  const match = migration.match(
    new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`),
  );
  if (!match) throw new Error(`Missing ${table} table definition.`);
  return match[0];
}

describe("Nutrition V1 Cooking Session migration contract", () => {
  it("creates owner-scoped session, action-state, and timer persistence", () => {
    for (const table of [
      "nutrition_cooking_sessions",
      "nutrition_cooking_action_states",
      "nutrition_cooking_timers",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`on public.${table}`);
      expect(migration).toContain("user_id = (select auth.uid())");
    }
  });

  it("freezes Recipe-version lineage and resumable session state without purgeable Recipe FKs", () => {
    const sessions = tableDefinition("nutrition_cooking_sessions");

    expect(sessions).toContain("recipe_id uuid not null");
    expect(sessions).toContain("recipe_version_id uuid not null");
    expect(sessions).toContain("frozen_recipe_snapshot jsonb not null");
    expect(sessions).toContain("current_action_key text");
    expect(sessions).toContain(
      "status text not null default 'active' check (status in ('active', 'completed', 'ended'))",
    );
    expect(sessions).toContain("started_at timestamptz not null");
    expect(sessions).toContain("last_active_at timestamptz not null");
    expect(sessions).toContain("state_revision bigint not null default 0");
    expect(sessions).toContain("unique (id, user_id)");

    expect(sessions).not.toMatch(
      /recipe_(?:id|version_id)\s+uuid[^,;]*references\s+public\.nutrition_recipe/,
    );
  });

  it("stores the complete deterministic action-state vocabulary with same-owner session parentage", () => {
    const actions = tableDefinition("nutrition_cooking_action_states");

    expect(actions).toContain("action_key text not null");
    expect(actions).toContain(
      "state text not null default 'not_available' check (state in ('not_available', 'ready', 'active', 'waiting_for_condition', 'running_background', 'completed', 'deferred', 'skipped'))",
    );
    expect(actions).toContain("state_revision bigint not null default 0");
    expect(actions).toContain(
      "foreign key (session_id, user_id) references public.nutrition_cooking_sessions(id, user_id)",
    );
    expect(actions).toContain("unique (session_id, action_key)");
  });

  it("supports multiple named action-owned timers reconstructable from timestamps", () => {
    const timers = tableDefinition("nutrition_cooking_timers");

    expect(timers).toContain("action_state_id uuid not null");
    expect(timers).toContain("timer_name text not null");
    expect(timers).toContain("duration_seconds integer not null");
    expect(timers).toContain("started_at timestamptz");
    expect(timers).toContain("target_at timestamptz");
    expect(timers).toContain("paused_at timestamptz");
    expect(timers).toContain("paused_remaining_seconds integer");
    expect(timers).toContain(
      "foreign key (action_state_id, user_id) references public.nutrition_cooking_action_states(id, user_id)",
    );
    expect(timers).toContain("unique (action_state_id, timer_name)");
    expect(timers).not.toContain("unique (action_state_id)");
  });

  it("does not persist inferred boiling, browning, doneness, readiness, or food-safety claims", () => {
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
