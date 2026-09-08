import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logOperationalEvent } from "@/lib/observability/structured-log";

export const FOOD_CATALOG_GOVERNANCE_RPCS = [
  "food_catalog_manage_governance_principal",
  "food_catalog_revoke_governance_capability",
  "food_catalog_attach_correction_evidence",
  "food_catalog_transition_correction_case",
  "food_catalog_apply_nutrition_correction",
  "food_catalog_apply_serving_correction",
  "food_catalog_apply_name_correction",
  "food_catalog_apply_barcode_correction",
  "food_catalog_apply_taxonomy_correction",
  "food_catalog_apply_market_correction",
  "food_catalog_resolve_duplicate",
  "food_catalog_withdraw_food",
  "food_catalog_restore_food",
  "food_catalog_service_propose_correction",
  "food_catalog_governance_metrics",
] as const;

export type FoodCatalogGovernanceRpc = (typeof FOOD_CATALOG_GOVERNANCE_RPCS)[number];
export type FoodGovernanceOperationalOutcome =
  | "success"
  | "failed"
  | "cas_conflict"
  | "authorization_denied";

type RpcError = {
  code?: string | null;
};

export function classifyFoodGovernanceCommandError(
  error: RpcError,
): Exclude<FoodGovernanceOperationalOutcome, "success"> {
  if (error.code === "40001") return "cas_conflict";
  if (error.code === "42501") return "authorization_denied";
  return "failed";
}

export async function executeFoodCatalogGovernanceRpc<T>(
  supabase: SupabaseClient,
  command: FoodCatalogGovernanceRpc,
  params: Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  const result = await supabase.rpc(command, params);

  if (result.error) {
    const governanceOutcome = classifyFoodGovernanceCommandError(result.error);
    logOperationalEvent({
      event: "food_catalog_governance_command",
      level: governanceOutcome === "failed" ? "error" : "warn",
      operation: command,
      outcome: "rejected",
      error_type: governanceOutcome,
      error_code: result.error.code ?? "unknown",
      duration_ms: Math.max(0, Date.now() - startedAt),
    });
    const failure = new Error(`Food Catalog governance command failed: ${governanceOutcome}.`);
    Object.assign(failure, {
      code: result.error.code ?? null,
      governanceOutcome,
    });
    throw failure;
  }

  logOperationalEvent({
    event: "food_catalog_governance_command",
    level: "info",
    operation: command,
    outcome: "success",
    duration_ms: Math.max(0, Date.now() - startedAt),
  });
  return result.data as T;
}
