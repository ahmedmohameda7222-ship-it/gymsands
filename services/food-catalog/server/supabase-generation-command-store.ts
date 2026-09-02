import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateActivationSetCommand,
  CreateGenerationCommand,
  GenerationCommandResult,
  GrantActivationSetCommand,
  InvalidateActivationGrantCommand,
  PromoteGenerationCommand,
  RecordGenerationValidationCommand,
  RevokeGenerationCommand,
  RollbackGenerationCommand,
} from "./generation-contracts";
import {
  FoodCatalogGenerationError,
  type FoodCatalogGenerationErrorCode,
} from "./generation-errors";
import type { FoodCatalogGenerationCommandStore } from "./generation-store";

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ERROR_CODES = new Set<FoodCatalogGenerationErrorCode>([
  "NO_CURRENT_GENERATION",
  "GENERATION_NOT_FOUND",
  "GENERATION_CHECKSUM_MISMATCH",
  "GENERATION_NOT_SEALED",
  "VALIDATION_REPORT_MISMATCH",
  "BLOCKING_FINDINGS",
  "STALE_CURRENT_GENERATION",
  "INVALID_ACTIVATION_GRANT",
  "CROSS_FOOD_SELECTION",
  "INVALID_VERIFICATION_SELECTION",
  "INVALID_REDIRECT",
  "OPERATION_ID_CONFLICT",
  "CONTROL_PLANE_REJECTED",
]);

type Command =
  | CreateActivationSetCommand
  | GrantActivationSetCommand
  | InvalidateActivationGrantCommand
  | CreateGenerationCommand
  | RecordGenerationValidationCommand
  | PromoteGenerationCommand
  | RollbackGenerationCommand
  | RevokeGenerationCommand;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new FoodCatalogGenerationError("CONTROL_PLANE_REJECTED", `${field} must be a nonblank string.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function nullableRevision(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new FoodCatalogGenerationError(
      "CONTROL_PLANE_REJECTED",
      "Plan 3 RPC response pointer_revision must be a non-negative integer or null.",
    );
  }
  return value;
}

function commandPayload(command: Command): Record<string, unknown> {
  const operationId = requiredString(command.operationId, "Plan 3 command operationId");
  const checksum = requiredString(command.commandChecksumSha256, "Plan 3 command commandChecksumSha256");
  if (!SHA256.test(checksum)) {
    throw new FoodCatalogGenerationError(
      "CONTROL_PLANE_REJECTED",
      "Plan 3 command commandChecksumSha256 must be lowercase SHA-256 hex.",
    );
  }
  const payload = asRecord(command.payload, "Plan 3 command payload");
  return {
    ...payload,
    operation_id: operationId,
    command_checksum_sha256: checksum,
  };
}

function mapDatabaseError(error: { message?: string } | null): never {
  const message = error?.message?.trim() || "Food Catalog Plan 3 control-plane RPC failed.";
  const prefix = message.match(/^([A-Z][A-Z0-9_]+)(?::|\b)/)?.[1] as FoodCatalogGenerationErrorCode | undefined;
  const code = prefix && STABLE_ERROR_CODES.has(prefix) ? prefix : "CONTROL_PLANE_REJECTED";
  throw new FoodCatalogGenerationError(code, message);
}

function mapResult(value: unknown, expectedOperationId: string): GenerationCommandResult {
  const row = asRecord(value, "Plan 3 RPC response");
  const operationId = requiredString(row.operation_id, "Plan 3 RPC response operation_id");
  if (operationId !== expectedOperationId) {
    throw new FoodCatalogGenerationError(
      "CONTROL_PLANE_REJECTED",
      "Plan 3 RPC response operation_id does not match the requested operation.",
    );
  }
  return {
    operationId,
    eventId: nullableString(row.event_id, "Plan 3 RPC response event_id"),
    generationId: nullableString(row.generation_id, "Plan 3 RPC response generation_id"),
    validationReportId: nullableString(row.validation_report_id, "Plan 3 RPC response validation_report_id"),
    pointerRevision: nullableRevision(row.pointer_revision),
  };
}

async function invoke(
  supabase: SupabaseClient,
  rpcName: string,
  command: Command,
): Promise<GenerationCommandResult> {
  const payload = commandPayload(command);
  const operationId = requiredString(payload.operation_id, "Plan 3 command operation_id");
  const result = await supabase.rpc(rpcName, { p_command: payload });
  if (result.error) mapDatabaseError(result.error);
  return mapResult(result.data, operationId);
}

export function createSupabaseFoodCatalogGenerationCommandStore(
  supabase: SupabaseClient,
): FoodCatalogGenerationCommandStore {
  return {
    createActivationSet: (command) => invoke(supabase, "food_catalog_create_activation_set_v1", command),
    grantActivationSet: (command) => invoke(supabase, "food_catalog_grant_activation_set_v1", command),
    invalidateActivationGrant: (command) => invoke(supabase, "food_catalog_invalidate_activation_grant_v1", command),
    createGeneration: (command) => invoke(supabase, "food_catalog_create_generation_v1", command),
    recordValidation: (command) => invoke(supabase, "food_catalog_record_generation_validation_v1", command),
    promoteGeneration: (command) => invoke(supabase, "food_catalog_promote_generation_v1", command),
    rollbackGeneration: (command) => invoke(supabase, "food_catalog_rollback_generation_v1", command),
    revokeGeneration: (command) => invoke(supabase, "food_catalog_revoke_generation_v1", command),
  };
}
