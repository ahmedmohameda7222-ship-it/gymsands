import { createHash } from "node:crypto";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_IMPACT_VERSION,
  RECENT_REAUTHENTICATION_MS
} from "@/lib/privacy/deletion-contract";

export { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_DELETION_IMPACT_VERSION } from "@/lib/privacy/deletion-contract";

export type AccountDeletionRequestInput = {
  confirmation?: unknown;
  impact_version?: unknown;
  idempotency_key?: unknown;
};

export function isRecentReauthentication(lastSignInAt: string | null | undefined, now = Date.now()) {
  if (!lastSignInAt) return false;
  const signedInAt = Date.parse(lastSignInAt);
  return Number.isFinite(signedInAt) && signedInAt <= now && now - signedInAt <= RECENT_REAUTHENTICATION_MS;
}

export function validateAccountDeletionRequest(input: AccountDeletionRequestInput) {
  if (input.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    return { ok: false as const, code: "confirmation_required", message: `Type ${ACCOUNT_DELETION_CONFIRMATION} exactly.` };
  }
  if (input.impact_version !== ACCOUNT_DELETION_IMPACT_VERSION) {
    return { ok: false as const, code: "impact_acknowledgement_required", message: "Review the current deletion impact summary before continuing." };
  }
  if (typeof input.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{16,120}$/.test(input.idempotency_key)) {
    return { ok: false as const, code: "invalid_idempotency_key", message: "A valid deletion request key is required." };
  }
  return { ok: true as const, idempotencyKeyHash: sha256(input.idempotency_key) };
}

export function deletionSubjectHash(userId: string) {
  return sha256(`plaivra-account-deletion:${userId}`);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
