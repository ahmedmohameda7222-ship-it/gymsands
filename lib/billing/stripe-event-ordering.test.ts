import { describe, expect, it } from "vitest";
import { providerEventIsStale } from "@/lib/billing/stripe-event-processor";

describe("Stripe event ordering", () => {
  it("ignores duplicate and out-of-order provider events", () => {
    const latest = "2026-07-11T10:00:00.000Z";
    expect(providerEventIsStale(latest, "2026-07-11T09:59:59.000Z")).toBe(true);
    expect(providerEventIsStale(latest, latest)).toBe(true);
    expect(providerEventIsStale(latest, "2026-07-11T10:00:01.000Z")).toBe(false);
  });

  it("allows the first provider event and does not treat malformed dates as authoritative", () => {
    expect(providerEventIsStale(null, "2026-07-11T10:00:00.000Z")).toBe(false);
    expect(providerEventIsStale("invalid", "2026-07-11T10:00:00.000Z")).toBe(false);
  });
});
