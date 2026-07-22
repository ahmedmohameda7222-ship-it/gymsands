import type { McpContext } from "@/lib/mcp/auth";
import type { McpToolResult } from "@/lib/mcp/tool-helpers";
import { executeMcpTool as executeMcpToolImplementation } from "./tool-executor-implementation";

export * from "./tool-executor-implementation";

const AW3A_MCP_METRIC_SOURCE = "chatgpt" as const;
const AW3A_MCP_METRIC_SOURCE_PROVIDER = "openai" as const;

type RpcArguments = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withChatGptMetricSource(args: RpcArguments | undefined): RpcArguments | undefined {
  if (!args || !Array.isArray(args.p_logs)) return args;
  return {
    ...args,
    p_logs: args.p_logs.map((log) =>
      isObject(log)
        ? {
            ...log,
            metric_source: AW3A_MCP_METRIC_SOURCE,
            metric_source_provider: AW3A_MCP_METRIC_SOURCE_PROVIDER
          }
        : log
    )
  };
}

function withAw3aMcpMetricAuthority(ctx: McpContext): McpContext {
  const originalRpc = ctx.supabase.rpc.bind(ctx.supabase);
  const supabase = new Proxy(ctx.supabase, {
    get(target, property, receiver) {
      if (property === "rpc") {
        return (
          functionName: string,
          args?: RpcArguments,
          options?: Record<string, unknown>
        ) => {
          const normalizedArgs = functionName === "upsert_workout_set_logs_atomic"
            ? withChatGptMetricSource(args)
            : args;
          return originalRpc(functionName as never, normalizedArgs as never, options as never);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as McpContext["supabase"];

  return { ...ctx, supabase };
}

export async function executeMcpTool(
  ctx: McpContext,
  toolName: string,
  rawInput: unknown
): Promise<McpToolResult> {
  return executeMcpToolImplementation(withAw3aMcpMetricAuthority(ctx), toolName, rawInput);
}
