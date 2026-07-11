export const BILLING_PROVIDERS = ["stripe", "apple", "google"] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const ENTITLEMENT_STATES = [
  "inactive",
  "trialing",
  "active",
  "grace_period",
  "billing_issue",
  "cancelled_but_active",
  "expired",
  "revoked"
] as const;

export type EntitlementState = (typeof ENTITLEMENT_STATES)[number];

export type VerifiedProviderEvent = {
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  occurredAt: string;
  userId: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerProductId: string | null;
  providerPriceId: string | null;
  providerStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  gracePeriodEnd: string | null;
  revokedAt: string | null;
  reasonCode: "subscription_update" | "payment_failed" | "payment_recovered" | "refund" | "chargeback" | "revocation";
};

export type EntitlementSnapshot = {
  userId: string;
  capabilityKey: string;
  state: EntitlementState;
  sourceProvider: BillingProvider | "manual";
  validFrom: string | null;
  validThrough: string | null;
  gracePeriodEnd: string | null;
  revokedAt: string | null;
  reasonCode: string | null;
  version: number;
};

export type ProviderVerificationResult =
  | { ok: true; event: VerifiedProviderEvent; payloadSha256: string }
  | { ok: false; code: "invalid_signature" | "invalid_payload" | "unsupported_event"; message: string };

export interface NativeBillingAdapter {
  readonly provider: "apple" | "google";
  verifyAndNormalize(payload: string, signature: string | null): Promise<ProviderVerificationResult>;
}

export type EntitlementError = {
  code: "entitlement_required";
  message: string;
  capability: string;
  checkout_url: string;
};

export function entitlementRequired(capability: string, applicationOrigin: string): EntitlementError {
  return {
    code: "entitlement_required",
    message: "This capability is not active for the connected Plaivra account. Manage access on Plaivra's website.",
    capability,
    checkout_url: new URL("/settings/subscription", applicationOrigin).toString()
  };
}
