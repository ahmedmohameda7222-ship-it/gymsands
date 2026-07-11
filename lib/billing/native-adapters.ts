import type { NativeBillingAdapter, ProviderVerificationResult } from "@/lib/billing/contracts";

function notConfigured(provider: "apple" | "google"): ProviderVerificationResult {
  return {
    ok: false,
    code: "unsupported_event",
    message: `${provider === "apple" ? "StoreKit" : "Google Play"} server verification is not configured. No native purchase claim was accepted.`
  };
}

export const storeKitAdapterContract: NativeBillingAdapter = {
  provider: "apple",
  async verifyAndNormalize() {
    return notConfigured("apple");
  }
};

export const playBillingAdapterContract: NativeBillingAdapter = {
  provider: "google",
  async verifyAndNormalize() {
    return notConfigured("google");
  }
};
