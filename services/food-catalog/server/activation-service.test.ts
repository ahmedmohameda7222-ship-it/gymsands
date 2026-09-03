import { describe, expect, it, vi } from "vitest";
import type { ActivationSetMemberDraft } from "@/lib/food-catalog/domain/activation";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";
import {
  buildActivationManifest,
  createActivationSet,
  grantActivationSet,
  invalidateActivationGrant,
} from "./activation-service";

const ACTOR = {
  principalId: "planner-fixture",
  principalType: "human" as const,
  authorityReference: "fixture-authority",
  reasonCode: "fixture",
  policyVersion: "control-v1",
};

function member(foodId: string, overrides: Partial<ActivationSetMemberDraft> & { id?: string } = {}) {
  return {
    id: overrides.id ?? `member-${foodId}`,
    foodId,
    expectedPreconditionLifecycle: "draft" as const,
    evidenceReference: "fixture:evidence",
    evidenceChecksumSha256: "a".repeat(64),
    sourceLegalAccepted: true,
    identityResolved: true,
    nutritionBasisValid: true,
    displayIdentityValid: true,
    blockingConditionCount: 0,
    eligibility: "eligible" as const,
    memberChecksumSha256: "b".repeat(64),
    ...overrides,
  };
}

function commandStore(): FoodCatalogGenerationCommandStore {
  const result = Promise.resolve({
    operationId: "51000000-0000-4000-8000-000000000001",
    eventId: "52000000-0000-4000-8000-000000000001",
    generationId: null,
    validationReportId: null,
    pointerRevision: null,
  });
  return {
    createActivationSet: vi.fn(() => result),
    grantActivationSet: vi.fn(() => result),
    invalidateActivationGrant: vi.fn(() => result),
    createGeneration: vi.fn(() => result),
    recordValidation: vi.fn(() => result),
    promoteGeneration: vi.fn(() => result),
    rollbackGeneration: vi.fn(() => result),
    revokeGeneration: vi.fn(() => result),
  };
}

const MANIFEST_BASE = {
  manifestSchemaVersion: "activation-manifest-v1",
  activationPolicyVersion: "activation-policy-v1",
};

describe("Food Catalog Plan 3 activation service", () => {
  it("canonicalizes member order before hashing the manifest", () => {
    const a = member("10000000-0000-4000-8000-000000000001");
    const b = member("20000000-0000-4000-8000-000000000001");

    const forward = buildActivationManifest({ ...MANIFEST_BASE, members: [a, b] });
    const reverse = buildActivationManifest({ ...MANIFEST_BASE, members: [b, a] });

    expect(forward.manifestChecksumSha256).toBe(reverse.manifestChecksumSha256);
    expect(forward.members.map((item) => item.foodId)).toEqual([a.foodId, b.foodId]);
    expect(reverse.members.map((item) => item.foodId)).toEqual([a.foodId, b.foodId]);
  });

  it("changes the checksum when semantic evidence or eligibility changes", () => {
    const base = buildActivationManifest({ ...MANIFEST_BASE, members: [member("10000000-0000-4000-8000-000000000001")] });
    const changedEvidence = buildActivationManifest({
      ...MANIFEST_BASE,
      members: [member("10000000-0000-4000-8000-000000000001", { evidenceReference: "fixture:other" })],
    });
    const changedEligibility = buildActivationManifest({
      ...MANIFEST_BASE,
      members: [member("10000000-0000-4000-8000-000000000001", { eligibility: "rejected", blockingConditionCount: 1 })],
    });

    expect(changedEvidence.manifestChecksumSha256).not.toBe(base.manifestChecksumSha256);
    expect(changedEligibility.manifestChecksumSha256).not.toBe(base.manifestChecksumSha256);
  });

  it("rejects duplicate Food identities inside one activation manifest", () => {
    const foodId = "10000000-0000-4000-8000-000000000001";
    expect(() => buildActivationManifest({ ...MANIFEST_BASE, members: [member(foodId), member(foodId, { id: "other-member" })] }))
      .toThrow(/duplicate.*food/i);
  });

  it("creates an activation set from the normalized immutable manifest", async () => {
    const store = commandStore();
    const b = member("20000000-0000-4000-8000-000000000001");
    const a = member("10000000-0000-4000-8000-000000000001");

    await createActivationSet(store, {
      operationId: "51000000-0000-4000-8000-000000000001",
      commandChecksumSha256: "c".repeat(64),
      activationSetId: "53000000-0000-4000-8000-000000000001",
      eventId: "52000000-0000-4000-8000-000000000001",
      actor: ACTOR,
      ...MANIFEST_BASE,
      members: [b, a],
    });

    expect(store.createActivationSet).toHaveBeenCalledTimes(1);
    const command = vi.mocked(store.createActivationSet).mock.calls[0][0];
    const payload = command.payload as Record<string, unknown>;
    expect(command.operationId).toBe("51000000-0000-4000-8000-000000000001");
    expect(payload.activation_set_id).toBe("53000000-0000-4000-8000-000000000001");
    expect(payload.manifest_checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((payload.members as Array<{ food_id: string }>).map((item) => item.food_id)).toEqual([a.foodId, b.foodId]);
  });

  it("refuses to grant an activation set containing any rejected reviewed member", async () => {
    const store = commandStore();
    await expect(grantActivationSet(store, {
      operationId: "51000000-0000-4000-8000-000000000002",
      commandChecksumSha256: "d".repeat(64),
      activationSetId: "53000000-0000-4000-8000-000000000001",
      eventId: "52000000-0000-4000-8000-000000000002",
      actor: ACTOR,
      members: [member("10000000-0000-4000-8000-000000000001"), member("20000000-0000-4000-8000-000000000001", { eligibility: "rejected", blockingConditionCount: 1 })],
    })).rejects.toThrow(/eligible/i);
    expect(store.grantActivationSet).not.toHaveBeenCalled();
  });

  it("invalidates only an explicitly named grant event in the exact activation set", async () => {
    const store = commandStore();
    const base = {
      operationId: "51000000-0000-4000-8000-000000000003",
      commandChecksumSha256: "e".repeat(64),
      activationSetId: "53000000-0000-4000-8000-000000000001",
      eventId: "52000000-0000-4000-8000-000000000003",
      actor: ACTOR,
    };

    await expect(invalidateActivationGrant(store, { ...base, targetGrantEventId: "" })).rejects.toThrow(/grant.*event/i);
    expect(store.invalidateActivationGrant).not.toHaveBeenCalled();

    await invalidateActivationGrant(store, {
      ...base,
      targetGrantEventId: "54000000-0000-4000-8000-000000000001",
    });
    expect(store.invalidateActivationGrant).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.invalidateActivationGrant).mock.calls[0][0].payload).toEqual(expect.objectContaining({
      activation_set_id: "53000000-0000-4000-8000-000000000001",
      target_grant_event_id: "54000000-0000-4000-8000-000000000001",
    }));
  });
});
