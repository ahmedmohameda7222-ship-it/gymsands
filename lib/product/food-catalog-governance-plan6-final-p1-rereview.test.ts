import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql",
  "utf8",
);
const PRIVACY_ROUTE = readFileSync("app/api/user/privacy-requests/route.ts", "utf8");
const DELETION_WORKER = readFileSync("lib/privacy/account-deletion-worker.ts", "utf8");

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Food Catalog Plan 6 final P1 adversarial contracts", () => {
  it("uses one deadlock-safe Food-row then normalized-GTIN lock order for barcode writers", () => {
    expect(MIGRATION).toContain(
      "create or replace function private.food_catalog_lock_food_authority(p_food_id uuid)",
    );

    const trigger = section(
      MIGRATION,
      "create or replace function private.food_catalog_serialize_gtin_write()",
      "create or replace function private.food_catalog_governance_lock_recovery_set()",
    );
    expect(trigger).toMatch(/food_catalog_lock_food_authority\((?:new|old)\.food_id\)/i);
    expect(trigger.indexOf("food_catalog_lock_food_authority")).toBeLessThan(
      trigger.indexOf("food_catalog_lock_gtin_authority"),
    );

    const barcodeApply = section(
      MIGRATION,
      "create or replace function public.food_catalog_apply_barcode_correction(",
      "create or replace function public.food_catalog_lookup_effective_barcode(",
    );
    expect(barcodeApply).toContain("private.food_catalog_lock_food_authority(p_food_id)");
    expect(barcodeApply.indexOf("private.food_catalog_lock_food_authority(p_food_id)")).toBeLessThan(
      barcodeApply.indexOf("private.food_catalog_lock_gtin_authority(v_key)"),
    );
    expect(barcodeApply.indexOf("private.food_catalog_lock_gtin_authority(v_key)")).toBeLessThan(
      barcodeApply.indexOf("private.food_catalog_governance_prepare_apply("),
    );
    expect(barcodeApply).toContain("Effective GTIN assignment changed ownership during correction.");
  });

  it("binds human governance authority to live active Auth identities and guards account deletion", () => {
    const principals = section(
      MIGRATION,
      "create table public.food_catalog_governance_principals (",
      "create table public.food_catalog_governance_capability_assignments (",
    );
    expect(principals).toContain("human_user_id uuid");
    expect(principals).toMatch(/principal_type='human'[\s\S]*human_user_id is not null/);

    const principalResolver = section(
      MIGRATION,
      "create or replace function private.food_catalog_governance_principal_for_user()",
      "create or replace function private.food_catalog_governance_service_principal_for_request()",
    );
    expect(principalResolver).toContain("private.food_catalog_lock_account_purge(auth.uid())");
    expect(principalResolver).toContain("join auth.users");
    expect(principalResolver).toContain("join public.account_access_states");
    expect(principalResolver).toContain("p.human_user_id=auth.uid()");
    expect(principalResolver).toContain("state='active'");
    expect(principalResolver).toContain("disabled_at is null");

    const recovery = section(
      MIGRATION,
      "create or replace function private.food_catalog_governance_assert_recovery_exists()",
      "create or replace function private.food_catalog_lock_food_pair(",
    );
    expect(recovery).toContain("join auth.users");
    expect(recovery).toContain("join public.account_access_states");
    expect(recovery).toContain("state='active'");
    expect(recovery).toContain("disabled_at is null");

    const manage = section(
      MIGRATION,
      "create or replace function public.food_catalog_manage_governance_principal(",
      "create or replace function public.food_catalog_revoke_governance_capability(",
    );
    expect(manage).toContain("human_user_id");
    expect(manage).toContain("from auth.users");
    expect(manage).toContain("from public.account_access_states");

    expect(MIGRATION).toContain("create or replace function public.food_catalog_begin_account_deletion(");
    expect(PRIVACY_ROUTE).toContain('.rpc("food_catalog_begin_account_deletion"');
    expect(DELETION_WORKER).toContain('.rpc("food_catalog_begin_account_deletion"');
  });

  it("separates member report payload from immutable non-personal report metadata and purges it", () => {
    const reports = section(
      MIGRATION,
      "create table public.food_catalog_correction_reports (",
      "create table public.food_catalog_correction_evidence (",
    );
    expect(reports).toContain("create table public.food_catalog_correction_report_member_payloads (");

    const metadataOnly = reports.slice(
      0,
      reports.indexOf("create table public.food_catalog_correction_report_member_payloads (")
    );
    expect(metadataOnly).not.toContain("reporter_user_id");
    expect(metadataOnly).not.toContain("description text");
    expect(metadataOnly).not.toContain("evidence jsonb");

    const reportRpc = section(
      MIGRATION,
      "create or replace function public.food_catalog_report_correction(",
      "create or replace function public.food_catalog_attach_correction_evidence(",
    );
    expect(reportRpc).toContain("private.food_catalog_governance_require_active_member_account(v_user)");
    expect(reportRpc).toContain("insert into public.food_catalog_correction_reports");
    expect(reportRpc).toContain("insert into public.food_catalog_correction_report_member_payloads");

    const purge = section(
      MIGRATION,
      "create or replace function public.purge_account_application_data_atomic(p_user_id uuid)",
      "create or replace function public.food_catalog_governance_metrics()",
    );
    expect(purge).toContain("delete from public.food_catalog_correction_report_member_payloads");
    expect(purge).toContain("Food Catalog Plan 6 correction report member payload purge left owner rows behind.");
  });
});