import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260827060000_nutrition_v1_review_atomicity_corrections.sql";
const verificationPath = "supabase/verification/nutrition-v1-review-atomicity.sql";

const migration = readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const verification = readFileSync(verificationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const databaseVerification = readFileSync("scripts/run-database-verification.mjs", "utf8").replaceAll("\r\n", "\n").toLowerCase();

describe("Nutrition V1 review atomicity correction migration", () => {
  it("uses executable multiline SQL rather than escaped line separators", () => {
    expect(migration.split("\n").length).toBeGreaterThan(50);
    expect(verification.split("\n").length).toBeGreaterThan(50);
    expect(migration).not.toContain("\\ncreate or replace function");
    expect(verification).not.toContain("\\nbegin;");
  });

  it("adds owner-derived transactional Cooking Session synchronization", () => {
    expect(migration).toContain("create or replace function public.sync_nutrition_cooking_session_state");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("for update");
    expect(migration).toContain("state_revision = p_expected_revision");
    expect(migration).toContain("nutrition_cooking_action_states");
    expect(migration).toContain("nutrition_cooking_timers");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
  });

  it("adds owner-derived transactional Working Draft replacement", () => {
    expect(migration).toContain("create or replace function public.autosave_nutrition_recipe_draft");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("nutrition_recipe_drafts");
    expect(migration).toContain("delete from public.nutrition_recipe_ingredients");
    expect(migration).toContain("delete from public.nutrition_recipe_actions");
    expect(migration).toContain("delete from public.nutrition_recipe_equipment");
    expect(migration).toContain("security definer");
  });

  it("keeps both commands member-executable but unavailable to public and anon callers", () => {
    for (const signature of [
      "public.sync_nutrition_cooking_session_state(uuid, bigint, text, timestamptz, jsonb, jsonb)",
      "public.autosave_nutrition_recipe_draft(uuid, jsonb, jsonb, jsonb, jsonb)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated, service_role`);
    }
  });

  it("ships executable verification registered before release preflight", () => {
    for (const phrase of [
      "nutrition v1 cooking atomic sync rpc missing",
      "nutrition v1 revision-aware recipe atomic autosave rpc missing",
      "nutrition v1 atomic review rpc execute grants invalid",
    ]) {
      expect(verification).toContain(phrase);
    }
    const correction = databaseVerification.indexOf("nutrition-v1-review-atomicity.sql");
    const releasePreflight = databaseVerification.indexOf("production-release-migration-preflight.sql");
    expect(correction).toBeGreaterThanOrEqual(0);
    expect(releasePreflight).toBeGreaterThan(correction);
  });
});
