import { describe, expect, it, vi } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeIdempotentMcpMutation } from "@/lib/mcp/idempotency";
import { ok } from "@/lib/mcp/tool-helpers";

function ledgerClient({
  insert,
  existing,
  persistError = null
}: {
  insert: { data: Record<string, unknown> | null; error: { code?: string; message: string } | null };
  existing?: { data: Record<string, unknown> | null; error: { message: string } | null };
  persistError?: { message: string } | null;
}) {
  const updates: unknown[] = [];
  const client = {
    from: vi.fn(() => {
      let action = "select";
      const builder: Record<string, unknown> = {};
      builder.insert = vi.fn(() => { action = "insert"; return builder; });
      builder.update = vi.fn((value: unknown) => { action = "update"; updates.push(value); return builder; });
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => action === "insert" ? insert : (existing ?? { data: null, error: null }));
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(action === "update" ? { data: null, error: persistError } : { data: null, error: null }).then(resolve, reject);
      return builder;
    })
  };
  return { client: client as unknown as McpContext["supabase"], updates };
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

describe("MCP mutation idempotency", () => {
  it("executes a new mutation once and persists its minimized response", async () => {
    const { client, updates } = ledgerClient({ insert: { data: { id: "ledger-1" }, error: null } });
    const execute = vi.fn(async () => ok({ ok: true, created_id: "record-1" }));
    const result = await executeIdempotentMcpMutation({
      ctx: context(client), toolName: "add_water_log", input: { idempotency_key: "request-key-0001", amount_ml: 250 }, execute
    });
    expect(result.structuredContent).toMatchObject({ ok: true, created_id: "record-1" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(expect.objectContaining({ status: "completed" }));
  });

  it("replays a completed response without executing the mutation again", async () => {
    const input = { idempotency_key: "request-key-0001", amount_ml: 250 };
    // The input hash is intentionally learned from a first pass by using a
    // conflict response whose hash is replaced through a matched fixture.
    const crypto = await import("node:crypto");
    const canonical = '{"amount_ml":250,"idempotency_key":"request-key-0001"}';
    const inputHash = crypto.createHash("sha256").update(canonical).digest("hex");
    const { client } = ledgerClient({
      insert: { data: null, error: { code: "23505", message: "duplicate" } },
      existing: { data: { id: "ledger-1", status: "completed", input_hash: inputHash, response: { structuredContent: { ok: true, created_id: "record-1" } } }, error: null }
    });
    const execute = vi.fn(async () => ok({ ok: true, created_id: "record-2" }));
    const result = await executeIdempotentMcpMutation({ ctx: context(client), toolName: "add_water_log", input, execute });
    expect(result.structuredContent).toMatchObject({ created_id: "record-1" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects key reuse with changed input and concurrent pending work", async () => {
    const base = { insert: { data: null, error: { code: "23505", message: "duplicate" } } };
    const conflictClient = ledgerClient({
      ...base,
      existing: { data: { id: "ledger-1", status: "completed", input_hash: "different", response: {} }, error: null }
    }).client;
    const conflict = await executeIdempotentMcpMutation({
      ctx: context(conflictClient), toolName: "add_water_log", input: { idempotency_key: "request-key-0001", amount_ml: 250 }, execute: async () => ok({ ok: true })
    });
    expect(conflict.structuredContent).toMatchObject({ code: "idempotency_conflict" });

    const crypto = await import("node:crypto");
    const inputHash = crypto.createHash("sha256").update('{"amount_ml":250,"idempotency_key":"request-key-0001"}').digest("hex");
    const pendingClient = ledgerClient({
      ...base,
      existing: { data: { id: "ledger-1", status: "pending", input_hash: inputHash, response: null }, error: null }
    }).client;
    const pending = await executeIdempotentMcpMutation({
      ctx: context(pendingClient), toolName: "add_water_log", input: { idempotency_key: "request-key-0001", amount_ml: 250 }, execute: async () => ok({ ok: true })
    });
    expect(pending.structuredContent).toMatchObject({ code: "idempotency_in_progress" });
  });
});
