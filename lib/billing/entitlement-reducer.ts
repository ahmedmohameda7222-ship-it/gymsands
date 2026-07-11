import type { EntitlementSnapshot, EntitlementState, VerifiedProviderEvent } from "@/lib/billing/contracts";

const ACCESS_STATES = new Set<EntitlementState>(["trialing", "active", "grace_period", "cancelled_but_active"]);

function after(value: string | null, now: Date) {
  return Boolean(value && Date.parse(value) > now.getTime());
}

export function normalizeEntitlementState(event: VerifiedProviderEvent, now = new Date()): EntitlementState {
  if (event.reasonCode === "revocation" || event.reasonCode === "chargeback" || event.revokedAt) return "revoked";
  if (event.reasonCode === "refund" && !after(event.currentPeriodEnd, now)) return "expired";
  if (event.reasonCode === "payment_failed") {
    return after(event.gracePeriodEnd, now) ? "grace_period" : "billing_issue";
  }

  switch (event.providerStatus) {
    case "trialing":
      return after(event.trialEnd ?? event.currentPeriodEnd, now) ? "trialing" : "expired";
    case "active":
      return event.cancelAtPeriodEnd && after(event.currentPeriodEnd, now) ? "cancelled_but_active" : "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return after(event.gracePeriodEnd, now) ? "grace_period" : "billing_issue";
    case "canceled":
    case "cancelled":
      return after(event.currentPeriodEnd, now) ? "cancelled_but_active" : "expired";
    case "expired":
      return "expired";
    case "revoked":
      return "revoked";
    default:
      return "inactive";
  }
}

export function reduceEntitlements(
  current: EntitlementSnapshot[],
  event: VerifiedProviderEvent,
  capabilityKeys: string[],
  now = new Date()
): EntitlementSnapshot[] {
  if (!event.userId) return current;
  const state = normalizeEntitlementState(event, now);
  const byCapability = new Map(current.map((item) => [item.capabilityKey, item]));

  for (const capabilityKey of capabilityKeys) {
    const previous = byCapability.get(capabilityKey);
    byCapability.set(capabilityKey, {
      userId: event.userId,
      capabilityKey,
      state,
      sourceProvider: event.provider,
      validFrom: event.currentPeriodStart,
      validThrough: event.currentPeriodEnd,
      gracePeriodEnd: event.gracePeriodEnd,
      revokedAt: state === "revoked" ? event.revokedAt ?? event.occurredAt : null,
      reasonCode: event.reasonCode,
      version: (previous?.version ?? 0) + 1
    });
  }

  return Array.from(byCapability.values()).sort((a, b) => a.capabilityKey.localeCompare(b.capabilityKey));
}

export function hasCapabilityAccess(entitlement: EntitlementSnapshot | null | undefined, now = new Date()) {
  if (!entitlement || !ACCESS_STATES.has(entitlement.state) || entitlement.revokedAt) return false;
  if (entitlement.state === "grace_period" && !after(entitlement.gracePeriodEnd, now)) return false;
  if (entitlement.validThrough && Date.parse(entitlement.validThrough) <= now.getTime()) return false;
  return true;
}
