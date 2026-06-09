import { NextResponse } from "next/server";
import { authenticateMcpRequest, type McpContext } from "@/lib/mcp/auth";
import { executeMcpTool, type McpToolResult } from "@/lib/mcp/tool-executor-safe";
import { mcpTools } from "@/lib/mcp/tools";
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
  const origin = allowed.includes(requestOrigin) ? requestOrigin : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
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
    const result = await executeMcpTool(auth, toolName, body.params?.arguments ?? {});
    await auditToolCall(auth, toolName, body.params?.arguments ?? {}, result);
    return rpcResult(body.id, result, request);
  }

  return rpcError(body.id, -32601, `Unsupported MCP method: ${body.method ?? "missing"}`, request);
}
