import "server-only";

import { serverEnv } from "@/lib/integrations/env";

export const operationalFeatureFlags = {
  billingCheckout: serverEnv.billingCheckoutEnabled,
  privacyDeletionExecution: serverEnv.privacyDeletionExecutionEnabled,
  privacyRetentionExecution: serverEnv.privacyRetentionExecutionEnabled
} as const;

export type OperationalFeatureFlag = keyof typeof operationalFeatureFlags;

export function featureFlagEnabled(flag: OperationalFeatureFlag) {
  return operationalFeatureFlags[flag] === true;
}
