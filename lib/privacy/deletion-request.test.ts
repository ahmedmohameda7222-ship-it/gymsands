import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_IMPACT_VERSION,
  deletionSubjectHash,
  isRecentReauthentication,
  validateAccountDeletionRequest
} from "./deletion-request";

describe("account deletion request security", () => {
  it("requires the exact confirmation, current impact version, and idempotency key", () => {
    expect(validateAccountDeletionRequest({})).toMatchObject({ ok: false, code: "confirmation_required" });
    expect(validateAccountDeletionRequest({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      impact_version: "old",
      idempotency_key: "request_key_123456789"
    })).toMatchObject({ ok: false, code: "impact_acknowledgement_required" });
    expect(validateAccountDeletionRequest({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      impact_version: ACCOUNT_DELETION_IMPACT_VERSION,
      idempotency_key: "request_key_123456789"
    })).toMatchObject({ ok: true, idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("accepts only a server-proven recent sign-in", () => {
    const now = Date.parse("2026-07-11T00:00:00.000Z");
    expect(isRecentReauthentication("2026-07-10T23:55:00.000Z", now)).toBe(true);
    expect(isRecentReauthentication("2026-07-10T23:40:00.000Z", now)).toBe(false);
    expect(isRecentReauthentication("invalid", now)).toBe(false);
  });

  it("uses a stable one-way subject identifier for retained evidence", () => {
    const hash = deletionSubjectHash("11111111-1111-4111-8111-111111111111");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("11111111");
  });
});
