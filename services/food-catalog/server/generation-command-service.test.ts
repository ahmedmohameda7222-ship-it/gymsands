import { describe, expect, it, vi } from "vitest";

import type { ControlPlaneActorContext } from "@/lib/food-catalog/domain/generations";
import { sha256Canonical } from "./canonical-hash";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";
import {
  promoteCatalogGeneration,
  revokeCatalogGeneration,
  rollbackCatalogGeneration,
} from "./generation-command-service";

const OPERATION_ID = "a1000000-0000-4000-8000-000000000001";
const OTHER_OPERATION_ID = "a1000000-0000-4000-8000-000000000002";
const GENERATION_ID = "a2000000-0000-4000-8000-000000000001";
const CURRENT_GENERATION_ID = "a2000000-0000-4000-8000-000000000002";
const TARGET_GENERATION_ID = "a2000000-0000-4000-8000-000000000003";
const REPORT_ID = "a3000000-0000-4000-8000-000000000001";
const TARGET_REPORT_ID = "a3000000-0000-4000-8000-000000000002";
const TARGET_PROMOTION_EVENT_ID = "a4000000-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);
const REPORT_SHA = "c".repeat(64);
const TARGET_REPORT_SHA = "d".repeat(64);

const actor: ControlPlaneActorContext = {
  principalId: "operator-1",
  principalType: "service",
  authorityReference: "planner-approved-transition",
  reasonCode: "approved-plan3-transition",
  policyVersion: "control-v1",
};

function commandResult(operationId: string) {
  return {
    operationId,
    eventId: "a5000000-0000-4000-8000-000000000001",
    generationId: GENERATION_ID,
    validationReportId: REPORT_ID,
    pointerRevision: 4,
  };
}

function makeCommandStore(): FoodCatalogGenerationCommandStore & {
  promoteGeneration: ReturnType<typeof vi.fn>;
  rollbackGeneration: ReturnType<typeof vi.fn>;
  revokeGeneration: ReturnType<typeof vi.fn>;
} {
  return {
    createActivationSet: vi.fn(async () => commandResult(OPERATION_ID)),
    grantActivationSet: vi.fn(async () => commandResult(OPERATION_ID)),
    invalidateActivationGrant: vi.fn(async () => commandResult(OPERATION_ID)),
    createGeneration: vi.fn(async () => commandResult(OPERATION_ID)),
    recordValidation: vi.fn(async () => commandResult(OPERATION_ID)),
    promoteGeneration: vi.fn(async (command) => commandResult(command.operationId)),
    rollbackGeneration: vi.fn(async (command) => commandResult(command.operationId)),
    revokeGeneration: vi.fn(async (command) => commandResult(command.operationId)),
  };
}

function actorPayload(value: ControlPlaneActorContext) {
  return {
    principal_id: value.principalId,
    principal_type: value.principalType,
    authority_reference: value.authorityReference,
    reason_code: value.reasonCode,
    policy_version: value.policyVersion,
  };
}

describe("Food Catalog Plan 3 generation transition command service", () => {
  it("promotes with explicit null bootstrap current authority and hashes only semantic command identity", async () => {
    const store = makeCommandStore();
    const input = {
      operationId: OPERATION_ID,
      generationId: GENERATION_ID,
      expectedCurrentGenerationId: null,
      generationChecksumSha256: SHA,
      validationReportId: REPORT_ID,
      validationReportChecksumSha256: REPORT_SHA,
      actor,
    };

    await promoteCatalogGeneration(store, input);

    const semanticPayload = {
      generationId: GENERATION_ID,
      expectedCurrentGenerationId: null,
      generationChecksumSha256: SHA,
      validationReportId: REPORT_ID,
      validationReportChecksumSha256: REPORT_SHA,
      actor,
    };
    expect(store.promoteGeneration).toHaveBeenCalledTimes(1);
    expect(store.promoteGeneration).toHaveBeenCalledWith({
      operationId: OPERATION_ID,
      commandChecksumSha256: sha256Canonical(semanticPayload),
      payload: {
        candidate_generation_id: GENERATION_ID,
        expected_current_generation_id: null,
        candidate_checksum_sha256: SHA,
        validation_report_id: REPORT_ID,
        validation_report_checksum_sha256: REPORT_SHA,
        actor: actorPayload(actor),
      },
    });
    expect(store.rollbackGeneration).not.toHaveBeenCalled();
    expect(store.revokeGeneration).not.toHaveBeenCalled();
  });

  it("excludes operation ID from promotion checksum while semantic evidence changes it", async () => {
    const first = makeCommandStore();
    const second = makeCommandStore();
    const changed = makeCommandStore();
    const shared = {
      generationId: GENERATION_ID,
      expectedCurrentGenerationId: CURRENT_GENERATION_ID,
      generationChecksumSha256: SHA,
      validationReportId: REPORT_ID,
      validationReportChecksumSha256: REPORT_SHA,
      actor,
    };

    await promoteCatalogGeneration(first, { operationId: OPERATION_ID, ...shared });
    await promoteCatalogGeneration(second, { operationId: OTHER_OPERATION_ID, ...shared });
    await promoteCatalogGeneration(changed, {
      operationId: OPERATION_ID,
      ...shared,
      validationReportChecksumSha256: OTHER_SHA,
    });

    const firstChecksum = first.promoteGeneration.mock.calls[0]?.[0].commandChecksumSha256;
    const secondChecksum = second.promoteGeneration.mock.calls[0]?.[0].commandChecksumSha256;
    const changedChecksum = changed.promoteGeneration.mock.calls[0]?.[0].commandChecksumSha256;
    expect(firstChecksum).toBe(secondChecksum);
    expect(changedChecksum).not.toBe(firstChecksum);
  });

  it("rejects promotion without explicit expected-current authority or with malformed IDs/checksums/actor", async () => {
    const store = makeCommandStore();
    const valid = {
      operationId: OPERATION_ID,
      generationId: GENERATION_ID,
      expectedCurrentGenerationId: CURRENT_GENERATION_ID,
      generationChecksumSha256: SHA,
      validationReportId: REPORT_ID,
      validationReportChecksumSha256: REPORT_SHA,
      actor,
    };

    await expect(promoteCatalogGeneration(store, {
      ...valid,
      expectedCurrentGenerationId: undefined,
    } as never)).rejects.toThrow(/expected current/i);
    await expect(promoteCatalogGeneration(store, { ...valid, operationId: "not-a-uuid" })).rejects.toThrow(/operation/i);
    await expect(promoteCatalogGeneration(store, { ...valid, generationId: "not-a-uuid" })).rejects.toThrow(/generation/i);
    await expect(promoteCatalogGeneration(store, { ...valid, validationReportId: "not-a-uuid" })).rejects.toThrow(/report/i);
    await expect(promoteCatalogGeneration(store, { ...valid, generationChecksumSha256: "ABC" })).rejects.toThrow(/checksum/i);
    await expect(promoteCatalogGeneration(store, {
      ...valid,
      actor: { ...actor, authorityReference: "" },
    })).rejects.toThrow(/authority/i);
    expect(store.promoteGeneration).not.toHaveBeenCalled();
  });

  it("rolls back only to an explicit target with exact prior promotion and validation evidence", async () => {
    const store = makeCommandStore();
    const input = {
      operationId: OPERATION_ID,
      expectedCurrentGenerationId: CURRENT_GENERATION_ID,
      targetGenerationId: TARGET_GENERATION_ID,
      targetGenerationChecksumSha256: OTHER_SHA,
      targetPromotionEventId: TARGET_PROMOTION_EVENT_ID,
      targetValidationReportId: TARGET_REPORT_ID,
      targetValidationReportChecksumSha256: TARGET_REPORT_SHA,
      actor,
    };

    await rollbackCatalogGeneration(store, input);

    const semanticPayload = {
      expectedCurrentGenerationId: CURRENT_GENERATION_ID,
      targetGenerationId: TARGET_GENERATION_ID,
      targetGenerationChecksumSha256: OTHER_SHA,
      targetPromotionEventId: TARGET_PROMOTION_EVENT_ID,
      targetValidationReportId: TARGET_REPORT_ID,
      targetValidationReportChecksumSha256: TARGET_REPORT_SHA,
      actor,
    };
    expect(store.rollbackGeneration).toHaveBeenCalledTimes(1);
    expect(store.rollbackGeneration).toHaveBeenCalledWith({
      operationId: OPERATION_ID,
      commandChecksumSha256: sha256Canonical(semanticPayload),
      payload: {
        expected_current_generation_id: CURRENT_GENERATION_ID,
        target_generation_id: TARGET_GENERATION_ID,
        target_checksum_sha256: OTHER_SHA,
        target_promotion_event_id: TARGET_PROMOTION_EVENT_ID,
        target_validation_report_id: TARGET_REPORT_ID,
        target_validation_report_checksum_sha256: TARGET_REPORT_SHA,
        actor: actorPayload(actor),
      },
    });
    const persistedPayload = store.rollbackGeneration.mock.calls[0]?.[0].payload as Record<string, unknown>;
    expect(persistedPayload).not.toHaveProperty("previous");
    expect(persistedPayload).not.toHaveProperty("generation_ordinal");
    expect(persistedPayload).not.toHaveProperty("created_at");
    expect(persistedPayload).not.toHaveProperty("sealed_at");
  });

  it("rejects rollback without explicit non-null current, target, prior promotion event, or report evidence", async () => {
    const store = makeCommandStore();
    const valid = {
      operationId: OPERATION_ID,
      expectedCurrentGenerationId: CURRENT_GENERATION_ID,
      targetGenerationId: TARGET_GENERATION_ID,
      targetGenerationChecksumSha256: OTHER_SHA,
      targetPromotionEventId: TARGET_PROMOTION_EVENT_ID,
      targetValidationReportId: TARGET_REPORT_ID,
      targetValidationReportChecksumSha256: TARGET_REPORT_SHA,
      actor,
    };

    await expect(rollbackCatalogGeneration(store, { ...valid, expectedCurrentGenerationId: null } as never)).rejects.toThrow(/expected current/i);
    await expect(rollbackCatalogGeneration(store, { ...valid, targetGenerationId: "" })).rejects.toThrow(/target generation/i);
    await expect(rollbackCatalogGeneration(store, { ...valid, targetPromotionEventId: "" })).rejects.toThrow(/promotion event/i);
    await expect(rollbackCatalogGeneration(store, { ...valid, targetValidationReportId: "" })).rejects.toThrow(/validation report/i);
    await expect(rollbackCatalogGeneration(store, { ...valid, targetValidationReportChecksumSha256: "bad" })).rejects.toThrow(/checksum/i);
    expect(store.rollbackGeneration).not.toHaveBeenCalled();
  });

  it("revokes an exact generation/checksum with deterministic semantic checksum and no pointer mutation input", async () => {
    const store = makeCommandStore();
    const input = {
      operationId: OPERATION_ID,
      generationId: GENERATION_ID,
      generationChecksumSha256: SHA,
      actor,
    };

    await revokeCatalogGeneration(store, input);

    const semanticPayload = {
      generationId: GENERATION_ID,
      generationChecksumSha256: SHA,
      actor,
    };
    expect(store.revokeGeneration).toHaveBeenCalledTimes(1);
    expect(store.revokeGeneration).toHaveBeenCalledWith({
      operationId: OPERATION_ID,
      commandChecksumSha256: sha256Canonical(semanticPayload),
      payload: {
        generation_id: GENERATION_ID,
        generation_checksum_sha256: SHA,
        actor: actorPayload(actor),
      },
    });
    expect(store.promoteGeneration).not.toHaveBeenCalled();
    expect(store.rollbackGeneration).not.toHaveBeenCalled();
  });

  it("rejects malformed revoke semantic identity before calling the command store", async () => {
    const store = makeCommandStore();
    const valid = {
      operationId: OPERATION_ID,
      generationId: GENERATION_ID,
      generationChecksumSha256: SHA,
      actor,
    };

    await expect(revokeCatalogGeneration(store, { ...valid, operationId: "" })).rejects.toThrow(/operation/i);
    await expect(revokeCatalogGeneration(store, { ...valid, generationId: "bad" })).rejects.toThrow(/generation/i);
    await expect(revokeCatalogGeneration(store, { ...valid, generationChecksumSha256: "BAD" })).rejects.toThrow(/checksum/i);
    await expect(revokeCatalogGeneration(store, {
      ...valid,
      actor: { ...actor, principalId: "" },
    })).rejects.toThrow(/principal/i);
    expect(store.revokeGeneration).not.toHaveBeenCalled();
  });
});
