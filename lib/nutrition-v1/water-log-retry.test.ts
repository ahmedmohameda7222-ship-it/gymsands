import { describe, expect, it } from "vitest";

import { resolveWaterLogIntent } from "@/lib/nutrition-v1/water-log-retry";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("water log retry identity", () => {
  it("reuses the operation ID for an unchanged ambiguous retry", () => {
    const first = resolveWaterLogIntent(null, { ownerId: "owner-a", date: "2026-08-29", amountMl: 250 }, () => firstId);
    const retry = resolveWaterLogIntent(first, { ownerId: "owner-a", date: "2026-08-29", amountMl: 250 }, () => secondId);
    expect(retry.operationId).toBe(firstId);
  });

  it("rotates the operation ID when owner, date, or amount changes", () => {
    const first = resolveWaterLogIntent(null, { ownerId: "owner-a", date: "2026-08-29", amountMl: 250 }, () => firstId);
    const changed = resolveWaterLogIntent(first, { ownerId: "owner-a", date: "2026-08-29", amountMl: 500 }, () => secondId);
    expect(changed.operationId).toBe(secondId);
  });
});
