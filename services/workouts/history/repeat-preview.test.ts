import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => ({
  getActivity: vi.fn(),
  getActivityAlternatives: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/activity-catalog/server/selector", () => ({
  createActivityCatalogProvider: () => catalog,
}));

import {
  getRepeatWorkoutPreview,
  startRepeatedWorkout,
} from "@/services/workouts/history/repeat";

type Row = Record<string, unknown>;
const owner = "20000000-0000-4000-8000-000000000001";
const sourceId = "10000000-0000-4000-8000-000000000001";
const itemId = "30000000-0000-4000-8000-000000000001";

function queryClient(rows: Record<string, Row[]>) {
  const calls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const filters: Array<(row: Row) => boolean> = [];
      let rowLimit: number | null = null;
      const result = () => {
        const data = (rows[table] ?? []).filter((row) =>
          filters.every((filter) => filter(row)),
        );
        return {
          data: rowLimit === null ? data : data.slice(0, rowLimit),
          error: null,
        };
      };
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      });
      builder.is = vi.fn((column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      });
      builder.not = vi.fn(
        (column: string, operator: string, value: unknown) => {
          filters.push((row) =>
            operator === "is" && value === null ? row[column] != null : true,
          );
          return builder;
        },
      );
      builder.in = vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      });
      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn((value: number) => {
        rowLimit = value;
        return builder;
      });
      builder.maybeSingle = vi.fn(async () => {
        const value = result();
        return { data: value.data[0] ?? null, error: null };
      });
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject);
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function fixture(
  identity: "global" | "custom" | "provider" = "global",
  status = "completed",
) {
  const globalId = "40000000-0000-4000-8000-000000000001";
  const customId = "50000000-0000-4000-8000-000000000001";
  const item = {
    id: itemId,
    snapshot_id: "60000000-0000-4000-8000-000000000001",
    user_id: owner,
    item_order: 1,
    activity_name_snapshot: "Historical press",
    actual_name_snapshot: null,
    actual_global_exercise_id: null,
    actual_custom_exercise_id: null,
    actual_provider: identity === "provider" ? "catalog" : null,
    actual_provider_activity_id:
      identity === "provider" ? "provider-press" : null,
    planned_global_exercise_id: identity === "global" ? globalId : null,
    planned_custom_exercise_id: identity === "custom" ? customId : null,
    planned_provider: null,
    planned_provider_activity_id: null,
    planned_prescription: { sets: 2, reps: "8-10" },
  };
  return {
    workout_sessions: [
      {
        id: sourceId,
        user_id: owner,
        workout_name: "Upper",
        status,
        deleted_at: null,
      },
    ],
    workout_session_muscle_snapshots: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        workout_session_id: sourceId,
        user_id: owner,
      },
    ],
    workout_session_muscle_snapshot_items: [item],
    workout_session_prescription_sets: [
      {
        id: "70000000-0000-4000-8000-000000000001",
        snapshot_item_id: itemId,
        set_order: 1,
      },
    ],
    workout_session_prescription_metric_targets: [
      {
        prescription_set_id: "70000000-0000-4000-8000-000000000001",
        metric_key: "repetitions",
      },
    ],
    exercises:
      identity === "global"
        ? [
            {
              id: globalId,
              name: "Current press",
              is_global: true,
              is_approved: true,
            },
          ]
        : [],
    user_custom_exercises:
      identity === "custom"
        ? [{ id: customId, user_id: owner, name: "My press" }]
        : [],
    exercise_logs: [],
  };
}

describe("WH-8 repeat preview", () => {
  beforeEach(() => {
    catalog.getActivity.mockReset();
    catalog.getActivityAlternatives.mockReset();
  });

  it("returns frozen prescription sets and current global availability without performed logs", async () => {
    const { client, calls } = queryClient(fixture());
    const preview = await getRepeatWorkoutPreview(client, owner, sourceId);
    expect(preview.items[0]).toMatchObject({
      historicalName: "Historical press",
      currentResolution: { state: "available", name: "Current press" },
      plannedPrescription: { sets: 2, reps: "8-10" },
    });
    expect(preview.items[0]?.normalizedSets[0]).toMatchObject({
      targets: [{ metric_key: "repetitions" }],
    });
    expect(calls).not.toContain("exercise_logs");
  });

  it("rejects malformed start payloads before calling the database", async () => {
    const { client } = queryClient(fixture());
    await expect(
      startRepeatedWorkout(client, owner, sourceId, null),
    ).rejects.toMatchObject({
      code: "invalid_repeat_request",
      status: 400,
    });
  });

  it("requires meaningful performed work for a cancelled source", async () => {
    const { client } = queryClient(fixture("global", "cancelled"));
    await expect(
      getRepeatWorkoutPreview(client, owner, sourceId),
    ).rejects.toMatchObject({ code: "source_unavailable" });
  });

  it("does not silently map removed global or custom exercises by historical name", async () => {
    const removedGlobal = fixture();
    removedGlobal.exercises = [];
    const globalPreview = await getRepeatWorkoutPreview(
      queryClient(removedGlobal).client,
      owner,
      sourceId,
    );
    expect(globalPreview.items[0]?.currentResolution).toMatchObject({
      state: "replacement-required",
      reason: "global_exercise_removed",
    });

    const removedCustom = fixture("custom");
    removedCustom.user_custom_exercises = [];
    const customPreview = await getRepeatWorkoutPreview(
      queryClient(removedCustom).client,
      owner,
      sourceId,
    );
    expect(customPreview.items[0]?.currentResolution).toMatchObject({
      state: "replacement-required",
      reason: "custom_exercise_removed",
    });
  });

  it("uses the server catalog boundary for unavailable provider replacements", async () => {
    catalog.getActivity.mockRejectedValueOnce(new Error("removed"));
    catalog.getActivityAlternatives.mockResolvedValueOnce({
      data: [
        {
          alternativeActivityId: "provider-row",
          alternativeName: "Supported row",
        },
      ],
    });
    const preview = await getRepeatWorkoutPreview(
      queryClient(fixture("provider")).client,
      owner,
      sourceId,
      "de",
    );
    expect(preview.items[0]?.currentResolution).toMatchObject({
      state: "replacement-required",
      alternatives: [
        {
          name: "Supported row",
          identity: {
            targetType: "provider_activity",
            identity: "provider-row",
            provider: "catalog",
          },
        },
      ],
    });
  });
});
