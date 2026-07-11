import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurrentUserDataExport } from "./data-export";

const userA = "11111111-1111-4111-8111-111111111111";

type QueryCall = {
  table: string;
  selection?: string;
  filters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
};

function exportSupabaseMock() {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: [], inFilters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) calls.push(call);
      recorded = true;
    };
    const result = () => {
      record();
      if (table === "profiles") {
        return { data: { id: userA, email: "a@example.test", full_name: "User A", role: "member" }, error: null };
      }
      if (table === "chatgpt_connections") {
        return { data: [{ id: "connection-a", label: "ChatGPT", scopes: ["plaivra.workouts.read"], is_active: true }], error: null };
      }
      if (table === "mcp_audit_logs") {
        return {
          data: [{
            id: "activity-a",
            tool_name: "get_workout_plans",
            output_summary: { denied: false },
            status: "success",
            created_at: "2026-07-02T00:00:00.000Z"
          }],
          error: null
        };
      }
      if (table === "user_workout_plans") return { data: [{ id: "plan-a", user_id: userA }], error: null };
      if (table === "user_workout_plan_days") return { data: [{ id: "day-a", plan_id: "plan-a" }], error: null };
      if (table === "user_workout_plan_exercises") return { data: [{ id: "exercise-a", plan_day_id: "day-a" }], error: null };
      if (table === "workout_sessions") return { data: [{ id: "session-a", user_id: userA }], error: null };
      if (table === "user_workout_sessions") return { data: [{ id: "scheduled-a", user_id: userA }], error: null };
      if (table === "meals") return { data: [{ id: "meal-a", user_id: userA }], error: null };
      if (table === "saved_recipes") return { data: [{ id: "recipe-a", user_id: userA }], error: null };
      return { data: [{ id: `${table}-a`, user_id: userA }], error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((selection: string) => { call.selection = selection; return builder; });
    builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.in = vi.fn((field: string, values: unknown[]) => { call.inFilters.push([field, values]); return builder; });
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result());
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe("current-user privacy export", () => {
  it("owner-scopes direct data, constrains related rows to owned parents, and redacts OAuth internals", async () => {
    const { client, calls } = exportSupabaseMock();
    const payload = await buildCurrentUserDataExport(client, {
      id: userA,
      email: "a@example.test",
      created_at: "2026-01-01T00:00:00.000Z"
    });

    const directlyOwnedTables = [
      "onboarding_answers", "user_app_settings", "user_ai_permission_settings", "user_consents",
      "privacy_requests", "user_workout_plans", "workout_sessions", "user_workout_sessions",
      "food_logs", "calorie_targets", "user_food_items", "user_meal_plan_items", "meals",
      "water_logs", "progress_entries", "body_measurements", "progress_photos", "personal_records",
      "daily_fit_tasks", "fitness_habits", "sleep_recovery_logs", "supplement_logs"
    ];
    for (const table of directlyOwnedTables) {
      expect(calls.find((call) => call.table === table)?.filters).toContainEqual(["user_id", userA]);
    }

    expect(calls.find((call) => call.table === "profiles")?.filters).toContainEqual(["id", userA]);
    expect(calls.find((call) => call.table === "chatgpt_connections")?.filters).toContainEqual(["user_id", userA]);
    expect(calls.find((call) => call.table === "user_workout_plan_days")?.inFilters).toContainEqual(["plan_id", ["plan-a"]]);
    expect(calls.find((call) => call.table === "user_workout_plan_exercises")?.inFilters).toContainEqual(["plan_day_id", ["day-a"]]);
    expect(calls.find((call) => call.table === "mcp_audit_logs")?.filters).toContainEqual(["user_id", userA]);
    expect(calls.find((call) => call.table === "user_fitness_constraints")?.filters).toContainEqual(["user_id", userA]);
    expect(calls.find((call) => call.table === "user_nutrition_preference_profiles")?.filters).toContainEqual(["user_id", userA]);
    expect(calls.find((call) => call.table === "user_daily_checkins")?.filters).toContainEqual(["user_id", userA]);

    const queriedTables = calls.map((call) => call.table);
    expect(queriedTables).not.toContain("mcp_oauth_access_tokens");
    expect(queriedTables).not.toContain("mcp_oauth_authorization_codes");
    expect(calls.find((call) => call.table === "chatgpt_connections")?.selection).not.toContain("token_hash");
    expect(calls.find((call) => call.table === "user_integrations")?.selection).not.toContain("access_token");
    expect(calls.find((call) => call.table === "user_integrations")?.selection).not.toContain("refresh_token");
    expect(calls.find((call) => call.table === "mcp_audit_logs")?.selection).not.toContain("input");

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("authorization_code");
    expect(serialized).not.toContain("raw_prompt");
    expect(payload.data.chatgpt_activity).toEqual([expect.objectContaining({ connectionLabel: "ChatGPT" })]);
    expect(payload.formatVersion).toBe(2);
    expect(payload.scope).toBe("authenticated-current-user-canonical-data");
  });
});
