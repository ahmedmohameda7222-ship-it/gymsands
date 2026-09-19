import { describe, expect, it, vi } from "vitest";

import {
  claimPersonalCorrectionOperation,
  clearPersonalCorrectionOperation,
} from "@/lib/nutrition-v1/personal-correction-operation";

const REVISION = "11111111-1111-4111-8111-111111111111";
const OP1 = "22222222-2222-4222-8222-222222222222";
const OP2 = "33333333-3333-4333-8333-333333333333";

function command(overrides: Record<string, unknown> = {}) {
  return {
    foodId: "44444444-4444-4444-8444-444444444444",
    calories: 100,
    proteinG: null,
    carbsG: 20,
    fatG: 4,
    saturatedFatG: null,
    fiberG: null,
    sugarsG: null,
    sodiumMg: null,
    servingLabel: null,
    note: null,
    ...overrides,
  };
}

describe("Task 9 Personal Override operation identity", () => {
  it("reuses the exact operation ID and CAS tuple for the same semantic retry", () => {
    const create = vi.fn()
      .mockReturnValueOnce(OP1)
      .mockReturnValueOnce(OP2);
    const first = claimPersonalCorrectionOperation(
      null,
      command(),
      { expectedRevisionId: REVISION, expectedPointerRevision: 7 },
      create,
    );
    const retry = claimPersonalCorrectionOperation(
      first,
      command(),
      { expectedRevisionId: REVISION, expectedPointerRevision: 7 },
      create,
    );

    expect(retry).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("allocates a new operation ID when the semantic payload changes", () => {
    const create = vi.fn()
      .mockReturnValueOnce(OP1)
      .mockReturnValueOnce(OP2);
    const first = claimPersonalCorrectionOperation(
      null,
      command(),
      { expectedRevisionId: REVISION, expectedPointerRevision: 7 },
      create,
    );
    const changed = claimPersonalCorrectionOperation(
      first,
      command({ calories: 101 }),
      { expectedRevisionId: REVISION, expectedPointerRevision: 7 },
      create,
    );

    expect(changed.operationId).toBe(OP2);
    expect(changed.semanticKey).not.toBe(first.semanticKey);
  });

  it("allocates a new operation ID when current-read CAS authority changes", () => {
    const create = vi.fn()
      .mockReturnValueOnce(OP1)
      .mockReturnValueOnce(OP2);
    const first = claimPersonalCorrectionOperation(
      null,
      command(),
      { expectedRevisionId: REVISION, expectedPointerRevision: 7 },
      create,
    );
    const refreshed = claimPersonalCorrectionOperation(
      first,
      command(),
      { expectedRevisionId: "55555555-5555-4555-8555-555555555555", expectedPointerRevision: 8 },
      create,
    );

    expect(refreshed.operationId).toBe(OP2);
  });

  it("clears pending operation identity only after success", () => {
    const state = claimPersonalCorrectionOperation(
      null,
      command(),
      { expectedRevisionId: null, expectedPointerRevision: 0 },
      () => OP1,
    );

    expect(clearPersonalCorrectionOperation(state)).toBeNull();
  });
});
