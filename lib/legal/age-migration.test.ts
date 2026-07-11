import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260710164946_enforce_initial_launch_age_16.sql",
  "utf8"
).toLowerCase();
const report = readFileSync("supabase/verification/age-eligibility-review.sql", "utf8").toLowerCase();

describe("staged 16+ database convergence", () => {
  it("preserves existing rows while enforcing the 16 boundary for changed data", () => {
    expect(migration).toContain("age between 16 and 100");
    expect(migration).toContain("not valid");
    expect(migration).not.toMatch(/delete\s+from\s+public\.onboarding_answers/);
    expect(migration).not.toMatch(/validate\s+constraint\s+onboarding_answers_age_launch_check\s*;/);
  });

  it("provides an owner-only read-only review query without account data output", () => {
    expect(report).toContain("conflict_under_16");
    expect(report).toContain("missing_confirmation");
    expect(report).toContain("missing_age");
    expect(report).not.toMatch(/\b(update|delete|insert|alter|drop)\b\s+(table|from|into)/);
  });
});
