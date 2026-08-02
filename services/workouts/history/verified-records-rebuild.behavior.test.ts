import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { rebuildVerifiedRecordsForIdentities } from "@/services/workouts/history/verified-records";

const userId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const identity = `global:${exerciseId}`;
const sessionA = "22222222-2222-4222-8222-222222222222";
const sessionB = "33333333-3333-4333-8333-333333333333";
const snapshotA = "44444444-4444-4444-8444-444444444444";
const snapshotB = "55555555-5555-4555-8555-555555555555";
const itemA = "66666666-6666-4666-8666-666666666666";
const itemB = "77777777-7777-4777-8777-777777777777";
const logA = "88888888-8888-4888-8888-888888888888";
const logB = "99999999-9999-4999-8999-999999999999";
const planExerciseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type FixtureState = {
  sessions: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
};

function session(id: string, completedAt: string, deletedAt: string | null = null) {
  return {
    id,
    user_id: userId,
    status: "completed",
    workout_id: null,
    started_at: new Date(Date.parse(completedAt) - 60 * 60 * 1000).toISOString(),
    completed_at: completedAt,
    cancelled_at: null,
    deleted_at: deletedAt,
  };
}

function log(
  id: string,
  workoutSessionId: string,
  weight: number,
  completedAt: string,
) {
  return {
    id,
    workout_session_id: workoutSessionId,
    plan_exercise_id: planExerciseId,
    plan_activity_id: null,
    exercise_order: 1,
    exercise_name: "Bench press",
    set_number: 1,
    reps: 5,
    weight_kg: weight,
    completed_at: completedAt,
    set_type: "working",
    performance_metrics: [
      { metric_key: "repetitions", value: 5, side: "none" },
      { metric_key: "external_load_kg", value: weight, side: "none" },
    ],
    set_details: { set_type: "working", rpe: 8, rir: 2 },
    segments: [],
  };
}

function clientFor(state: FixtureState) {
  const rpcPayloads: Array<Record<string, unknown>> = [];
  const snapshots = [
    { id: snapshotA, workout_session_id: sessionA, user_id: userId },
    { id: snapshotB, workout_session_id: sessionB, user_id: userId },
  ];
  const items = [
    {
      id: itemA,
      snapshot_id: snapshotA,
      user_id: userId,
      source_plan_exercise_id: planExerciseId,
      source_plan_activity_id: null,
      item_order: 1,
      actual_global_exercise_id: exerciseId,
      actual_custom_exercise_id: null,
      actual_provider: null,
      actual_provider_activity_id: null,
      planned_global_exercise_id: exerciseId,
      planned_custom_exercise_id: null,
      planned_provider: null,
      planned_provider_activity_id: null,
    },
    {
      id: itemB,
      snapshot_id: snapshotB,
      user_id: userId,
      source_plan_exercise_id: planExerciseId,
      source_plan_activity_id: null,
      item_order: 1,
      actual_global_exercise_id: exerciseId,
      actual_custom_exercise_id: null,
      actual_provider: null,
      actual_provider_activity_id: null,
      planned_global_exercise_id: exerciseId,
      planned_custom_exercise_id: null,
      planned_provider: null,
      planned_provider_activity_id: null,
    },
  ];
  const tables: Record<string, Array<Record<string, unknown>>> = {
    workout_sessions: state.sessions,
    exercise_logs: state.logs,
    workout_session_muscle_snapshots: snapshots,
    workout_session_muscle_snapshot_items: items,
  };
  const client = {
    from: vi.fn((table: string) => {
      const equalities = new Map<string, unknown>();
      const nullFilters = new Map<string, unknown>();
      const inFilters = new Map<string, unknown[]>();
      const notNullFields = new Set<string>();
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((field: string, value: unknown) => {
        equalities.set(field, value);
        return builder;
      });
      builder.is = vi.fn((field: string, value: unknown) => {
        nullFilters.set(field, value);
        return builder;
      });
      builder.in = vi.fn((field: string, values: unknown[]) => {
        inFilters.set(field, values);
        return builder;
      });
      builder.not = vi.fn((field: string, operator: string, value: unknown) => {
        if (operator === "is" && value === null) notNullFields.add(field);
        return builder;
      });
      builder.or = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        const rows = (tables[table] ?? []).filter((row) =>
          [...equalities].every(([field, value]) => row[field] === value)
          && [...nullFilters].every(([field, value]) => row[field] === value)
          && [...inFilters].every(([field, values]) => values.includes(row[field]))
          && [...notNullFields].every((field) => row[field] !== null));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      };
      return builder;
    }),
    rpc: vi.fn(async (name: string, payload: Record<string, unknown>) => {
      expect(name).toBe("replace_workout_derived_records_for_identities_atomic");
      rpcPayloads.push(payload);
      return {
        data: {
          record_count: Array.isArray(payload.p_records) ? payload.p_records.length : 0,
          identity_count: 1,
          evaluated_session_count: Array.isArray(payload.p_evaluated_session_ids)
            ? payload.p_evaluated_session_ids.length
            : 0,
          schema_version: 1,
          formula_version: "wh6-v1",
          status: "current",
        },
        error: null,
      };
    }),
  };
  return {
    client: client as unknown as SupabaseClient,
    payload: () => rpcPayloads.at(-1)!,
  };
}

function highestLoadRecords(payload: Record<string, unknown>) {
  return ((payload.p_records ?? []) as Array<Record<string, unknown>>)
    .filter((record) => record.record_type === "highest_load")
    .map((record) => ({
      exerciseLogId: record.exercise_log_id,
      value: record.record_value,
    }));
}

async function rebuild(state: FixtureState, seedSessionId = sessionA) {
  const runtime = clientFor(state);
  await rebuildVerifiedRecordsForIdentities(
    runtime.client,
    userId,
    [identity],
    seedSessionId,
  );
  return runtime.payload();
}

describe("verified-record deterministic affected-identity rebuild", () => {
  const completedA = "2026-08-01T10:00:00.000Z";
  const completedB = "2026-08-02T10:00:00.000Z";

  it("promotes the later 95 kg session after the original 100 kg winner is deleted", async () => {
    const payload = await rebuild({
      sessions: [
        session(sessionA, completedA, "2026-08-03T00:00:00.000Z"),
        session(sessionB, completedB),
      ],
      logs: [
        log(logA, sessionA, 100, completedA),
        log(logB, sessionB, 95, completedB),
      ],
    });
    expect(highestLoadRecords(payload)).toEqual([
      { exerciseLogId: logB, value: 95 },
    ]);
  });

  it("promotes 95 kg after the original winner is corrected down to 90 kg", async () => {
    const payload = await rebuild({
      sessions: [session(sessionA, completedA), session(sessionB, completedB)],
      logs: [
        log(logA, sessionA, 90, completedA),
        log(logB, sessionB, 95, completedB),
      ],
    });
    expect(highestLoadRecords(payload)).toEqual([
      { exerciseLogId: logA, value: 90 },
      { exerciseLogId: logB, value: 95 },
    ]);
  });

  it("restores the 100 kg historical winner and keeps deterministic chronology", async () => {
    const payload = await rebuild({
      sessions: [session(sessionB, completedB), session(sessionA, completedA)],
      logs: [
        log(logB, sessionB, 95, completedB),
        log(logA, sessionA, 100, completedA),
      ],
    });
    expect(highestLoadRecords(payload)).toEqual([
      { exerciseLogId: logA, value: 100 },
    ]);
    expect(payload.p_evaluated_session_ids).toEqual([sessionA, sessionB]);
  });

  it("produces the same stable record sequence regardless of input order", async () => {
    const chronological = await rebuild({
      sessions: [session(sessionA, completedA), session(sessionB, completedB)],
      logs: [
        log(logA, sessionA, 90, completedA),
        log(logB, sessionB, 95, completedB),
      ],
    });
    const reversed = await rebuild({
      sessions: [session(sessionB, completedB), session(sessionA, completedA)],
      logs: [
        log(logB, sessionB, 95, completedB),
        log(logA, sessionA, 90, completedA),
      ],
    });
    expect(reversed.p_records).toEqual(chronological.p_records);
    expect(reversed.p_evaluated_session_ids).toEqual(
      chronological.p_evaluated_session_ids,
    );
  });
});
