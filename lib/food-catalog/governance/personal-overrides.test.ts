import { describe, expect, it } from "vitest";
import { planPersonalOverrideRevision } from "./personal-overrides";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FOOD = "33333333-3333-4333-8333-333333333333";

describe("Plan 6 personal overrides", () => {
  it("creates a user-owned revision without mutating canonical Food", () => {
    const canonical = Object.freeze({ id: FOOD, calories: 100 });
    const planned = planPersonalOverrideRevision({
      authenticatedUserId: USER,
      ownerUserId: USER,
      foodId: FOOD,
      expectedRevisionId: null,
      currentRevisionNumber: null,
      nutritionOverride: { calories: null, protein_g: 20 },
      servingLabel: "1 bowl",
      note: "mine",
      delete: false,
    });

    expect(planned.revisionNumber).toBe(1);
    expect(planned.nutritionOverride).not.toBeNull();
    expect(planned.nutritionOverride?.calories).toBeNull();
    expect(canonical).toEqual({ id: FOOD, calories: 100 });
  });

  it("uses owner/CAS authority and tombstone deletion", () => {
    expect(() => planPersonalOverrideRevision({
      authenticatedUserId: OTHER,
      ownerUserId: USER,
      foodId: FOOD,
      expectedRevisionId: null,
      currentRevisionNumber: null,
      nutritionOverride: null,
      servingLabel: null,
      note: null,
      delete: false,
    })).toThrow(/owner/i);

    expect(planPersonalOverrideRevision({
      authenticatedUserId: USER,
      ownerUserId: USER,
      foodId: FOOD,
      expectedRevisionId: "44444444-4444-4444-8444-444444444444",
      currentRevisionNumber: 2,
      nutritionOverride: null,
      servingLabel: null,
      note: null,
      delete: true,
    }).isDeleted).toBe(true);
  });
});
