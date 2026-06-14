import { NextResponse } from "next/server";
import { authenticateMcpRequest, type McpContext } from "@/lib/mcp/auth";
import { executeMcpTool, type McpToolResult } from "@/lib/mcp/tool-executor-safe";
import { mcpTools, type McpToolDefinition } from "@/lib/mcp/tools";
import { serverEnv } from "@/lib/integrations/env";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: unknown };
};

function corsHeaders(request?: Request) {
  const allowed = serverEnv.fitlifeMcpAllowedOrigins.split(",").map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = request?.headers.get("origin") ?? "";
  const origin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || serverEnv.appUrl || "null";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function toolListPayload() {
  return {
    tools: mcpTools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: `${tool.description} Risk level: ${tool.risk}.`,
      inputSchema: tool.inputSchema
    }))
  };
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown, request: Request) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: corsHeaders(request) });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, request: Request) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: code === -32601 ? 404 : 400, headers: corsHeaders(request) });
}

function hasAnyScope(ctx: McpContext, scopes: string[]) {
  const current = new Set(ctx.scopes ?? []);
  return current.has("fitlife.all") || scopes.some((scope) => current.has(scope));
}

function readScopeAllowed(ctx: McpContext) {
  return ctx.scopes.some((scope) => scope === "fitlife.all" || scope.endsWith(".read") || scope.endsWith(".write"));
}

function requiredScopesForTool(tool: McpToolDefinition) {
  if (tool.risk === "admin") return ["fitlife.admin"];
  if (tool.risk === "read") return ["fitlife.profile.read", "fitlife.summary.read"];

  const name = tool.name;
  if (/food|meal|calorie|water|kitchen|nutrition/i.test(name)) return ["fitlife.nutrition.write"];
  if (/workout|exercise|plan|personal_record|training/i.test(name)) return ["fitlife.training.write"];
  if (/weight|body_measurement|progress/i.test(name)) return ["fitlife.progress.write"];
  if (/profile|goal/i.test(name)) return ["fitlife.profile.write", "fitlife.progress.write"];
  if (/habit|daily_fit|sleep|recovery|supplement/i.test(name)) return ["fitlife.wellness.write", "fitlife.progress.write"];
  return ["fitlife.summary.write"];
}

function canUseTool(ctx: McpContext, tool: McpToolDefinition) {
  if (tool.risk === "admin") {
    return ctx.profile.role === "admin" && hasAnyScope(ctx, requiredScopesForTool(tool));
  }

  if (tool.risk === "read") return readScopeAllowed(ctx);
  return hasAnyScope(ctx, requiredScopesForTool(tool));
}

async function auditToolCall(ctx: McpContext, toolName: string, input: unknown, result: McpToolResult) {
  await ctx.supabase.from("mcp_audit_logs").insert({
    user_id: ctx.userId,
    connection_id: ctx.connectionId,
    tool_name: toolName,
    input,
    output_summary: {
      is_error: Boolean(result.isError),
      keys: Object.keys(result.structuredContent ?? {}).slice(0, 20),
      requires_confirmation: Boolean(result.structuredContent?.requires_confirmation)
    },
    status: result.isError ? "error" : "success",
    error_message: result.isError ? String(result.structuredContent.message ?? "Tool failed") : null
  });
}

async function auditDeniedToolCall(ctx: McpContext, tool: McpToolDefinition, input: unknown, message: string) {
  await ctx.supabase.from("mcp_audit_logs").insert({
    user_id: ctx.userId,
    connection_id: ctx.connectionId,
    tool_name: tool.name,
    input,
    output_summary: {
      is_error: true,
      denied: true,
      required_scopes: requiredScopesForTool(tool),
      current_scopes: ctx.scopes
    },
    status: "error",
    error_message: message
  });
}

export function handleMcpOptions(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function handleMcpGet(request: Request) {
  const auth = await authenticateMcpRequest(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ name: "FitLife Hub MCP", version: "1.0.0", transport: "http-json-rpc", ...toolListPayload() }, { headers: corsHeaders(request) });
}

export async function handleMcpPost(request: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Invalid JSON-RPC request body.", request);
  }

  if (body.method === "initialize") {
    return rpcResult(body.id, { protocolVersion: "2024-11-05", serverInfo: { name: "FitLife Hub", version: "1.0.0" }, capabilities: { tools: {} } }, request);
  }

  const auth = await authenticateMcpRequest(request);
  if (auth instanceof NextResponse) return auth;

  if (body.method === "tools/list") return rpcResult(body.id, toolListPayload(), request);

  if (body.method === "tools/call") {
    const toolName = body.params?.name;
    if (!toolName) return rpcError(body.id, -32602, "tools/call requires params.name.", request);

    const tool = mcpTools.find((item) => item.name === toolName);
    if (!tool) return rpcError(body.id, -32601, `Unknown MCP tool: ${toolName}.`, request);

    if (!canUseTool(auth, tool)) {
      const required = requiredScopesForTool(tool).join(", ");
      const message = `This FitLife connection is missing the required scope for ${tool.name}: ${required}. Reconnect FitLife from Settings to refresh permissions.`;
      await auditDeniedToolCall(auth, tool, body.params?.arguments ?? {}, message);
      return rpcError(body.id, -32003, message, request);
    }

    const result = await executeMcpTool(auth, toolName, body.params?.arguments ?? {});
    await auditToolCall(auth, toolName, body.params?.arguments ?? {}, result);
    return rpcResult(body.id, result, request);
  }

  return rpcError(body.id, -32601, `Unsupported MCP method: ${body.method ?? "missing"}`, request);
}
