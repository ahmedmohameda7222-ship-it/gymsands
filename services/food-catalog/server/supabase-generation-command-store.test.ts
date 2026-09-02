import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogGenerationCommandStore } from "./supabase-generation-command-store";

const OPERATION_ID = "51000000-0000-4000-8000-000000000001";
const CHECKSUM = "a".repeat(64);

function makeSupabase() {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
    data: {
      operation_id: (args.p_command as Record<string, unknown>).operation_id,
      event_id: "52000000-0000-4000-8000-000000000001",
      generation_id: null,
      validation_report_id: null,
      pointer_revision: null,
    },
    error: null,
  }));
  const from = vi.fn(() => {
    throw new Error("Task 4 command adapter must never use direct table CRUD.");
  });
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

const cases = [
  ["createActivationSet", "food_catalog_create_activation_set_v1"],
  ["grantActivationSet", "food_catalog_grant_activation_set_v1"],
  ["invalidateActivationGrant", "food_catalog_invalidate_activation_grant_v1"],
  ["createGeneration", "food_catalog_create_generation_v1"],
  ["recordValidation", "food_catalog_record_generation_validation_v1"],
  ["promoteGeneration", "food_catalog_promote_generation_v1"],
  ["rollbackGeneration", "food_catalog_rollback_generation_v1"],
  ["revokeGeneration", "food_catalog_revoke_generation_v1"],
] as const;

describe("Food Catalog Plan 3 Supabase generation command store", () => {
  it.each(cases)("%s calls only exact RPC %s", async (method, rpcName) => {
    const { supabase, rpc, from } = makeSupabase();
    const store = createSupabaseFoodCatalogGenerationCommandStore(supabase);
    const command = {
      operationId: OPERATION_ID,
      commandChecksumSha256: CHECKSUM,
      payload: { fixture: method },
    };

    await expect(store[method](command)).resolves.toEqual(expect.objectContaining({ operationId: OPERATION_ID }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_command: {
        fixture: method,
        operation_id: OPERATION_ID,
        command_checksum_sha256: CHECKSUM,
      },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a malformed RPC response instead of returning a coerced command result", async () => {
    const rpc = vi.fn(async () => ({ data: { operation_id: "", event_id: null }, error: null }));
    const supabase = { rpc, from: vi.fn() } as unknown as SupabaseClient;
    const store = createSupabaseFoodCatalogGenerationCommandStore(supabase);

    await expect(store.promoteGeneration({
      operationId: OPERATION_ID,
      commandChecksumSha256: CHECKSUM,
      payload: {},
    })).rejects.toThrow(/operation_id/i);
  });

  it("surfaces stable Food Catalog generation errors from RPC database failures", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "STALE_CURRENT_GENERATION: pointer changed", code: "P0001" } }));
    const supabase = { rpc, from: vi.fn() } as unknown as SupabaseClient;
    const store = createSupabaseFoodCatalogGenerationCommandStore(supabase);

    await expect(store.promoteGeneration({
      operationId: OPERATION_ID,
      commandChecksumSha256: CHECKSUM,
      payload: {},
    })).rejects.toMatchObject({ code: "STALE_CURRENT_GENERATION" });
  });
});