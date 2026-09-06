import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stableJson } from "@/lib/food-catalog/ingestion/manifest";
import type {
  FoodCatalogIngestionCommandResult,
  FoodCatalogIngestionCommandStore,
} from "./ingestion-store";

export type FoodCatalogIngestionCommandErrorCode =
  | "OPERATION_ID_CONFLICT"
  | "CONTROL_PLANE_REJECTED";

export class FoodCatalogIngestionCommandError extends Error {
  readonly code: FoodCatalogIngestionCommandErrorCode;

  constructor(code: FoodCatalogIngestionCommandErrorCode, message: string) {
    super(message);
    this.name = "FoodCatalogIngestionCommandError";
    this.code = code;
  }
}

const RPC = {
  prepareExecution: "food_catalog_ingestion_prepare_execution_v2",
  acquireLease: "food_catalog_ingestion_acquire_lease_v2",
  heartbeatLease: "food_catalog_ingestion_heartbeat_lease_v2",
  persistCandidate: "food_catalog_ingestion_persist_candidate_v2",
  recordQuarantine: "food_catalog_ingestion_record_quarantine_v2",
  resolveQuarantine: "food_catalog_ingestion_resolve_quarantine_v2",
  recordReconciliation: "food_catalog_ingestion_record_reconciliation_v2",
  recordReleaseDiff: "food_catalog_ingestion_record_release_diff_v2",
  completeRun: "food_catalog_ingestion_complete_run_v2",
  failRun: "food_catalog_ingestion_fail_run_v2",
} as const;

function requiredOperationId(value: string): string {
  if (!value.trim()) {
    throw new FoodCatalogIngestionCommandError(
      "CONTROL_PLANE_REJECTED",
      "Plan 4 ingestion operationId must be a nonblank string.",
    );
  }
  return value;
}

function semanticPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const {
    operationId: _ignoredOperationId,
    commandChecksumSha256: _ignoredChecksum,
    ...rest
  } = payload;
  return rest;
}

function checksumPayload(
  rpcName: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (rpcName === RPC.acquireLease || rpcName === RPC.heartbeatLease) return payload;
  const {
    leaseToken: _leaseAuthorizationToken,
    leaseEpoch: _leaseAuthorizationEpoch,
    ...semantic
  } = payload;
  return semantic;
}

function commandChecksum(
  rpcName: string,
  operationId: string,
  payload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(stableJson({
      schemaVersion: "food-catalog-ingestion-command-v2",
      rpcName,
      operationId,
      payload: checksumPayload(rpcName, payload),
    }))
    .digest("hex");
}

function mapDatabaseError(error: { message?: string } | null): never {
  const message = error?.message?.trim() || "Food Catalog ingestion control-plane RPC failed.";
  const code: FoodCatalogIngestionCommandErrorCode =
    /operation(?: id)?(?: replay)? conflict/i.test(message) || /OPERATION_ID_CONFLICT/.test(message)
      ? "OPERATION_ID_CONFLICT"
      : "CONTROL_PLANE_REJECTED";
  throw new FoodCatalogIngestionCommandError(code, message);
}

function mapResult(value: unknown): FoodCatalogIngestionCommandResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FoodCatalogIngestionCommandError(
      "CONTROL_PLANE_REJECTED",
      "Plan 4 ingestion RPC response must be an object.",
    );
  }
  return value as FoodCatalogIngestionCommandResult;
}

async function invoke(
  supabase: SupabaseClient,
  rpcName: string,
  operationIdInput: string,
  callerPayload: Record<string, unknown>,
): Promise<FoodCatalogIngestionCommandResult> {
  const operationId = requiredOperationId(operationIdInput);
  const payload = semanticPayload(callerPayload);
  const commandChecksumSha256 = commandChecksum(rpcName, operationId, payload);
  const result = await supabase.rpc(rpcName, {
    p_command: {
      ...payload,
      operationId,
      commandChecksumSha256,
    },
  });
  if (result.error) mapDatabaseError(result.error);
  return mapResult(result.data);
}

export function createSupabaseFoodCatalogIngestionCommandStore(
  supabase: SupabaseClient,
): FoodCatalogIngestionCommandStore {
  return {
    prepareExecution: (operationId, payload) => invoke(supabase, RPC.prepareExecution, operationId, payload),
    acquireLease: (operationId, payload) => invoke(supabase, RPC.acquireLease, operationId, payload),
    heartbeatLease: (operationId, payload) => invoke(supabase, RPC.heartbeatLease, operationId, payload),
    persistCandidate: (operationId, payload) => invoke(supabase, RPC.persistCandidate, operationId, payload),
    recordQuarantine: (operationId, payload) => invoke(supabase, RPC.recordQuarantine, operationId, payload),
    resolveQuarantine: (operationId, payload) => invoke(supabase, RPC.resolveQuarantine, operationId, payload),
    recordReconciliation: (operationId, payload) => invoke(supabase, RPC.recordReconciliation, operationId, payload),
    recordReleaseDiff: (operationId, payload) => invoke(supabase, RPC.recordReleaseDiff, operationId, payload),
    completeRun: (operationId, payload) => invoke(supabase, RPC.completeRun, operationId, payload),
    failRun: (operationId, payload) => invoke(supabase, RPC.failRun, operationId, payload),
  };
}
