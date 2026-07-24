import { describe, expect, it } from "vitest";
import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  normalizeWorkoutSetDetailsRelation,
  normalizeWorkoutSetSegmentsRelation,
  parseWorkoutSetEffortInput,
  validateWorkoutSetEffortInput,
  workoutSetDetailsInputToSql,
  workoutSetSegmentsInputToSql,
} from "./workout-set-details";
import { serializeWorkoutSetLogs } from "./workout-set-log-serialization";

const baseLog = {
  exerciseOrder: 1,
  exerciseName: "Split squat",
  setNumber: 1,
  reps: 8,
  weightKg: 20,
  completedAt: "2026-07-22T20:00:00.000Z",
};

const relationContext = {
  exerciseLogId: "log-1",
  workoutSessionId: "session-1",
  userId: "user-1",
};

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    exercise_log_id: "log-1",
    workout_session_id: "session-1",
    user_id: "user-1",
    schema_version: 1,
    set_type: "working",
    rpe: "8.5",
    rir: "1.5",
    notes: null,
    side_mode: "none",
    planned_tempo: null,
    performed_tempo: null,
    tempo_adherence: "not_recorded",
    source: "manual",
    source_provider: "plaivra",
    source_version: "aw3b-v1",
    created_at: "2026-07-22T20:00:00.000Z",
    updated_at: "2026-07-22T20:00:00.000Z",
    ...overrides,
  };
}

function metricRow(id: string, metricKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    segment_id: "segment-1",
    exercise_log_id: "log-1",
    workout_session_id: "session-1",
    user_id: "user-1",
    metric_key: metricKey,
    metric_version: 1,
    side: "none",
    value: "6",
    source: "manual",
    source_provider: "plaivra",
    source_version: "aw3b-v1",
    captured_at: "2026-07-22T20:00:00.000Z",
    created_at: "2026-07-22T20:00:00.000Z",
    updated_at: "2026-07-22T20:00:00.000Z",
    ...overrides,
  };
}

function segmentRow(id: string, order: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    exercise_log_id: "log-1",
    workout_session_id: "session-1",
    user_id: "user-1",
    segment_order: order,
    segment_kind: "drop",
    side: "none",
    completed_at: null,
    source: "manual",
    source_provider: "plaivra",
    source_version: "aw3b-v1",
    created_at: "2026-07-22T20:00:00.000Z",
    updated_at: "2026-07-22T20:00:00.000Z",
    metric_values: [],
    ...overrides,
  };
}

describe("AW-3B structured workout set details", () => {
  it("normalizes deterministic PostgREST relations and rejects malformed cardinality", () => {
    expect(normalizeWorkoutSetDetailsRelation(null, relationContext)).toBeNull();
    expect(normalizeWorkoutSetDetailsRelation([], relationContext)).toBeNull();
    expect(
      normalizeWorkoutSetDetailsRelation([detailRow()] as never, relationContext),
    ).toMatchObject({ exercise_log_id: "log-1", rpe: "8.5" });
    expect(() =>
      normalizeWorkoutSetDetailsRelation(
        [detailRow(), detailRow({ updated_at: "2026-07-22T20:01:00.000Z" })] as never,
        relationContext,
      ),
    ).toThrow(/exactly one/i);
    expect(() =>
      normalizeWorkoutSetDetailsRelation(
        detailRow({ exercise_log_id: "other-log" }) as never,
        relationContext,
      ),
    ).toThrow(/parent log/i);

    expect(() =>
      normalizeWorkoutSetDetailsRelation("" as never, relationContext),
    ).toThrow(/malformed/i);
    expect(() =>
      normalizeWorkoutSetSegmentsRelation(false as never, relationContext),
    ).toThrow(/malformed/i);

    const segments = normalizeWorkoutSetSegmentsRelation([
      segmentRow("segment-2", 2, {
        metric_values: [
          metricRow("metric-2", "repetitions", { segment_id: "segment-2" }),
          metricRow("metric-1", "external_load_kg", { segment_id: "segment-2" }),
        ],
      }),
      segmentRow("segment-1", 1, {
        metric_values: metricRow("metric-3", "repetitions"),
      }),
    ] as never, relationContext);
    expect(segments.map((segment) => segment.segment_order)).toEqual([1, 2]);
    expect(segments[1]?.metric_values?.map((metric) => metric.metric_key)).toEqual([
      "external_load_kg",
      "repetitions",
    ]);

    expect(() => normalizeWorkoutSetSegmentsRelation([
      segmentRow("segment-1", 1),
      segmentRow("segment-2", 1),
    ] as never, relationContext)).toThrow(/duplicated/i);
    expect(() => normalizeWorkoutSetSegmentsRelation([
      segmentRow("segment-1", 1, {
        metric_values: [
          metricRow("metric-1", "repetitions"),
          metricRow("metric-2", "repetitions"),
        ],
      }),
    ] as never, relationContext)).toThrow(/identity is duplicated/i);
    expect(() => normalizeWorkoutSetSegmentsRelation([
      segmentRow("segment-1", 1, {
        metric_values: metricRow("metric-1", "repetitions", { segment_id: "wrong" }),
      }),
    ] as never, relationContext)).toThrow(/parent segment/i);
    expect(() => normalizeWorkoutSetSegmentsRelation([
      segmentRow("segment-1", 1, {
        metric_values: metricRow("metric-1", "repetitions", { metric_version: 0 }),
      }),
    ] as never, relationContext)).toThrow(/version is malformed/i);
  });

  it("normalizes the complete bounded v1 detail contract", () => {
    expect(
      workoutSetDetailsInputToSql({
        setType: "backoff",
        rpe: 8.5,
        rir: 1.5,
        notes: "Controlled effort",
        sideMode: "alternating",
        plannedTempo: "3-1-1-0",
        performedTempo: "3-1-1-0",
        tempoAdherence: "adhered",
        source: "manual",
        sourceProvider: "plaivra",
        sourceVersion: "aw3b-v1",
      }),
    ).toEqual({
      schema_version: 1,
      set_type: "backoff",
      rpe: 8.5,
      rir: 1.5,
      notes: "Controlled effort",
      side_mode: "alternating",
      planned_tempo: "3-1-1-0",
      performed_tempo: "3-1-1-0",
      tempo_adherence: "adhered",
      source: "manual",
      source_provider: "plaivra",
      source_version: "aw3b-v1",
    });
  });

  it("rejects out-of-range or over-precise RPE and RIR", () => {
    expect(
      workoutSetDetailsInputToSql({ setType: "working", rpe: 8.3, rir: 19.9 }),
    ).toMatchObject({ rpe: 8.3, rir: 19.9 });
    expect(() =>
      workoutSetDetailsInputToSql({ setType: "working", rpe: 10.1 }),
    ).toThrow(/RPE/);
    expect(() =>
      workoutSetDetailsInputToSql({ setType: "working", rpe: 8.25 }),
    ).toThrow(/RPE/);
    expect(() =>
      workoutSetDetailsInputToSql({ setType: "working", rir: 20.1 }),
    ).toThrow(/RIR/);
    expect(() =>
      workoutSetDetailsInputToSql({ setType: "working", rir: 1.25 }),
    ).toThrow(/RIR/);
    expect(
      workoutSetDetailsInputToSql({ setType: "working", rpe: 0.1 + 0.2 }),
    ).toMatchObject({ rpe: 0.3 });
  });

  it("validates typed RPE and RIR without silent rounding", () => {
    expect(validateWorkoutSetEffortInput("", "rpe")).toEqual({ value: null, error: null });
    expect(validateWorkoutSetEffortInput("8.5", "rpe")).toEqual({ value: 8.5, error: null });
    expect(validateWorkoutSetEffortInput("20.0", "rir")).toEqual({ value: 20, error: null });
    expect(validateWorkoutSetEffortInput("8.25", "rpe").error).toBe("format");
    expect(validateWorkoutSetEffortInput("10.1", "rpe").error).toBe("range");
    expect(validateWorkoutSetEffortInput("1e1", "rpe").error).toBe("format");
    expect(validateWorkoutSetEffortInput("-1", "rir").error).toBe("format");
    expect(() => parseWorkoutSetEffortInput("8.25", "rpe")).toThrow(/one decimal/i);
    expect(parseWorkoutSetEffortInput("0.0", "rpe")).toBe(0);
  });

  it("bounds Unicode notes, tempo text, side modes, and machine sources", () => {
    const astralCharacter = String.fromCodePoint(0x1f600);
    expect(
      workoutSetDetailsInputToSql({
        setType: "working",
        notes: astralCharacter.repeat(4000),
      }).notes,
    ).toBe(astralCharacter.repeat(4000));
    expect(() =>
      workoutSetDetailsInputToSql({
        setType: "working",
        notes: astralCharacter.repeat(4001),
      }),
    ).toThrow(/4000/);
    expect(() =>
      workoutSetDetailsInputToSql({
        setType: "working",
        plannedTempo: "2-0\n2-0",
      }),
    ).toThrow(/tempo/i);
    expect(() =>
      workoutSetDetailsInputToSql({
        setType: "working",
        plannedTempo: "1".repeat(65),
      }),
    ).toThrow(/tempo/i);
    expect(() =>
      workoutSetDetailsInputToSql({
        setType: "working",
        sideMode: "unsafe" as "left",
      }),
    ).toThrow(/side/i);
    expect(() =>
      workoutSetDetailsInputToSql({ setType: "working", source: "device" }),
    ).toThrow(/provider/i);

    const overLimit = astralCharacter.repeat(4001);
    expect(canUpdateWorkoutSetNote(overLimit, astralCharacter.repeat(4000))).toBe(true);
    expect(canUpdateWorkoutSetNote(overLimit, astralCharacter.repeat(4002))).toBe(false);
    expect(canUpdateWorkoutSetNote("short", "still short")).toBe(true);
  });

  it("distinguishes omitted provenance inheritance from explicit null clearing", () => {
    const defaults = {
      source: "manual" as const,
      sourceProvider: "device.vendor",
      sourceVersion: "v2",
    };
    expect(
      workoutSetDetailsInputToSql({ setType: "working" }, defaults),
    ).toMatchObject({
      source_provider: "device.vendor",
      source_version: "v2",
    });
    expect(
      workoutSetDetailsInputToSql(
        {
          setType: "working",
          sourceProvider: null,
          sourceVersion: null,
        },
        defaults,
      ),
    ).toMatchObject({ source_provider: null, source_version: null });
  });

  it("reserves backfill provenance and reattributes edited backfilled details", () => {
    expect(
      editableWorkoutSetProvenance("backfill", "plaivra", "aw3b-backfill-v1"),
    ).toEqual({
      source: "manual",
      sourceProvider: "plaivra",
      sourceVersion: "aw3b-v1",
    });
    expect(
      editableWorkoutSetProvenance("device", "watch.vendor", "v2"),
    ).toEqual({
      source: "manual",
      sourceProvider: "plaivra",
      sourceVersion: "aw3b-v1",
    });
    expect(
      editableWorkoutSetProvenance("chatgpt", "openai", "gpt-v1"),
    ).toEqual({
      source: "manual",
      sourceProvider: "plaivra",
      sourceVersion: "aw3b-v1",
    });
    expect(
      editableWorkoutSetProvenance("import", "vendor", "v1"),
    ).toEqual({
      source: "manual",
      sourceProvider: "plaivra",
      sourceVersion: "aw3b-v1",
    });
    expect(() =>
      workoutSetDetailsInputToSql({
        setType: "working",
        source: "backfill" as never,
      }),
    ).toThrow(/reserved/i);
    expect(() =>
      workoutSetSegmentsInputToSql([
        {
          segmentOrder: 1,
          segmentKind: "drop",
          source: "backfill" as never,
        },
      ]),
    ).toThrow(/reserved/i);
    expect(() =>
      workoutSetSegmentsInputToSql([
        {
          segmentOrder: 1,
          segmentKind: "drop",
          performanceMetrics: [
            { metricKey: "repetitions", value: 6, source: "backfill" as never },
          ],
        },
      ]),
    ).toThrow(/reserved/i);
    expect(() =>
      serializeWorkoutSetLogs([
        { ...baseLog, metricSource: "backfill" as never },
      ]),
    ).toThrow(/reserved/i);
    expect(() =>
      serializeWorkoutSetLogs([
        {
          ...baseLog,
          performanceMetrics: [
            { metricKey: "repetitions", value: 8, source: "backfill" as never },
          ],
        },
      ]),
    ).toThrow(/reserved/i);
  });

  it("orders and validates drop segments without inventing an ordinary primary segment", () => {
    const segments = workoutSetSegmentsInputToSql([
      {
        segmentOrder: 1,
        segmentKind: "primary",
        completedAt: "2026-07-22T20:00:00.000Z",
        performanceMetrics: [{ metricKey: "repetitions", value: 8 }],
      },
      {
        segmentOrder: 2,
        segmentKind: "drop",
        completedAt: "2026-07-22T20:00:30.000Z",
        performanceMetrics: [
          { metricKey: "repetitions", value: 6 },
          { metricKey: "external_load_kg", value: 15 },
        ],
      },
    ]);
    expect(segments.map((segment) => segment.segment_order)).toEqual([1, 2]);
    expect(
      segments[1]?.performance_metrics.map((metric) => metric.metric_key),
    ).toEqual(["external_load_kg", "repetitions"]);
    expect(workoutSetSegmentsInputToSql([])).toEqual([]);
  });

  it("rejects duplicate orders and duplicate or invalid segment metrics", () => {
    expect(() =>
      workoutSetSegmentsInputToSql([
        { segmentOrder: 1, segmentKind: "primary" },
        { segmentOrder: 1, segmentKind: "drop" },
      ]),
    ).toThrow(/order must be unique/i);
    expect(() =>
      workoutSetSegmentsInputToSql([
        {
          segmentOrder: 1,
          segmentKind: "drop",
          performanceMetrics: [
            {
              metricKey: "repetitions",
              metricVersion: 1,
              side: "left",
              value: 8,
            },
            {
              metricKey: "repetitions",
              metricVersion: 1,
              side: "left",
              value: 7,
            },
          ],
        },
      ]),
    ).toThrow(/metrics must be unique/i);
    expect(() =>
      workoutSetSegmentsInputToSql([
        {
          segmentOrder: 1,
          segmentKind: "drop",
          performanceMetrics: [{ metricKey: "rounds", value: 1.5 }],
        },
      ]),
    ).toThrow(/integer/i);
  });

  it("preserves omitted fields and serializes explicit create, clear, and replacement intent", () => {
    const [legacy] = serializeWorkoutSetLogs([
      { ...baseLog, notes: "Free note" },
    ]);
    expect(legacy).not.toHaveProperty("set_details");
    expect(legacy).not.toHaveProperty("segments");

    const [undefinedOptionalFields] = serializeWorkoutSetLogs([
      { ...baseLog, setDetails: undefined, segments: undefined },
    ]);
    expect(undefinedOptionalFields).not.toHaveProperty("set_details");
    expect(undefinedOptionalFields).not.toHaveProperty("segments");

    const [structured] = serializeWorkoutSetLogs([
      {
        ...baseLog,
        notes: "Free note",
        setDetails: { setType: "drop", rpe: 9, rir: 0, notes: "Free note" },
        segments: [
          { segmentOrder: 1, segmentKind: "drop", performanceMetrics: [] },
        ],
      },
    ]);
    expect(structured).toMatchObject({
      notes: "Free note",
      set_details: { set_type: "drop", rpe: 9, rir: 0, notes: "Free note" },
      segments: [
        { segment_order: 1, segment_kind: "drop", performance_metrics: [] },
      ],
    });

    const [cleared] = serializeWorkoutSetLogs([
      { ...baseLog, setDetails: null, segments: [] },
    ]);
    expect(cleared).toHaveProperty("set_details", null);
    expect(cleared).toHaveProperty("segments", []);
    expect(cleared).not.toHaveProperty("notes");

    const [clearedWithExplicitNote] = serializeWorkoutSetLogs([
      { ...baseLog, notes: null, setDetails: null },
    ]);
    expect(clearedWithExplicitNote).toMatchObject({
      notes: null,
      set_details: null,
    });

    const [emptyNoteClear] = serializeWorkoutSetLogs([
      {
        ...baseLog,
        notes: "",
        setDetails: { setType: "working", notes: "" },
      },
    ]);
    expect(emptyNoteClear).toMatchObject({
      notes: null,
      set_details: { notes: null },
    });
  });

  it("rejects conflicting compatibility and structured notes", () => {
    expect(() =>
      serializeWorkoutSetLogs([
        {
          ...baseLog,
          notes: "Outer",
          setDetails: { setType: "working", notes: "Inner" },
        },
      ]),
    ).toThrow(/disagree/i);
  });
});
