import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpContext } from "./auth";
import { MCP_SCOPES } from "./scopes";
import { executeMcpTool } from "./tool-executor";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "44444444-4444-4444-8444-444444444444";

function contextWith(supabase: unknown): McpContext {
  return {
    supabase: supabase as SupabaseClient,
    userId,
    connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    scopes: [MCP_SCOPES.workoutsWrite],
    profile: { id: userId, email: "owner@example.test", full_name: "Owner", role: "member" }
  };
}

function queryResult(data: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return query;
}

describe("MCP AW-3A performance metric source authority", () => {
  it("tags existing log_exercise_sets values as chatgpt/openai without adding metric schema fields", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: "55555555-5555-4555-8555-555555555555" }], error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workout_sessions") {
          return queryResult({
            id: sessionId,
            user_id: userId,
            scheduled_session_id: null,
            plan_day_id: null,
            status: "started"
          });
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc
    };

    const result = await executeMcpTool(contextWith(supabase), "log_exercise_sets", {
      workout_session_id: sessionId,
      exercise_name: "Bench Press",
      sets: [{ set_number: 1, reps: 8, weight_kg: 50 }]
    });

    expect(result.structuredContent).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("upsert_workout_set_logs_atomic", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_logs: [
        expect.objectContaining({
          exercise_name: "Bench Press",
          set_number: 1,
          reps: 8,
          weight_kg: 50,
          metric_source: "chatgpt",
          metric_source_provider: "openai"
        })
      ]
    });

    const payload = rpc.mock.calls[0]?.[1] as { p_logs?: Array<Record<string, unknown>> };
    expect(payload.p_logs?.[0]).not.toHaveProperty("performance_metrics");
  });
});
