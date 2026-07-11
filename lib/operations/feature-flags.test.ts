import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/env", () => ({
  serverEnv: { billingCheckoutEnabled: false, privacyDeletionExecutionEnabled: false, privacyRetentionExecutionEnabled: false }
}));

import { featureFlagEnabled, operationalFeatureFlags } from "@/lib/operations/feature-flags";

describe("destructive and commercial feature flags", () => {
  it("remain disabled by default in the launch configuration", () => {
    expect(operationalFeatureFlags).toEqual({ billingCheckout: false, privacyDeletionExecution: false, privacyRetentionExecution: false });
    expect(featureFlagEnabled("billingCheckout")).toBe(false);
    expect(featureFlagEnabled("privacyDeletionExecution")).toBe(false);
  });
});
