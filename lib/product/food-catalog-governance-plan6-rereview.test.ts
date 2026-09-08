import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planCanonicalCorrection } from "../food-catalog/governance/canonical-commands";

const MIGRATION = "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql";
const sql = readFileSync(MIGRATION, "utf8").toLowerCase();

function body(name: string) {
  const marker = `create or replace function ${name.toLowerCase()}`;
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const next = sql.indexOf("create or replace function ", start + marker.length);
  return sql.slice(start, next < 0 ? sql.length : next);
}

describe("Plan 6 independent Planner re-review blockers", () => {
  it("P1-1 binds service governance identity to a trusted execution identity instead of caller UUID", () => {
    expect(sql).toContain("service_identity_sha256");
    expect(sql).toContain("food_catalog_governance_service_principal_for_request");
    const proposal = body("public.food_catalog_service_propose_correction");
    expect(proposal).not.toMatch(/p_principal_id\s+uuid/);
    expect(proposal).toContain("food_catalog_governance_service_principal_for_request");
  });

  it("P1-2 requires correction.apply and the domain capability for canonical apply", () => {
    const planned = planCanonicalCorrection({
      commandName: "apply_nutrition_correction",
      category: "wrong_nutrition",
      foodId: "11111111-1111-4111-8111-111111111111",
      correctionCaseId: "22222222-2222-4222-8222-222222222222",
      caseState: "approved",
      expectedAuthorityId: null,
      payload: { calories: null },
    }) as { requiredCapabilities?: readonly string[] };
    expect(planned.requiredCapabilities).toEqual(["food.correction.apply", "food.nutrition.correct"]);
    expect(body("private.food_catalog_governance_prepare_apply")).toContain("food.correction.apply");
    expect(body("public.food_catalog_resolve_duplicate")).toContain("food.correction.apply");
  });

  it("P1-3 mirrors the exhaustive category/evidence matrix at the DB boundary", () => {
    const policy = body("private.food_catalog_governance_evidence_type_allowed");
    expect(policy).not.toBe("");
    for (const category of [
      "wrong_nutrition","missing_nutrition","wrong_serving","missing_serving","wrong_name","wrong_translation",
      "wrong_barcode","wrong_taxonomy","wrong_market_relevance","duplicate_food","wrong_variant","outdated_product","source_conflict","other",
    ]) expect(policy).toContain(category);
    expect(body("public.food_catalog_attach_correction_evidence")).toContain("food_catalog_governance_evidence_type_allowed");
  });

  it("P1-4 freezes evidence after review decision", () => {
    const attach = body("public.food_catalog_attach_correction_evidence");
    expect(attach).toMatch(/correction_cases[\s\S]*for update/);
    expect(attach).toMatch(/state[\s\S]*reported[\s\S]*under_review/);
    expect(attach).toContain("evidence is frozen");
  });

  it("P1-5 gives outbox claims crash-safe lease identity and stale-finish protection", () => {
    expect(sql).toContain("lease_token uuid");
    expect(sql).toContain("lease_expires_at timestamptz");
    expect(body("public.food_catalog_claim_governance_outbox")).toContain("available_at <=");
    const finish = body("public.food_catalog_finish_governance_outbox");
    expect(finish).toMatch(/p_lease_token\s+uuid/);
    expect(finish).toContain("lease_token=p_lease_token");
  });

  it("P1-6 gives each serving lineage an independent stable authority key", () => {
    expect(sql).toContain("food_catalog_serving_fact_lineages");
    const serving = body("public.food_catalog_apply_serving_correction");
    expect(serving).toMatch(/p_serving_lineage_id\s+uuid/);
    expect(serving).toContain("p_serving_lineage_id::text");
    expect(serving).not.toContain("'serving_option','',p_reason");
  });

  it("P1-7 uses immutable versioned policy authority with a trusted current pointer", () => {
    expect(sql).toContain("food_catalog_governance_policy_versions");
    expect(sql).toContain("food_catalog_governance_policy_pointer");
    expect(sql).toContain("food_catalog_governance_current_policy_version");
    expect(body("public.food_catalog_report_correction")).not.toMatch(/p_policy_version\s+text/);
    expect(body("public.food_catalog_service_propose_correction")).not.toMatch(/p_policy_version\s+text/);
  });

  it("P1-8 prevents removal of the final Owner recovery authority", () => {
    expect(sql).toContain("food_catalog_governance_assert_recovery_survives");
    expect(body("public.food_catalog_revoke_governance_capability")).toContain("food_catalog_governance_assert_recovery_survives");
    expect(body("public.food_catalog_manage_governance_principal")).toContain("food_catalog_governance_assert_recovery_survives");
  });

  it("P1-9 makes barcode corrections change effective food_barcodes truth with validated GTIN", () => {
    expect(sql).toContain("food_catalog_gtin_is_valid");
    expect(sql).toContain("food_barcodes_gtin_gs1_mod10_check");
    const barcode = body("public.food_catalog_apply_barcode_correction");
    expect(barcode).toContain("insert into public.food_barcodes");
    expect(barcode).toContain("delete from public.food_barcodes");
    expect(sql).toContain("food_catalog_lookup_effective_barcode");
  });

  it("P2 personal overrides use owner-scoped idempotency and bounded validated payloads", () => {
    expect(sql).toContain("food_personal_override_operations");
    const setOverride = body("public.food_catalog_set_personal_override");
    const deleteOverride = body("public.food_catalog_delete_personal_override");
    for (const fn of [setOverride, deleteOverride]) {
      expect(fn).toContain("semantic_checksum_sha256");
      expect(fn).toContain("operation_id");
    }
    expect(setOverride).toContain("food_catalog_validate_personal_nutrition_override");
    expect(setOverride).toContain("serving label is too long");
    expect(setOverride).toContain("personal override note is too long");
  });

  it("P2 recursively rejects nested sensitive evidence and enforces bounded depth", () => {
    expect(sql).toContain("food_catalog_governance_validate_bounded_evidence");
    const report = body("public.food_catalog_report_correction");
    const proposal = body("public.food_catalog_service_propose_correction");
    expect(report).toContain("food_catalog_governance_validate_bounded_evidence");
    expect(proposal).toContain("food_catalog_governance_validate_bounded_evidence");
  });

  it("P2 enforces GS1 Mod-10 on the durable effective barcode table and correction RPC", () => {
    expect(sql).toMatch(/alter table public\.food_barcodes[\s\S]*food_barcodes_gtin_gs1_mod10_check/);
    expect(body("public.food_catalog_apply_barcode_correction")).toContain("food_catalog_gtin_is_valid");
  });
});
