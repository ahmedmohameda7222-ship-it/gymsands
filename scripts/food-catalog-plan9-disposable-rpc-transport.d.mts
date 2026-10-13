/** Types for the disposable-only PostgreSQL RPC test transport. */
export function sql(statement: string, role?: "authenticated" | "anon" | "service_role", userId?: string): string;
export function jsonExpr(expression: string): any;
export function callRpc(name: string, command: unknown, role?: "authenticated" | "anon" | "service_role", userId?: string): any;
export const localRpcClient: {
  rpc(name: string, args: { p_command: unknown }): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
};
