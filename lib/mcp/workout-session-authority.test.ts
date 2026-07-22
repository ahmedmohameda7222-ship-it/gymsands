import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpContext } from "./auth";
import { MCP_SCOPES } from "./scopes";
import { executeMcpTool } from "./tool-executor-safe";

const userId = "11111111-1111-4111-8111-111111111111";
const scheduledId = "22222222-2222-4222-8222-222222222222";
const planDayId = "33333333-3333-4333-8333-333333333333";
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
  for (const method of ["select", "eq", "limit", "order", "is", "in"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  query.single = vi.fn(async () => ({ data, error: null }));
  return query;
}

describe("MCP AW-2C workout-session authority", () => {
  it("fails closed instead of directly creating an unbound workout session", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() };
    const result = await executeMcpTool(contextWith(supabase), "start_workout", {});
    expect(result).toMatchObject({ isError: true, structuredContent: { ok: false, code: "missing_required_input" } });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("starts a scheduled workout only through the scheduled atomic authority", async () => {
    const rpc = vi.fn(async () => ({ data: { session: { id: sessionId } }, error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_workout_sessions") return queryResult({ id: scheduledId, plan_day_id: planDayId });
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc
    };
    const result = await executeMcpTool(contextWith(supabase), "start_workout", { scheduled_session_id: scheduledId });
    expect(result.structuredContent).toMatchObject({ ok: true, session: { id: sessionId } });
    expect(rpc).toHaveBeenCalledWith("start_or_resume_workout_session_atomic", {
      p_user_id: userId,
      p_plan_day_id: planDayId,
      p_scheduled_session_id: scheduledId
    });
  });

  it("skips a scheduled workout only through the AW-2C skip authority", async () => {
    const rpc = vi.fn(async () => ({ data: { session: { id: sessionId, status: "skipped" } }, error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "user_workout_sessions") return queryResult({ id: scheduledId, plan_day_id: planDayId });
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc
    };
    const result = await executeMcpTool(contextWith(supabase), "skip_workout", {
      scheduled_session_id: scheduledId,
      reason: "Private reason"
    });
    expect(result.structuredContent).toMatchObject({ ok: true, session: { id: sessionId, status: "skipped" } });
    expect(rpc).toHaveBeenCalledWith("skip_workout_day_atomic", {
      p_user_id: userId,
      p_plan_day_id: planDayId,
      p_notes: "Private reason",
      p_reason: null,
      p_followup_action: null
    });
  });

  it("fails closed for a direct performed-session skip without a plan day", async () => {
    const rpc = vi.fn();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "workout_sessions") return queryResult({ id: sessionId, user_id: userId, scheduled_session_id: null, plan_day_id: null, status: "started" });
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc
    };
    const result = await executeMcpTool(contextWith(supabase), "skip_workout", { workout_session_id: sessionId });
    expect(result).toMatchObject({ isError: true, structuredContent: { ok: false, code: "unsupported_direct_session_skip" } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
