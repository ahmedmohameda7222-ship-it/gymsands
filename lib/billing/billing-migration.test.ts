import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260711004551_subscription_entitlement_foundation.sql", "utf8");

describe("billing and entitlement migration", () => {
  it("creates the normalized states without seeding a price or paid capability", () => {
    for (const state of ["inactive", "trialing", "active", "grace_period", "billing_issue", "cancelled_but_active", "expired", "revoked"]) {
      expect(migration).toContain(`'${state}'`);
    }
    expect(migration).not.toMatch(/insert\s+into\s+public\.billing_offerings/i);
  });

  it("keeps provider records and the event ledger service-role only", () => {
    expect(migration).toMatch(/revoke all on table public\.billing_offerings[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant all on table public\.billing_offerings[\s\S]*to service_role/i);
    expect(migration).toMatch(/alter table public\.billing_event_ledger enable row level security/i);
    expect(migration).toContain("payload_sha256");
    expect(migration).not.toMatch(/\bpayload\s+jsonb\b/i);
  });

  it("allows authenticated members to read only their own entitlement rows", () => {
    expect(migration).toMatch(/create policy user_entitlements_select_own[\s\S]*to authenticated[\s\S]*\(select auth\.uid\(\)\) = user_id/i);
    expect(migration).toMatch(/grant select on table public\.user_entitlements to authenticated/i);
  });

  it("prevents cross-provider customer, offering, and subscription links", () => {
    expect(migration).toContain("unique (id, provider)");
    expect(migration).toContain("foreign key (billing_customer_id, provider) references public.billing_customers(id, provider)");
    expect(migration).toContain("foreign key (offering_id, provider) references public.billing_offerings(id, provider)");
    expect(migration).not.toContain("billing_customers_user_idx");
  });
});
