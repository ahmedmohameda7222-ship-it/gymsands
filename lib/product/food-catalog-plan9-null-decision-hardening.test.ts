import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CORRECTION = "supabase/migrations/20261013050000_food_catalog_plan9_review_decision_hardening.sql";

describe("Plan 9 forward-only NULL-decision hardening contract", () => {
  it("keeps previously applied migration immutable and explicitly denies missing decisions", () => {
    const sql = readFileSync(CORRECTION, "utf8").toLowerCase();
    expect(sql).toMatch(/create or replace function public\.food_catalog_review_ingestion_batch_v1\(p_command jsonb\)/);
    expect(sql).toMatch(/v_action\s+is\s+null/);
    expect(sql).toMatch(/v_expected_state\s+is\s+null/);
    expect(sql).toMatch(/v_action\s+not\s+in\s*\('review',\s*'approve',\s*'reject'\)/);
    expect(sql).toContain("private.food_catalog_governance_assert_capability");
    expect(sql).toContain("private.food_catalog_governance_begin_operation");
    expect(sql).toContain("private.food_catalog_governance_finish_operation");
    expect(sql).toContain("run.execution_mode = 'dry_run'");
    expect(sql).toContain("run.status = 'completed'");
    expect(sql).toContain("for update");
    expect(sql).not.toMatch(/drop\s+table|disable\s+trigger|insert\s+into\s+public\.food_ingestion_batches/i);
  });
});
