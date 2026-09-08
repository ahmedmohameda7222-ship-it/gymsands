import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const logOperationalEvent = vi.fn();
vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent }));

import {
  classifyFoodGovernanceCommandError,
  executeFoodCatalogGovernanceRpc,
} from "@/services/food-catalog/server/governance-command-executor";

function client(result: { data: unknown; error: { code?: string | null } | null }) {
  const rpc = vi.fn(async () => result);
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Plan 6 Food governance operational logging", () => {
  it("classifies CAS conflicts, authorization denials, and other failures deterministically", () => {
    expect(classifyFoodGovernanceCommandError({ code: "40001" })).toBe("cas_conflict");
    expect(classifyFoodGovernanceCommandError({ code: "42501" })).toBe("authorization_denied");
    expect(classifyFoodGovernanceCommandError({ code: "23514" })).toBe("failed");
  });

  it.each([
    ["40001", "cas_conflict", "warn"],
    ["42501", "authorization_denied", "warn"],
    ["23514", "failed", "error"],
  ] as const)("logs coarse failure outcome %s without command inputs", async (code, governanceOutcome, level) => {
    logOperationalEvent.mockClear();
    const { supabase, rpc } = client({ data: null, error: { code } });
    const params = { p_reason: "private operator note", p_food_id: "11111111-1111-4111-8111-111111111111" };

    await expect(executeFoodCatalogGovernanceRpc(
      supabase,
      "food_catalog_withdraw_food",
      params,
    )).rejects.toMatchObject({ code, governanceOutcome });

    expect(rpc).toHaveBeenCalledWith("food_catalog_withdraw_food", params);
    expect(logOperationalEvent).toHaveBeenCalledTimes(1);
    const logged = logOperationalEvent.mock.calls[0]?.[0];
    expect(logged).toEqual(expect.objectContaining({
      event: "food_catalog_governance_command",
      level,
      operation: "food_catalog_withdraw_food",
      outcome: "rejected",
      error_type: governanceOutcome,
      error_code: code,
    }));
    expect(JSON.stringify(logged)).not.toContain("private operator note");
    expect(JSON.stringify(logged)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("logs successful completion without command inputs", async () => {
    logOperationalEvent.mockClear();
    const result = { ok: true };
    const { supabase } = client({ data: result, error: null });

    await expect(executeFoodCatalogGovernanceRpc(
      supabase,
      "food_catalog_governance_metrics",
      { p_hidden: "not logged" },
    )).resolves.toEqual(result);

    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "food_catalog_governance_command",
      level: "info",
      operation: "food_catalog_governance_metrics",
      outcome: "success",
    }));
    expect(JSON.stringify(logOperationalEvent.mock.calls[0]?.[0])).not.toContain("not logged");
  });
});
