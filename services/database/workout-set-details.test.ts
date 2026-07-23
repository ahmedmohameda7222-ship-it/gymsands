import { describe, expect, it } from "vitest";
import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  normalizeWorkoutSetDetailsRelation,
  normalizeWorkoutSetSegmentsRelation,
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

describe("AW-3B structured workout set details", () => {
  it("normalizes PostgREST object-or-array embedded relationships", () => {
    const details = normalizeWorkoutSetDetailsRelation([
      { exercise_log_id: "log-1", rpe: "8.5" },
    ] as never);
    expect(details).toMatchObject({ exercise_log_id: "log-1", rpe: "8.5" });

    const segments = normalizeWorkoutSetSegmentsRelation({
      id: "segment-1",
      metric_values: { id: "metric-1", value: "6" },
    } as never);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.metric_values).toEqual([
      expect.objectContaining({ id: "metric-1", value: "6" }),
    ]);
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
      source: "device",
      sourceProvider: "watch.vendor",
      sourceVersion: "v2",
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
    ).toEqual(["repetitions", "external_load_kg"]);
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
