import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ process: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/billing/stripe-event-processor", () => ({ processStripeSubscriptionEvent: mocks.process }));
vi.mock("@/lib/billing/stripe-server", () => ({ getStripeClient: () => ({ events: { retrieve: mocks.retrieve } }) }));

import { processClaimedStripeEvent } from "@/lib/billing/stripe-event-worker";

function adminWithLedgerUpdate(error: { message: string } | null) {
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(async () => ({ data: null, error }));
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

describe("Stripe durable event worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not report success when completion unlock cannot be persisted", async () => {
    mocks.process.mockResolvedValue({ status: "processed" });
    const event = { id: "evt_1", type: "customer.subscription.updated" } as never;
    await expect(processClaimedStripeEvent(adminWithLedgerUpdate({ message: "write failed" }), {
      id: 1,
      provider_event_id: "evt_1",
      processing_attempts: 1
    }, event)).rejects.toThrow(/completion state|retry state/);
  });

  it("does not hide a failed retry-state write", async () => {
    mocks.retrieve.mockRejectedValue(new Error("provider unavailable"));
    await expect(processClaimedStripeEvent(adminWithLedgerUpdate({ message: "write failed" }), {
      id: 1,
      provider_event_id: "evt_1",
      processing_attempts: 2
    })).rejects.toThrow("retry state");
  });
});
