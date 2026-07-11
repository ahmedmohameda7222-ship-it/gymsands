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
type ClaimRow = {
  action: "execute" | "replay" | "conflict" | "in_progress" | "review_required";
  ledger_id: string | null;
  response: unknown;
};

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
  const claimed = await ctx.supabase.rpc("claim_mcp_idempotency_key", {
    p_user_id: ctx.userId,
    p_connection_id: ctx.connectionId,
    p_tool_name: toolName,
    p_key_hash: keyHash,
    p_input_hash: inputHash,
    p_lease_seconds: 120,
    p_ttl_seconds: 7 * 24 * 60 * 60
  });
  if (claimed.error) {
    return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  }

  const claim = (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as ClaimRow | null;
  if (!claim) return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  if (claim.action === "conflict") {
    return fail("idempotency_conflict", "This idempotency_key was already used with different input. Use a new key for a different action.");
  }
  if (claim.action === "in_progress") {
    return fail("idempotency_in_progress", "An identical request is still being processed. Retry with the same key after a short delay.");
  }
  if (claim.action === "review_required") {
    return fail("idempotency_review_required", "A prior action may have completed without durable replay evidence. Review the affected record before retrying.");
  }
  if (claim.action === "replay") {
    return restoreResponse(claim.response)
      ?? fail("idempotency_review_required", "Stored replay evidence is incomplete. Review the affected record before retrying.");
  }
  if (claim.action !== "execute" || !claim.ledger_id) {
    return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  }

  let result: McpToolResult;
  try {
    result = await execute();
  } catch {
    result = fail("tool_execution_failed", "Plaivra could not complete this tool. No change should be assumed; review the affected record before retrying.");
  }

  const stored: StoredResponse = {
    structuredContent: result.structuredContent,
    ...(result.isError ? { isError: true } : {})
  };
  const persisted = await ctx.supabase
    .from("mcp_idempotency_keys")
    .update({
      status: result.isError ? "failed" : "completed",
      response: stored,
      lease_expires_at: null
    })
    .eq("id", claim.ledger_id)
    .eq("user_id", ctx.userId)
    .eq("input_hash", inputHash);
  if (persisted.error) {
    return fail("idempotency_persist_failed", "The action may have completed, but Plaivra could not save replay evidence. Review the affected record before retrying.");
  }
  return result;
}
