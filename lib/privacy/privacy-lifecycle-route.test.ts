import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/internal/maintenance/privacy-lifecycle/route.ts"),
  "utf8"
);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260710235035_privacy_deletion_export_retention_lifecycle.sql"),
  "utf8"
);

describe("privacy lifecycle safety gates", () => {
  it("keeps destructive deletion disabled unless an explicit server flag is true", () => {
    expect(route).toContain("privacyDeletionExecutionEnabled");
    expect(route).toContain("destructive_execution: false");
    expect(route.indexOf("if (!serverEnv.privacyDeletionExecutionEnabled)")).toBeLessThan(route.indexOf("claim_account_deletion_jobs"));
  });

  it("requires configured retention periods and supports a dry run", () => {
    expect(route).toContain("owner_legal_periods_required");
    expect(route).toContain("p_dry_run: !serverEnv.privacyRetentionExecutionEnabled");
    expect(migration).toContain("if not p_dry_run then");
  });

  it("keeps lifecycle tables service-role-only", () => {
    expect(migration).toContain("revoke all on table public.account_deletion_jobs from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.privacy_deletion_legal_holds from public, anon, authenticated");
  });
});
