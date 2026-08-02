import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DERIVED_METRICS_FORMULA_VERSION,
  DERIVED_METRICS_SCHEMA_VERSION,
} from "@/lib/workouts/derived-metrics";
import { workoutHistoryRecordProjectionIsCurrent } from "@/services/workouts/history/record-projection-state";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

function client(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  return {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient;
}

function root(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    deleted_at: null,
    derived_record_schema_version: DERIVED_METRICS_SCHEMA_VERSION,
    derived_record_formula_version: DERIVED_METRICS_FORMULA_VERSION,
    derived_records_evaluated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("Workout History verified-record projection freshness", () => {
  it("accepts only the current schema, formula, and evaluated timestamp", async () => {
    await expect(workoutHistoryRecordProjectionIsCurrent(
      client({ data: root(), error: null }),
      ownerId,
      sessionId,
    )).resolves.toBe(true);

    for (const stale of [
      root({ derived_record_schema_version: null }),
      root({ derived_record_formula_version: "legacy" }),
      root({ derived_records_evaluated_at: null }),
    ]) {
      await expect(workoutHistoryRecordProjectionIsCurrent(
        client({ data: stale, error: null }),
        ownerId,
        sessionId,
      )).resolves.toBe(false);
    }
  });

  it("does not require a terminal projection for a nonterminal session", async () => {
    await expect(workoutHistoryRecordProjectionIsCurrent(
      client({
        data: root({
          status: "started",
          derived_record_schema_version: null,
          derived_record_formula_version: null,
          derived_records_evaluated_at: null,
        }),
        error: null,
      }),
      ownerId,
      sessionId,
    )).resolves.toBe(true);
  });

  it("keeps missing and failed owner-scoped reads generic", async () => {
    await expect(workoutHistoryRecordProjectionIsCurrent(
      client({ data: null, error: null }),
      ownerId,
      sessionId,
    )).rejects.toMatchObject({ code: "history_not_found", status: 404 });

    await expect(workoutHistoryRecordProjectionIsCurrent(
      client({ data: null, error: { message: "private database detail" } }),
      ownerId,
      sessionId,
    )).rejects.toMatchObject({ code: "history_detail_unavailable", status: 503 });
  });
});
