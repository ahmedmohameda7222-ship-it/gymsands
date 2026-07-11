import crypto from "node:crypto";
import type { McpContext } from "@/lib/mcp/auth";
import { fail, type McpToolResult } from "@/lib/mcp/tool-helpers";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type StoredResponse = Pick<McpToolResult, "structuredContent" | "isError">;

function restoreResponse(response: unknown): McpToolResult | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const stored = response as Partial<StoredResponse>;
  if (!stored.structuredContent || typeof stored.structuredContent !== "object" || Array.isArray(stored.structuredContent)) return null;
  return {
    structuredContent: stored.structuredContent,
    content: [{ type: "text", text: JSON.stringify(stored.structuredContent) }],
    ...(stored.isError ? { isError: true } : {})
  };
}

export async function executeIdempotentMcpMutation({
  ctx,
  toolName,
  input,
  execute
}: {
  ctx: McpContext;
  toolName: string;
  input: Record<string, unknown>;
  execute: () => Promise<McpToolResult>;
}): Promise<McpToolResult> {
  const key = typeof input.idempotency_key === "string" ? input.idempotency_key.trim() : "";
  if (key.length < 16 || key.length > 200) {
    return fail("invalid_idempotency_key", "Provide a stable 16-200 character idempotency_key for this mutation.");
  }
  const keyHash = digest(`${ctx.userId}:${toolName}:${key}`);
  const inputHash = digest(canonicalJson(input));
  const created = await ctx.supabase
    .from("mcp_idempotency_keys")
    .insert({
      user_id: ctx.userId,
      connection_id: ctx.connectionId,
      tool_name: toolName,
      key_hash: keyHash,
      input_hash: inputHash,
      status: "pending"
    })
    .select("id,status,input_hash,response,expires_at")
    .maybeSingle();

  let ledger = created.data as Record<string, unknown> | null;
  if (created.error) {
    const duplicate = created.error.code === "23505" || /duplicate|unique/i.test(created.error.message ?? "");
    if (!duplicate) return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
    const existing = await ctx.supabase
      .from("mcp_idempotency_keys")
      .select("id,status,input_hash,response,expires_at")
      .eq("user_id", ctx.userId)
      .eq("tool_name", toolName)
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (existing.error || !existing.data) return fail("idempotency_unavailable", "Plaivra could not verify this retry. Review the affected record before trying again.");
    ledger = existing.data as Record<string, unknown>;
    if (ledger.input_hash !== inputHash) {
      return fail("idempotency_conflict", "This idempotency_key was already used with different input. Use a new key for a different action.");
    }
    const replay = restoreResponse(ledger.response);
    if ((ledger.status === "completed" || ledger.status === "failed") && replay) return replay;
    return fail("idempotency_in_progress", "An identical request is still being processed. Retry with the same key after a short delay.");
  }
  if (!ledger?.id) return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");

  let result: McpToolResult;
  try {
    result = await execute();
  } catch (error) {
    await ctx.supabase.from("mcp_idempotency_keys").update({ status: "failed" }).eq("id", ledger.id);
    throw error;
  }

  const stored: StoredResponse = {
    structuredContent: result.structuredContent,
    ...(result.isError ? { isError: true } : {})
  };
  const persisted = await ctx.supabase
    .from("mcp_idempotency_keys")
    .update({ status: result.isError ? "failed" : "completed", response: stored })
    .eq("id", ledger.id);
  if (persisted.error) {
    return fail("idempotency_persist_failed", "The action may have completed, but Plaivra could not save replay evidence. Review the affected record before retrying.");
  }
  return result;
}
