import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFoodCatalogIngestionCommandStore } from "./supabase-ingestion-command-store";

const OPERATION_ID = "55000000-0000-4000-8000-000000000001";

function makeSupabase() {
  const seen = new Map<string, string>();
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const command = args.p_command as Record<string, unknown>;
    const operationId = String(command.operationId);
    const checksum = String(command.commandChecksumSha256);
    const previous = seen.get(operationId);
    if (previous && previous !== checksum) {
      return { data: null, error: { message: "Food Catalog ingestion operation replay conflict." } };
    }
    seen.set(operationId, checksum);
    return {
      data: {
        batchId: "55000000-0000-4000-8000-000000000101",
        runId: "55000000-0000-4000-8000-000000000102",
        reviewState: "approved",
        executionMode: "production",
        leaseToken: "55000000-0000-4000-8000-000000000103",
        leaseEpoch: 2,
        leaseExpiresAt: "2026-09-04T13:00:00.000Z",
        foodId: null,
        sourceRecordId: "fixture-1",
        decisionKind: "create",
        dispositionKind: "accept",
        quarantineId: "55000000-0000-4000-8000-000000000104",
        resolutionId: "55000000-0000-4000-8000-000000000105",
        reconciliationId: "55000000-0000-4000-8000-000000000106",
        ok: true,
        mismatchCodes: [],
        releaseDiffId: "55000000-0000-4000-8000-000000000107",
        status: "completed",
      },
      error: null,
    };
  });
  const from = vi.fn(() => {
    throw new Error("Plan 4 ingestion command adapter must never use direct table CRUD.");
  });
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

const cases = [
  ["prepareExecution", "food_catalog_ingestion_prepare_execution_v2"],
  ["acquireLease", "food_catalog_ingestion_acquire_lease_v2"],
  ["heartbeatLease", "food_catalog_ingestion_heartbeat_lease_v2"],
  ["persistCandidate", "food_catalog_ingestion_persist_candidate_v2"],
  ["recordQuarantine", "food_catalog_ingestion_record_quarantine_v2"],
  ["resolveQuarantine", "food_catalog_ingestion_resolve_quarantine_v2"],
  ["recordReconciliation", "food_catalog_ingestion_record_reconciliation_v2"],
  ["recordReleaseDiff", "food_catalog_ingestion_record_release_diff_v2"],
  ["completeRun", "food_catalog_ingestion_complete_run_v2"],
  ["failRun", "food_catalog_ingestion_fail_run_v2"],
] as const;

const releaseDiffPayload = (fixture: number | boolean = true) => ({
  batchId: "batch-1",
  previousBatchId: null,
  records: [{ sourceRecordId: "fixture-1", classifications: ["unchanged"], fixture }],
  diffChecksumSha256: "a".repeat(64),
});

describe("Food Catalog Plan 4 Supabase ingestion command store", () => {
  it.each(cases)("%s invokes only exact RPC %s with a store-computed checksum", async (method, rpcName) => {
    const { supabase, rpc, from } = makeSupabase();
    const store = createSupabaseFoodCatalogIngestionCommandStore(supabase);
    const invoke = store[method] as unknown as (
      operationId: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>;

    await expect(invoke(OPERATION_ID, { fixture: method })).resolves.toBeDefined();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_command: {
        fixture: method,
        operationId: OPERATION_ID,
        commandChecksumSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the same checksum for an identical narrow-command replay", async () => {
    const { supabase, rpc } = makeSupabase();
    const store = createSupabaseFoodCatalogIngestionCommandStore(supabase);
    const payload = releaseDiffPayload();

    await store.recordReleaseDiff(OPERATION_ID, payload);
    await store.recordReleaseDiff(OPERATION_ID, payload);

    const first = (rpc.mock.calls[0]?.[1] as { p_command: Record<string, unknown> }).p_command;
    const second = (rpc.mock.calls[1]?.[1] as { p_command: Record<string, unknown> }).p_command;
    expect(second.commandChecksumSha256).toBe(first.commandChecksumSha256);
  });

  it("rejects changed semantic narrow-command reuse under the same operation ID", async () => {
    const { supabase } = makeSupabase();
    const store = createSupabaseFoodCatalogIngestionCommandStore(supabase);

    await store.recordReleaseDiff(OPERATION_ID, releaseDiffPayload(1));
    await expect(store.recordReleaseDiff(OPERATION_ID, releaseDiffPayload(2))).rejects.toMatchObject({
      code: "OPERATION_ID_CONFLICT",
    });
  });

  it("keeps candidate semantic replay stable across lease-token and epoch changes", async () => {
    const { supabase, rpc } = makeSupabase();
    const store = createSupabaseFoodCatalogIngestionCommandStore(supabase);
    const semantic = {
      runId: "55000000-0000-4000-8000-000000000102",
      decisionKind: "create",
      dispositionKind: "accept",
      decision: { kind: "create" },
      disposition: { kind: "accept", reasonCodes: [] },
      candidate: { sourceRecordId: "fixture-1", canonicalName: "Fixture" },
      foodId: "55000000-0000-4000-8000-000000000201",
    };

    await store.persistCandidate(OPERATION_ID, {
      ...semantic,
      leaseToken: "55000000-0000-4000-8000-000000000301",
      leaseEpoch: 1,
    });
    await expect(store.persistCandidate(OPERATION_ID, {
      ...semantic,
      leaseToken: "55000000-0000-4000-8000-000000000302",
      leaseEpoch: 2,
    })).resolves.toBeDefined();

    const first = (rpc.mock.calls[0]?.[1] as { p_command: Record<string, unknown> }).p_command;
    const second = (rpc.mock.calls[1]?.[1] as { p_command: Record<string, unknown> }).p_command;
    expect(second.commandChecksumSha256).toBe(first.commandChecksumSha256);
  });

  it("does not let caller payload override operation identity or computed checksum", async () => {
    const { supabase, rpc } = makeSupabase();
    const store = createSupabaseFoodCatalogIngestionCommandStore(supabase);
    const invoke = store.recordReleaseDiff as unknown as (
      operationId: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>;

    await invoke(OPERATION_ID, {
      operationId: "attacker-operation",
      commandChecksumSha256: "0".repeat(64),
      ...releaseDiffPayload(),
    });

    const command = (rpc.mock.calls[0]?.[1] as { p_command: Record<string, unknown> }).p_command;
    expect(command.operationId).toBe(OPERATION_ID);
    expect(command.commandChecksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(command.commandChecksumSha256).not.toBe("0".repeat(64));
  });
});
