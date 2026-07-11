import { describe, expect, it, vi } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeIdempotentMcpMutation } from "@/lib/mcp/idempotency";
import { ok } from "@/lib/mcp/tool-helpers";

type Claim = {
  action: "execute" | "replay" | "conflict" | "in_progress" | "review_required";
  ledger_id: string | null;
  response: unknown;
};

function ledgerClient(claim: Claim, persistError: { message: string } | null = null) {
  const updates: unknown[] = [];
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn((value: unknown) => { updates.push(value); return builder; });
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: null, error: persistError }).then(resolve, reject);

  const client = {
    rpc: vi.fn(async (name: string) => {
      expect(name).toBe("claim_mcp_idempotency_key");
      return { data: claim, error: null };
    }),
    from: vi.fn(() => builder)
  };
  return { client: client as unknown as McpContext["supabase"], updates, rpc: client.rpc };
}

function context(supabase: McpContext["supabase"]): McpContext {
  return {
    supabase,
    userId: "11111111-1111-4111-8111-111111111111",
    connectionId: "22222222-2222-4222-8222-222222222222",
    scopes: [],
    profile: { id: "11111111-1111-4111-8111-111111111111", email: null, full_name: null, role: "member" }
  };
}

const input = { idempotency_key: "request-key-0001", amount_ml: 250 };

describe("MCP mutation idempotency", () => {
  it("executes a newly claimed mutation once and persists replay evidence", async () => {
    const { client, updates, rpc } = ledgerClient({ action: "execute", ledger_id: "ledger-1", response: null });
    const execute = vi.fn(async () => ok({ ok: true, created_id: "record-1" }));
    const result = await executeIdempotentMcpMutation({
      ctx: context(client), toolName: "add_water_log", input, execute
    });
    expect(result.structuredContent).toMatchObject({ ok: true, created_id: "record-1" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_mcp_idempotency_key", expect.objectContaining({
      p_tool_name: "add_water_log",
      p_lease_seconds: 120
    }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "completed", lease_expires_at: null }));
  });

  it("replays a completed response without executing the mutation again", async () => {
    const { client } = ledgerClient({
      action: "replay",
      ledger_id: "ledger-1",
      response: { structuredContent: { ok: true, created_id: "record-1" } }
    });
    const execute = vi.fn(async () => ok({ ok: true, created_id: "record-2" }));
    const result = await executeIdempotentMcpMutation({ ctx: context(client), toolName: "add_water_log", input, execute });
    expect(result.structuredContent).toMatchObject({ created_id: "record-1" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects changed input and an actively leased request", async () => {
    const conflict = await executeIdempotentMcpMutation({
      ctx: context(ledgerClient({ action: "conflict", ledger_id: "ledger-1", response: null }).client),
      toolName: "add_water_log", input, execute: async () => ok({ ok: true })
    });
    expect(conflict.structuredContent).toMatchObject({ code: "idempotency_conflict" });

    const pending = await executeIdempotentMcpMutation({
      ctx: context(ledgerClient({ action: "in_progress", ledger_id: "ledger-1", response: null }).client),
      toolName: "add_water_log", input, execute: async () => ok({ ok: true })
    });
    expect(pending.structuredContent).toMatchObject({ code: "idempotency_in_progress" });
  });

  it("requires manual review when prior completion cannot be proven", async () => {
    const result = await executeIdempotentMcpMutation({
      ctx: context(ledgerClient({ action: "review_required", ledger_id: "ledger-1", response: null }).client),
      toolName: "add_water_log", input, execute: async () => ok({ ok: true })
    });
    expect(result.structuredContent).toMatchObject({ code: "idempotency_review_required" });
  });
});
