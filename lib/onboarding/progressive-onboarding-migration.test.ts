import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260710211000_progressive_onboarding_and_legacy_constraints.sql"),
  "utf8"
);
const onboarding = fs.readFileSync(path.join(root, "app/(private)/onboarding/page.tsx"), "utf8");

describe("progressive onboarding migration", () => {
  it("adds resumable stages and preserves legacy completion semantics", () => {
    expect(migration).toContain("setup_stage integer not null default 0");
    expect(migration).toContain("completed_at timestamptz");
    expect(migration).toContain("an onboarding_answers row was only written");
    expect(migration).toContain("setup_stage = 4");
    expect(migration).toContain("completed_at = coalesce(completed_at, updated_at, created_at, now())");
    expect(migration).toMatch(/where completed_at is null\s+and \(age is null or age between 16 and 100\)/i);
  });

  it("retains legacy functional notes without overwriting existing retained context", () => {
    expect(migration).toContain("legacy_context_notes text");
    expect(migration).toContain("public.user_fitness_constraints.legacy_context_notes");
    expect(migration).not.toMatch(/delete\s+from\s+public\.onboarding_answers/i);
  });

  it("uses five progressive stages and canonical constraints in the active UI", () => {
    expect(onboarding).toContain("ONBOARDING_STEPS");
    expect(onboarding).toContain("upsertFitnessConstraints");
    expect(onboarding).toContain("permissionsForFirstJob");
    expect(onboarding).not.toContain("ALL_AI_PERMISSION_SECTIONS.map");
  });
});
