import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260825120100_nutrition_v1_plan_diary_targets.sql";
const verificationPath =
  "supabase/verification/nutrition-v1-plan-diary-targets.sql";

const migration = readFileSync(migrationPath, "utf8")
  .replaceAll("\r\n", "\n")
  .toLowerCase();
const verification = readFileSync(verificationPath, "utf8")
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

describe("Nutrition V1 plan, diary, and target migration contract", () => {
  it("creates the additive canonical target, planning, change-request, and grouped-log tables with RLS", () => {
    for (const table of [
      "nutrition_target_periods",
      "nutrition_meal_plan_weeks",
      "nutrition_planned_occurrences",
      "nutrition_meal_plan_change_requests",
      "nutrition_log_groups",
      "nutrition_log_group_items",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).not.toMatch(
      /drop\s+table\s+(if\s+exists\s+)?public\.(food_logs|user_meal_plan_items|user_nutrition_target_profiles|user_nutrition_target_date_overrides|saved_recipes|custom_meals)/,
    );
  });

  it("enforces effective-dated target periods without inventing missing nutrients", () => {
    const targets = tableDefinition("nutrition_target_periods");
    expect(targets).toContain("effective_from date not null");
    expect(targets).toContain("effective_to date");
    expect(targets).toContain("calories");
    expect(targets).toContain("protein_g");
    expect(targets).toContain("carbs_g");
    expect(targets).toContain("fat_g");
    expect(targets).toContain("water_ml");
    expect(targets).toContain("source text not null");
    expect(migration).toContain("exclude using gist");
    expect(migration).toContain("daterange(effective_from, effective_to, '[)')");
    expect(migration).not.toMatch(/coalesce\s*\(\s*(calories|protein_g|carbs_g|fat_g|water_ml)[^)]*,\s*0/);
  });

  it("gives each owner/week one revisioned week authority and same-owner occurrence parentage", () => {
    const weeks = tableDefinition("nutrition_meal_plan_weeks");
    const occurrences = tableDefinition("nutrition_planned_occurrences");

    expect(weeks).toContain("week_start_date date not null");
    expect(weeks).toContain("revision bigint not null default 0");
    expect(weeks).toContain("unique (user_id, week_start_date)");
    expect(weeks).toContain("unique (id, user_id)");

    expect(occurrences).toContain(
      "source_type text not null check (source_type in ('food', 'recipe', 'saved_meal', 'placeholder'))",
    );
    expect(occurrences).toContain("source_id uuid");
    expect(occurrences).toContain("source_version_id uuid");
    expect(occurrences).toContain("frozen_snapshot jsonb not null");
    expect(occurrences).toContain(
      "status text not null default 'planned' check (status in ('planned', 'completed', 'completed_changed', 'skipped'))",
    );
    expect(occurrences).toContain(
      "foreign key (week_id, user_id) references public.nutrition_meal_plan_weeks(id, user_id)",
    );
    expect(occurrences).toMatch(
      /source_type = 'recipe'[\s\S]*source_id is not null[\s\S]*source_version_id is not null/,
    );
  });

  it("binds external ChatGPT proposals to a base revision and makes grouped actual logging idempotent", () => {
    const requests = tableDefinition("nutrition_meal_plan_change_requests");
    const groups = tableDefinition("nutrition_log_groups");
    const items = tableDefinition("nutrition_log_group_items");

    expect(requests).toContain("base_revision bigint not null");
    expect(requests).toContain("proposal_json jsonb not null");
    expect(requests).toContain(
      "state text not null default 'pending' check (state in ('pending', 'applied', 'cancelled', 'stale'))",
    );
    expect(requests).toContain(
      "foreign key (week_id, user_id) references public.nutrition_meal_plan_weeks(id, user_id)",
    );

    expect(groups).toContain("operation_id uuid not null");
    expect(groups).toContain("frozen_snapshot jsonb not null");
    expect(groups).toContain("source_version_id uuid");
    expect(groups).toContain("unique (user_id, operation_id)");

    expect(items).toContain("food_log_id uuid");
    expect(items).toContain("frozen_item_snapshot jsonb not null");
    expect(items).toContain(
      "foreign key (group_id, user_id) references public.nutrition_log_groups(id, user_id)",
    );
  });

  it("provides transactional week mutation, stale-safe proposal apply, grouped logging, completion, and undo authorities", () => {
    for (const fn of [
      "mutate_nutrition_meal_plan_week",
      "apply_nutrition_meal_plan_change_request",
      "log_nutrition_group",
      "complete_nutrition_planned_occurrence",
      "undo_nutrition_planned_occurrence_completion",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
      expect(migration).toContain(`revoke all on function public.${fn}`);
    }

    expect(migration).toContain("security definer");
    expect(migration).toContain("base revision");
    expect(migration).toContain("operation_id");
  });

  it("ships executable verification and registers it before release preflight", () => {
    for (const phrase of [
      "nutrition v1 target period overlap protection missing",
      "nutrition v1 meal plan week rls missing",
      "nutrition v1 recipe occurrence version lineage missing",
      "nutrition v1 grouped log idempotency missing",
      "legacy nutrition compatibility table missing",
    ]) {
      expect(verification).toContain(phrase);
    }

    const nutritionVerification = databaseVerification.indexOf(
      "nutrition-v1-plan-diary-targets.sql",
    );
    const releasePreflight = databaseVerification.indexOf(
      "production-release-migration-preflight.sql",
    );
    expect(nutritionVerification).toBeGreaterThanOrEqual(0);
    expect(releasePreflight).toBeGreaterThan(nutritionVerification);
  });
});
