from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


write(
    "services/database/workout-set-details.ts",
    r'''import type {
  WorkoutPerformanceMetricSource,
  WorkoutSetDetailsInput,
  WorkoutSetDetailsRow,
  WorkoutSetDetailsSqlInput,
  WorkoutSetSegmentMetricValueRow,
  WorkoutSetSegmentInput,
  WorkoutSetSegmentRow,
  WorkoutSetSegmentSqlInput,
  WorkoutSetRuntimeSource,
  WorkoutSetSideMode,
  WorkoutSetTempoAdherence,
  WorkoutSetType,
} from "@/types";
import {
  isWorkoutPerformanceMetricSource,
  workoutPerformanceMetricInputToSql,
} from "./workout-performance";

const setTypes = new Set<WorkoutSetType>([
  "warmup",
  "working",
  "normal",
  "failure",
  "drop",
  "backoff",
  "amrap",
  "timed",
  "other",
]);
const sideModes = new Set<WorkoutSetSideMode>([
  "none",
  "bilateral",
  "left",
  "right",
  "alternating",
]);
const tempoAdherenceValues = new Set<WorkoutSetTempoAdherence>([
  "not_recorded",
  "adhered",
  "adjusted",
  "missed",
]);
const segmentKinds = new Set(["primary", "drop", "rest_pause", "other"]);
const providerPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
const decimalInputPattern = /^\d+(?:\.\d)?$/;
export const WORKOUT_SET_NOTE_MAX_CODE_POINTS = 4000;

export class WorkoutSetRelationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutSetRelationIntegrityError";
  }
}

type SourceDefaults = {
  source?: WorkoutSetRuntimeSource;
  sourceProvider?: string | null;
  sourceVersion?: string | null;
};

export type WorkoutSetRelationIdentity = {
  exerciseLogId: string;
  workoutSessionId: string;
  userId: string;
};

export type WorkoutSetDetailsRelation =
  | WorkoutSetDetailsRow
  | WorkoutSetDetailsRow[]
  | null
  | undefined;

export type WorkoutSetSegmentRelationRow = Omit<
  WorkoutSetSegmentRow,
  "metric_values"
> & {
  metric_values?:
    | WorkoutSetSegmentMetricValueRow
    | WorkoutSetSegmentMetricValueRow[]
    | null;
};

export type WorkoutSetSegmentsRelation =
  | WorkoutSetSegmentRelationRow
  | WorkoutSetSegmentRelationRow[]
  | null
  | undefined;

function relationArray<T>(value: T | T[] | null | undefined, label: string): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") {
    throw new WorkoutSetRelationIntegrityError(`${label} relation is malformed.`);
  }
  return [value];
}

function requireRelationRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkoutSetRelationIntegrityError(`${label} relation row is malformed.`);
  }
  return value as Record<string, unknown>;
}

function assertOwnedRelation(
  row: Record<string, unknown>,
  expected: WorkoutSetRelationIdentity | undefined,
  label: string,
) {
  if (!expected) return;
  if (
    row.exercise_log_id !== expected.exerciseLogId
    || row.workout_session_id !== expected.workoutSessionId
    || row.user_id !== expected.userId
  ) {
    throw new WorkoutSetRelationIntegrityError(`${label} relation ownership is invalid.`);
  }
}

function compareText(left: unknown, right: unknown) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function normalizeWorkoutSetDetailsRelation(
  value: WorkoutSetDetailsRelation,
  expected?: WorkoutSetRelationIdentity,
): WorkoutSetDetailsRow | null {
  const rows = relationArray(value, "Workout set detail");
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new WorkoutSetRelationIntegrityError(
      "Workout set detail relation contains more than one row.",
    );
  }
  const row = requireRelationRecord(rows[0], "Workout set detail");
  assertOwnedRelation(row, expected, "Workout set detail");
  return rows[0] as WorkoutSetDetailsRow;
}

export function normalizeWorkoutSetSegmentsRelation(
  value: WorkoutSetSegmentsRelation,
  expected?: WorkoutSetRelationIdentity,
): WorkoutSetSegmentRow[] {
  const rows = relationArray(value, "Workout set segment").map((rawSegment) => {
    const segment = requireRelationRecord(rawSegment, "Workout set segment");
    assertOwnedRelation(segment, expected, "Workout set segment");
    if (!Number.isInteger(segment.segment_order)) {
      throw new WorkoutSetRelationIntegrityError(
        "Workout set segment order is malformed.",
      );
    }

    const metricValues = relationArray(
      (rawSegment as WorkoutSetSegmentRelationRow).metric_values,
      "Workout set segment metric",
    ).map((rawMetric) => {
      const metric = requireRelationRecord(rawMetric, "Workout set segment metric");
      assertOwnedRelation(metric, expected, "Workout set segment metric");
      if (metric.segment_id !== segment.id) {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment metric relation ownership is invalid.",
        );
      }
      return rawMetric as WorkoutSetSegmentMetricValueRow;
    }).sort((left, right) =>
      compareText(left.metric_key, right.metric_key)
      || Number(left.metric_version) - Number(right.metric_version)
      || compareText(left.side, right.side)
      || compareText(left.id, right.id)
    );

    const metricIdentities = new Set<string>();
    for (const metric of metricValues) {
      const identity = `${metric.metric_key}:${metric.metric_version}:${metric.side}`;
      if (metricIdentities.has(identity)) {
        throw new WorkoutSetRelationIntegrityError(
          "Workout set segment relation contains a duplicate metric identity.",
        );
      }
      metricIdentities.add(identity);
    }

    return {
      ...(rawSegment as WorkoutSetSegmentRelationRow),
      metric_values: metricValues,
    } as WorkoutSetSegmentRow;
  }).sort((left, right) =>
    left.segment_order - right.segment_order || compareText(left.id, right.id)
  );

  const segmentOrders = new Set<number>();
  for (const segment of rows) {
    if (segmentOrders.has(segment.segment_order)) {
      throw new WorkoutSetRelationIntegrityError(
        "Workout set segment relation contains a duplicate segment order.",
      );
    }
    segmentOrders.add(segment.segment_order);
  }
  return rows;
}

function normalizeOptionalMachineValue(
  value: string | null | undefined,
  pattern: RegExp,
  label: string,
) {
  if (value === undefined || value === null || value === "") return null;
  if (!pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeSource(input: SourceDefaults, defaults?: SourceDefaults) {
  const source = input.source ?? defaults?.source ?? "manual";
  if (!isWorkoutPerformanceMetricSource(source))
    throw new Error("Workout set source is invalid.");
  if ((source as WorkoutPerformanceMetricSource) === "backfill")
    throw new Error("Backfill provenance is reserved for database migrations.");
  const sourceProvider = normalizeOptionalMachineValue(
    input.sourceProvider === undefined
      ? defaults?.sourceProvider
      : input.sourceProvider,
    providerPattern,
    "Workout set source provider",
  );
  const sourceVersion = normalizeOptionalMachineValue(
    input.sourceVersion === undefined
      ? defaults?.sourceVersion
      : input.sourceVersion,
    versionPattern,
    "Workout set source version",
  );
  if ((source === "device" || source === "import") && !sourceProvider) {
    throw new Error(
      "Device and import workout set details require a source provider.",
    );
  }
  return { source, sourceProvider, sourceVersion };
}

export function editableWorkoutSetProvenance(
  _source: WorkoutPerformanceMetricSource,
  _sourceProvider: string | null,
  _sourceVersion: string | null,
): {
  source: WorkoutSetRuntimeSource;
  sourceProvider: string | null;
  sourceVersion: string | null;
} {
  return {
    source: "manual",
    sourceProvider: "plaivra",
    sourceVersion: "aw3b-v1",
  };
}

export type WorkoutSetDecimalValidation =
  | { valid: true; value: number | null }
  | { valid: false; reason: "format" | "range" | "precision" };

export function validateWorkoutSetDecimalInput(
  rawValue: string,
  minimum: number,
  maximum: number,
): WorkoutSetDecimalValidation {
  const value = rawValue.trim();
  if (value === "") return { valid: true, value: null };
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return { valid: false, reason: "format" };
  }
  if (!decimalInputPattern.test(value)) {
    return { valid: false, reason: "precision" };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return { valid: false, reason: "range" };
  }
  return { valid: true, value: parsed };
}

export function validateWorkoutRpeInput(value: string) {
  return validateWorkoutSetDecimalInput(value, 0, 10);
}

export function validateWorkoutRirInput(value: string) {
  return validateWorkoutSetDecimalInput(value, 0, 20);
}

export function workoutSetDecimalInputToNumber(
  value: string,
  minimum: number,
  maximum: number,
  label: string,
) {
  const validation = validateWorkoutSetDecimalInput(value, minimum, maximum);
  if (!validation.valid) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} with at most one decimal place.`,
    );
  }
  return validation.value;
}

function normalizeOneDecimal(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (value === undefined || value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  if (
    !Number.isFinite(value)
    || value < minimum
    || value > maximum
    || Math.abs(value - rounded) > 1e-9
  ) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} with at most one decimal place.`,
    );
  }
  return rounded;
}

export function workoutSetNoteCodePointLength(value: string) {
  return Array.from(value).length;
}

export function isWorkoutSetNoteWithinLimit(value: string) {
  return workoutSetNoteCodePointLength(value) <= WORKOUT_SET_NOTE_MAX_CODE_POINTS;
}

export function canUpdateWorkoutSetNote(current: string, next: string) {
  return isWorkoutSetNoteWithinLimit(next)
    || workoutSetNoteCodePointLength(next) < workoutSetNoteCodePointLength(current);
}

function normalizeFreeNote(value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  if (!isWorkoutSetNoteWithinLimit(value))
    throw new Error("Workout set notes cannot exceed 4000 characters.");
  return value;
}

function normalizeTempo(value: string | null | undefined, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (Array.from(value).length > 64 || controlCharacters.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function normalizeTimestamp(value: string | null | undefined, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export function workoutSetDetailsInputToSql(
  input: WorkoutSetDetailsInput,
  defaults?: SourceDefaults,
): WorkoutSetDetailsSqlInput {
  if ((input.schemaVersion ?? 1) !== 1)
    throw new Error("Workout set detail schema version is unsupported.");
  if (!setTypes.has(input.setType))
    throw new Error("Workout set type is invalid.");
  const sideMode = input.sideMode ?? "none";
  if (!sideModes.has(sideMode))
    throw new Error("Workout set side mode is invalid.");
  const tempoAdherence = input.tempoAdherence ?? "not_recorded";
  if (!tempoAdherenceValues.has(tempoAdherence))
    throw new Error("Workout set tempo adherence is invalid.");
  const source = normalizeSource(input, defaults);
  return {
    schema_version: 1,
    set_type: input.setType,
    rpe: normalizeOneDecimal(input.rpe, 0, 10, "RPE"),
    rir: normalizeOneDecimal(input.rir, 0, 20, "RIR"),
    notes: normalizeFreeNote(input.notes),
    side_mode: sideMode,
    planned_tempo: normalizeTempo(input.plannedTempo, "Planned tempo"),
    performed_tempo: normalizeTempo(input.performedTempo, "Performed tempo"),
    tempo_adherence: tempoAdherence,
    source: source.source,
    source_provider: source.sourceProvider,
    source_version: source.sourceVersion,
  };
}

export function workoutSetSegmentsInputToSql(
  segments: WorkoutSetSegmentInput[],
  defaults?: SourceDefaults,
): WorkoutSetSegmentSqlInput[] {
  if (segments.length > 32)
    throw new Error("A workout set can contain at most 32 segments.");
  const orders = new Set<number>();
  const normalized = segments.map((segment) => {
    if (
      !Number.isInteger(segment.segmentOrder)
      || segment.segmentOrder < 1
      || segment.segmentOrder > 32
    ) {
      throw new Error("Workout set segment order is invalid.");
    }
    if (orders.has(segment.segmentOrder))
      throw new Error("Workout set segment order must be unique.");
    orders.add(segment.segmentOrder);
    if (!segmentKinds.has(segment.segmentKind))
      throw new Error("Workout set segment kind is invalid.");
    const side = segment.side ?? "none";
    if (!sideModes.has(side))
      throw new Error("Workout set segment side is invalid.");
    const source = normalizeSource(segment, defaults);
    const performanceMetrics = segment.performanceMetrics ?? [];
    if (performanceMetrics.length > 16) {
      throw new Error(
        "A workout set segment can contain at most 16 performance metrics.",
      );
    }
    const metricIdentities = new Set<string>();
    const sqlMetrics = performanceMetrics.map((metric) => {
      if ((metric.source as WorkoutPerformanceMetricSource | undefined) === "backfill") {
        throw new Error("Backfill provenance is reserved for database migrations.");
      }
      const sql = workoutPerformanceMetricInputToSql(metric, {
        source: source.source,
        sourceProvider: source.sourceProvider,
        sourceVersion: source.sourceVersion,
      });
      const identity = `${sql.metric_key}:${sql.metric_version}:${sql.side}`;
      if (metricIdentities.has(identity))
        throw new Error("Workout set segment metrics must be unique.");
      metricIdentities.add(identity);
      return sql as WorkoutSetSegmentSqlInput["performance_metrics"][number];
    }).sort((left, right) =>
      left.metric_key.localeCompare(right.metric_key)
      || left.metric_version - right.metric_version
      || left.side.localeCompare(right.side)
    );
    return {
      segment_order: segment.segmentOrder,
      segment_kind: segment.segmentKind,
      side,
      completed_at: normalizeTimestamp(
        segment.completedAt,
        "Workout set segment completion time",
      ),
      source: source.source,
      source_provider: source.sourceProvider,
      source_version: source.sourceVersion,
      performance_metrics: sqlMetrics,
    };
  });
  return normalized.sort((left, right) => left.segment_order - right.segment_order);
}
''',
)

write(
    "lib/workouts/workout-set-autosave.ts",
    r'''export type WorkoutSetAutosaveSnapshot<T> = {
  key: string;
  value: T;
};

export type WorkoutSetAutosaveController<T> = {
  schedule(snapshot: WorkoutSetAutosaveSnapshot<T>): void;
  flush(): Promise<void>;
  dispose(): void;
  pendingKey(): string | null;
};

type Options<T> = {
  save(value: T): Promise<void>;
  acknowledge(value: T): void;
  onFailure(error: unknown): void;
  debounceMs?: number;
  retryMs?: number;
};

export function createWorkoutSetAutosaveController<T>(
  options: Options<T>,
): WorkoutSetAutosaveController<T> {
  const debounceMs = options.debounceMs ?? 500;
  const retryMs = options.retryMs ?? 1500;
  let latest: WorkoutSetAutosaveSnapshot<T> | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let lastSavedKey: string | null = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const scheduleTimer = (delay: number) => {
    if (disposed || !latest) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void drain().catch(() => undefined);
    }, delay);
  };

  const drain = async (): Promise<void> => {
    if (disposed) return;
    if (inFlight) {
      await inFlight;
      if (latest) await drain();
      return;
    }
    const snapshot = latest;
    if (!snapshot || snapshot.key === lastSavedKey) {
      if (snapshot?.key === lastSavedKey) latest = null;
      return;
    }

    inFlight = (async () => {
      try {
        await options.save(snapshot.value);
        lastSavedKey = snapshot.key;
        if (latest?.key === snapshot.key) latest = null;
        options.acknowledge(snapshot.value);
      } catch (error) {
        options.onFailure(error);
        if (!latest || latest.key === snapshot.key) latest = snapshot;
        scheduleTimer(retryMs);
        throw error;
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
    if (latest) await drain();
  };

  return {
    schedule(snapshot) {
      if (disposed || snapshot.key === lastSavedKey || latest?.key === snapshot.key) return;
      latest = snapshot;
      scheduleTimer(debounceMs);
    },
    async flush() {
      clearTimer();
      await drain();
    },
    dispose() {
      disposed = true;
      clearTimer();
      latest = null;
    },
    pendingKey() {
      return latest?.key ?? null;
    },
  };
}
''',
)

write(
    "lib/workouts/workout-set-autosave.test.ts",
    r'''import { describe, expect, it, vi } from "vitest";
import { createWorkoutSetAutosaveController } from "./workout-set-autosave";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AW-3B completed-set autosave coordinator", () => {
  it("retains dirty state after failure and retries the exact snapshot", async () => {
    vi.useFakeTimers();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const acknowledge = vi.fn();
    const onFailure = vi.fn();
    const controller = createWorkoutSetAutosaveController({
      save,
      acknowledge,
      onFailure,
      debounceMs: 10,
      retryMs: 20,
    });

    controller.schedule({ key: "v1", value: { revision: 1 } });
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.pendingKey()).toBe("v1");
    expect(acknowledge).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20);
    expect(save).toHaveBeenCalledTimes(2);
    expect(acknowledge).toHaveBeenCalledWith({ revision: 1 });
    expect(controller.pendingKey()).toBeNull();
    controller.dispose();
    vi.useRealTimers();
  });

  it("does not acknowledge a newer edit when an older request succeeds", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const save = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const acknowledge = vi.fn();
    const controller = createWorkoutSetAutosaveController({
      save,
      acknowledge,
      onFailure: vi.fn(),
      debounceMs: 1000,
    });

    controller.schedule({ key: "v1", value: { revision: 1 } });
    const flushing = controller.flush();
    await Promise.resolve();
    controller.schedule({ key: "v2", value: { revision: 2 } });
    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(acknowledge).toHaveBeenCalledWith({ revision: 1 });
    expect(controller.pendingKey()).toBe("v2");
    second.resolve();
    await flushing;
    expect(acknowledge).toHaveBeenLastCalledWith({ revision: 2 });
    expect(controller.pendingKey()).toBeNull();
    controller.dispose();
  });

  it("deduplicates identical scheduled snapshots", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = createWorkoutSetAutosaveController({
      save,
      acknowledge: vi.fn(),
      onFailure: vi.fn(),
      debounceMs: 5,
    });
    controller.schedule({ key: "same", value: 1 });
    controller.schedule({ key: "same", value: 1 });
    await vi.advanceTimersByTimeAsync(5);
    expect(save).toHaveBeenCalledTimes(1);
    controller.schedule({ key: "same", value: 1 });
    await vi.advanceTimersByTimeAsync(5);
    expect(save).toHaveBeenCalledTimes(1);
    controller.dispose();
    vi.useRealTimers();
  });
});
''',
)

write(
    "services/database/workout-set-details.test.ts",
    r'''import { describe, expect, it } from "vitest";
import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  normalizeWorkoutSetDetailsRelation,
  normalizeWorkoutSetSegmentsRelation,
  validateWorkoutRirInput,
  validateWorkoutRpeInput,
  WorkoutSetRelationIntegrityError,
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
const identity = {
  exerciseLogId: "log-1",
  workoutSessionId: "session-1",
  userId: "user-1",
};
const detail = {
  exercise_log_id: "log-1",
  workout_session_id: "session-1",
  user_id: "user-1",
  schema_version: 1,
  set_type: "working",
  rpe: 8,
  rir: 2,
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
} as const;

describe("AW-3B structured workout set details", () => {
  it("accepts null, object, and exactly one detail row but fails closed on duplicates", () => {
    expect(normalizeWorkoutSetDetailsRelation(null, identity)).toBeNull();
    expect(normalizeWorkoutSetDetailsRelation(detail as never, identity)).toEqual(detail);
    expect(normalizeWorkoutSetDetailsRelation([detail] as never, identity)).toEqual(detail);
    expect(() => normalizeWorkoutSetDetailsRelation([detail, detail] as never, identity))
      .toThrow(WorkoutSetRelationIntegrityError);
  });

  it("canonicalizes shuffled segments and metrics and rejects duplicate identities", () => {
    const segment = (order: number, id: string, metrics: unknown[]) => ({
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
      metric_values: metrics,
    });
    const metric = (key: string, id: string) => ({
      id,
      segment_id: "segment-2",
      exercise_log_id: "log-1",
      workout_session_id: "session-1",
      user_id: "user-1",
      metric_key: key,
      metric_version: 1,
      side: "none",
      value: 1,
      source: "manual",
      source_provider: "plaivra",
      source_version: "aw3b-v1",
      captured_at: "2026-07-22T20:00:00.000Z",
      created_at: "2026-07-22T20:00:00.000Z",
      updated_at: "2026-07-22T20:00:00.000Z",
    });
    const rows = normalizeWorkoutSetSegmentsRelation([
      segment(2, "segment-2", [metric("repetitions", "m2"), metric("external_load_kg", "m1")]),
      segment(1, "segment-1", []),
    ] as never, identity);
    expect(rows.map((row) => row.segment_order)).toEqual([1, 2]);
    expect(rows[1]?.metric_values?.map((row) => row.metric_key)).toEqual([
      "external_load_kg",
      "repetitions",
    ]);
    expect(() => normalizeWorkoutSetSegmentsRelation([
      segment(1, "segment-1", []), segment(1, "segment-2", []),
    ] as never, identity)).toThrow(/duplicate segment order/i);
    expect(() => normalizeWorkoutSetSegmentsRelation([
      segment(2, "segment-2", [metric("repetitions", "m1"), metric("repetitions", "m2")]),
    ] as never, identity)).toThrow(/duplicate metric identity/i);
  });

  it("rejects malformed ownership paths", () => {
    expect(() => normalizeWorkoutSetDetailsRelation({ ...detail, user_id: "other" } as never, identity))
      .toThrow(/ownership/i);
    expect(() => normalizeWorkoutSetSegmentsRelation({
      id: "segment-1",
      exercise_log_id: "other-log",
      workout_session_id: "session-1",
      user_id: "user-1",
      segment_order: 1,
      metric_values: [],
    } as never, identity)).toThrow(/ownership/i);
  });

  it("reattributes every browser-authored structured edit to manual Plaivra provenance", () => {
    for (const source of ["manual", "chatgpt", "device", "import", "backfill"] as const) {
      expect(editableWorkoutSetProvenance(source, "old.provider", "v9")).toEqual({
        source: "manual",
        sourceProvider: "plaivra",
        sourceVersion: "aw3b-v1",
      });
    }
  });

  it("validates raw RPE and RIR before persistence without rounding", () => {
    expect(validateWorkoutRpeInput("")).toEqual({ valid: true, value: null });
    expect(validateWorkoutRpeInput("8.5")).toEqual({ valid: true, value: 8.5 });
    expect(validateWorkoutRpeInput("8.25")).toEqual({ valid: false, reason: "precision" });
    expect(validateWorkoutRpeInput("10.1")).toEqual({ valid: false, reason: "range" });
    expect(validateWorkoutRirInput("20.0")).toEqual({ valid: true, value: 20 });
    expect(validateWorkoutRirInput("1.25")).toEqual({ valid: false, reason: "precision" });
    expect(validateWorkoutRirInput("not-a-number")).toEqual({ valid: false, reason: "format" });
  });

  it("normalizes the complete bounded v1 detail contract", () => {
    expect(workoutSetDetailsInputToSql({
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
    })).toMatchObject({
      set_type: "backoff",
      rpe: 8.5,
      rir: 1.5,
      notes: "Controlled effort",
      side_mode: "alternating",
      source: "manual",
    });
    expect(() => workoutSetDetailsInputToSql({ setType: "working", rpe: 8.25 })).toThrow(/RPE/);
    expect(() => workoutSetDetailsInputToSql({ setType: "working", source: "device" })).toThrow(/provider/i);
  });

  it("bounds Unicode notes and reserved runtime provenance", () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(workoutSetDetailsInputToSql({ setType: "working", notes: emoji.repeat(4000) }).notes)
      .toBe(emoji.repeat(4000));
    expect(() => workoutSetDetailsInputToSql({ setType: "working", notes: emoji.repeat(4001) }))
      .toThrow(/4000/);
    expect(canUpdateWorkoutSetNote(emoji.repeat(4001), emoji.repeat(4000))).toBe(true);
    expect(() => workoutSetDetailsInputToSql({ setType: "working", source: "backfill" as never }))
      .toThrow(/reserved/i);
  });

  it("sorts outgoing exact replacements and rejects duplicate segment identities", () => {
    const segments = workoutSetSegmentsInputToSql([
      {
        segmentOrder: 2,
        segmentKind: "drop",
        performanceMetrics: [
          { metricKey: "repetitions", value: 6 },
          { metricKey: "external_load_kg", value: 15 },
        ],
      },
      { segmentOrder: 1, segmentKind: "primary", performanceMetrics: [] },
    ]);
    expect(segments.map((row) => row.segment_order)).toEqual([1, 2]);
    expect(segments[1]?.performance_metrics.map((row) => row.metric_key)).toEqual([
      "external_load_kg",
      "repetitions",
    ]);
    expect(() => workoutSetSegmentsInputToSql([
      { segmentOrder: 1, segmentKind: "primary" },
      { segmentOrder: 1, segmentKind: "drop" },
    ])).toThrow(/unique/i);
  });

  it("preserves omission and serializes explicit clear and replacement intent", () => {
    const [omitted] = serializeWorkoutSetLogs([{ ...baseLog, notes: "Free note" }]);
    expect(omitted).not.toHaveProperty("set_details");
    expect(omitted).not.toHaveProperty("segments");

    const [cleared] = serializeWorkoutSetLogs([{ ...baseLog, setDetails: null, segments: [] }]);
    expect(cleared).toHaveProperty("set_details", null);
    expect(cleared).toHaveProperty("segments", []);

    const [replaced] = serializeWorkoutSetLogs([{
      ...baseLog,
      setDetails: { setType: "drop", notes: null },
      segments: [{ segmentOrder: 2, segmentKind: "drop" }, { segmentOrder: 1, segmentKind: "primary" }],
    }]);
    expect(replaced.segments?.map((row) => row.segment_order)).toEqual([1, 2]);
    expect(replaced.segments?.[0]).toHaveProperty("performance_metrics", []);
  });
});
''',
)

# Session read authority: include the owner identity in fail-closed normalization.
replace_once(
    "services/database/workout-sessions.ts",
    '''export async function getWorkoutSessionLogs(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) throw new Error("Database not connected");
  const { data, error } = await supabase!
''',
    '''export async function getWorkoutSessionLogs(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) throw new Error("Database not connected");
  const session = await getWorkoutSessionIdentity(sessionId);
  const { data, error } = await supabase!
''',
)
replace_once(
    "services/database/workout-sessions.ts",
    '''    set_details: normalizeWorkoutSetDetailsRelation(log.set_details),
    segments: normalizeWorkoutSetSegmentsRelation(log.segments)
''',
    '''    set_details: normalizeWorkoutSetDetailsRelation(log.set_details, {
      exerciseLogId: log.id,
      workoutSessionId: sessionId,
      userId: session.user_id
    }),
    segments: normalizeWorkoutSetSegmentsRelation(log.segments, {
      exerciseLogId: log.id,
      workoutSessionId: sessionId,
      userId: session.user_id
    })
''',
)

write(
    "lib/privacy/data-export.ts",
    r'''import type { SupabaseClient, User } from "@supabase/supabase-js";

export * from "./data-export-legacy";

import { buildCurrentUserDataExport as buildLegacyCurrentUserDataExport } from "./data-export-legacy";

const exportPageSize = 1000;
const performanceMetricSelection = "id,exercise_log_id,workout_session_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";
const timelineSelection = "id,workout_session_id,sequence_number,event_type,occurred_at,source,exercise_log_id,snapshot_item_id,payload_version,payload,created_at";
const setDetailSelection = "exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,side_mode,planned_tempo,performed_tempo,tempo_adherence,source,source_provider,source_version,created_at,updated_at";
const setSegmentSelection = "id,exercise_log_id,workout_session_id,user_id,segment_order,segment_kind,side,completed_at,source,source_provider,source_version,created_at,updated_at";
const setSegmentMetricSelection = "id,segment_id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,source,source_provider,source_version,captured_at,created_at,updated_at";

async function loadAllOwnedRows(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  selection: string,
  orderColumns: string[],
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += exportPageSize) {
    let query = supabase.from(table).select(selection).eq("user_id", userId);
    for (const column of orderColumns) {
      query = query.order(column, { ascending: true });
    }
    const page = await query.range(from, from + exportPageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < exportPageSize) return { data: rows, error: null };
  }
}

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">,
) {
  const result = await buildLegacyCurrentUserDataExport(supabase, user);
  const [timelineResult, performanceMetricResult, setDetailResult, setSegmentResult, setSegmentMetricResult] = await Promise.all([
    loadAllOwnedRows(
      supabase,
      user.id,
      "workout_session_timeline_events",
      timelineSelection,
      ["workout_session_id", "sequence_number", "id"],
    ),
    loadAllOwnedRows(
      supabase,
      user.id,
      "exercise_log_metric_values",
      performanceMetricSelection,
      ["captured_at", "id"],
    ),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_details", setDetailSelection, ["exercise_log_id"]),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segments", setSegmentSelection, ["exercise_log_id", "segment_order", "id"]),
    loadAllOwnedRows(supabase, user.id, "exercise_log_set_segment_metric_values", setSegmentMetricSelection, ["exercise_log_id", "segment_id", "metric_key", "metric_version", "side", "id"]),
  ]);

  if (timelineResult.error) {
    result.warnings.push("Workout session timeline events could not be included in this export.");
  }
  if (performanceMetricResult.error) {
    result.warnings.push("Workout performance metric values could not be included in this export.");
  }
  if (setDetailResult.error) result.warnings.push("Workout set details could not be included in this export.");
  if (setSegmentResult.error) result.warnings.push("Workout set segments could not be included in this export.");
  if (setSegmentMetricResult.error) result.warnings.push("Workout set segment metrics could not be included in this export.");

  const workouts = result.data.workouts as Record<string, unknown>;
  workouts.timeline_events = timelineResult.data ?? [];
  workouts.performance_metric_values = performanceMetricResult.data ?? [];
  workouts.set_details = setDetailResult.data ?? [];
  workouts.set_segments = setSegmentResult.data ?? [];
  workouts.set_segment_metric_values = setSegmentMetricResult.data ?? [];
  return result;
}
''',
)

# Extend the privacy mock to generate and verify every timeline page.
privacy = read("lib/privacy/data-export.test.ts")
privacy = privacy.replace(
    "function exportSupabaseMock(metricRowCount = 1) {",
    "function exportSupabaseMock(metricRowCount = 1, timelineRowCount = 1) {",
    1,
)
privacy = privacy.replace(
    '''      if (table === "exercise_log_metric_values") {
''',
    '''      if (table === "workout_session_timeline_events") {
        const [start, requestedEnd] = call.range ?? [0, timelineRowCount - 1];
        const end = Math.min(requestedEnd, timelineRowCount - 1);
        const length = Math.max(0, end - start + 1);
        return {
          data: Array.from({ length }, (_, offset) => {
            const index = start + offset;
            const sessionIndex = Math.floor(index / 2500);
            return {
              id: `timeline-${String(index).padStart(5, "0")}`,
              workout_session_id: `session-${String(sessionIndex).padStart(2, "0")}`,
              sequence_number: index % 2500,
              event_type: "set_edited",
              occurred_at: "2026-07-22T10:00:00.000Z",
              source: "runtime",
              exercise_log_id: null,
              snapshot_item_id: null,
              payload_version: 1,
              payload: {},
              created_at: "2026-07-22T10:00:00.000Z"
            };
          }),
          error: null
        };
      }
      if (table === "exercise_log_metric_values") {
''',
    1,
)
privacy = privacy.replace(
    '''  it("exports every performance metric row with deterministic pagination beyond 8000 rows", async () => {
''',
    '''  it("exports every timeline row with a stable cross-session order beyond 5000 rows", async () => {
    const { client, calls } = exportSupabaseMock(1, 5005);
    const payload = await buildCurrentUserDataExport(client, {
      id: userA,
      email: "a@example.test",
      created_at: "2026-01-01T00:00:00.000Z"
    });

    const workouts = payload.data.workouts as { timeline_events: Array<{ id: string }> };
    expect(workouts.timeline_events).toHaveLength(5005);
    expect(new Set(workouts.timeline_events.map((row) => row.id)).size).toBe(5005);
    const timelineCalls = calls.filter((call) => call.table === "workout_session_timeline_events");
    expect(timelineCalls.map((call) => call.range)).toEqual([
      [0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999], [5000, 5999]
    ]);
    expect(timelineCalls.every((call) => call.orders.join(",") === "workout_session_id,sequence_number,id")).toBe(true);
    expect(timelineCalls.every((call) => call.selection?.startsWith("id,workout_session_id"))).toBe(true);
  });

  it("exports every performance metric row with deterministic pagination beyond 8000 rows", async () => {
''',
    1,
)
write("lib/privacy/data-export.test.ts", privacy)

# Add localized early validation messages.
message_values = {
    "en": {
        "rpeValidation": "Enter an RPE from 0.0 to 10.0 with at most one decimal place.",
        "rirValidation": "Enter an RIR from 0.0 to 20.0 with at most one decimal place.",
    },
    "de": {
        "rpeValidation": "Gib einen RPE-Wert von 0,0 bis 10,0 mit höchstens einer Dezimalstelle ein.",
        "rirValidation": "Gib einen RIR-Wert von 0,0 bis 20,0 mit höchstens einer Dezimalstelle ein.",
    },
    "ar": {
        "rpeValidation": "أدخل قيمة RPE من 0.0 إلى 10.0 وبحد أقصى منزلة عشرية واحدة.",
        "rirValidation": "أدخل قيمة RIR من 0.0 إلى 20.0 وبحد أقصى منزلة عشرية واحدة.",
    },
}
for locale, values in message_values.items():
    path = ROOT / f"messages/{locale}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["ActiveWorkout"]["set"].update(values)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Include autosave behavioral coverage in the focused command.
replace_once(
    "package.json",
    'services/database/workout-set-details.test.ts services/database/workout-performance.test.ts',
    'services/database/workout-set-details.test.ts lib/workouts/workout-set-autosave.test.ts services/database/workout-performance.test.ts',
)

# Component: actor-bound provenance, early validation, exact-snapshot autosave, and flushes.
component_path = "components/workouts/workout-day-focus-session.tsx"
component = read(component_path)
component = component.replace(
    '''import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  WORKOUT_SET_NOTE_MAX_CODE_POINTS,
  workoutSetNoteCodePointLength
} from "@/services/database/workout-set-details";
''',
    '''import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  validateWorkoutRirInput,
  validateWorkoutRpeInput,
  workoutSetDecimalInputToNumber,
  WORKOUT_SET_NOTE_MAX_CODE_POINTS,
  workoutSetNoteCodePointLength
} from "@/services/database/workout-set-details";
import {
  createWorkoutSetAutosaveController,
  type WorkoutSetAutosaveController
} from "@/lib/workouts/workout-set-autosave";
import type { WorkoutSetLogInput } from "@/services/database/workout-sessions";
''',
    1,
)
component = component.replace(
    '''type ExerciseState = {
  exercise: UserWorkoutPlanExercise;
  sets: SetState[];
};
''',
    '''type ExerciseState = {
  exercise: UserWorkoutPlanExercise;
  sets: SetState[];
};

type SetAutosaveSnapshot = {
  sessionId: string;
  states: ExerciseState[];
  rows: WorkoutSetLogInput[];
  durationMinutes: number;
};

function validateSetDetails(set: SetState) {
  return {
    rpe: validateWorkoutRpeInput(set.rpe),
    rir: validateWorkoutRirInput(set.rir)
  };
}

function firstInvalidCompletedSet(states: ExerciseState[]) {
  for (let exerciseIndex = 0; exerciseIndex < states.length; exerciseIndex += 1) {
    const sets = states[exerciseIndex]?.sets ?? [];
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const set = sets[setIndex];
      if (!set?.completedAt) continue;
      const validation = validateSetDetails(set);
      if (!validation.rpe.valid || !validation.rir.valid) {
        return { exerciseIndex, setIndex };
      }
    }
  }
  return null;
}
''',
    1,
)
component = component.replace(
    '''  const nextPatch = provenance && set.detailSource === "backfill"
    ? {
        ...patch,
        detailSource: provenance.source,
        detailSourceProvider: provenance.sourceProvider,
        detailSourceVersion: provenance.sourceVersion
      }
    : patch;
''',
    '''  const nextPatch = provenance
    ? {
        ...patch,
        detailSource: provenance.source,
        detailSourceProvider: provenance.sourceProvider,
        detailSourceVersion: provenance.sourceVersion
      }
    : patch;
''',
    1,
)
component = component.replace(
    '''  const setDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
''',
    '''  const setDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const setAutosaveRef = useRef<WorkoutSetAutosaveController<SetAutosaveSnapshot> | null>(null);
''',
    1,
)
old_build = '''  function buildLogRows(
    states = exerciseStates,
    options: { pendingOnly?: boolean } = {}
  ) {
    return states.flatMap((item, exerciseIndex) =>
      item.sets
        .filter((set) => options.pendingOnly
          ? isPendingSetWrite(set)
          : Boolean(set.completedAt))
        .map((set) => {
          const includeSetDetails = set.setDetailsWriteRequired;
          const detailProvenance = editableWorkoutSetProvenance(
            set.detailSource,
            set.detailSourceProvider,
            set.detailSourceVersion
          );
          return {
            planExerciseId: item.exercise.id,
            exerciseOrder: exerciseIndex + 1,
            exerciseName: item.exercise.exercise_name,
            exerciseCategory: item.exercise.category || item.exercise.target_muscle || item.exercise.equipment || "Workout",
            plannedSets: item.exercise.sets ?? item.sets.length,
            plannedReps: item.exercise.reps,
            plannedRestSeconds: item.exercise.rest_seconds,
            setNumber: set.setNumber,
            reps: toNumberOrNull(set.reps),
            weightKg: toNumberOrNull(set.weightKg),
            notes: set.notes || null,
            ...(includeSetDetails ? {
              setDetails: {
                schemaVersion: 1 as const,
                setType: set.setType,
                rpe: toNumberOrNull(set.rpe),
                rir: toNumberOrNull(set.rir),
                notes: set.notes || null,
                sideMode: set.sideMode,
                plannedTempo: set.plannedTempo,
                performedTempo: set.performedTempo,
                tempoAdherence: set.tempoAdherence,
                source: detailProvenance.source,
                sourceProvider: detailProvenance.sourceProvider,
                sourceVersion: detailProvenance.sourceVersion
              }
            } : {}),
            completedAt: set.completedAt
          };
        })
    );
  }
'''
new_build = '''  function buildLogRows(
    states = exerciseStates,
    options: { pendingOnly?: boolean; validOnly?: boolean } = {}
  ): WorkoutSetLogInput[] {
    const rows: WorkoutSetLogInput[] = [];
    states.forEach((item, exerciseIndex) => {
      item.sets.forEach((set) => {
        const selected = options.pendingOnly
          ? isPendingSetWrite(set)
          : Boolean(set.completedAt);
        if (!selected) return;
        const validation = validateSetDetails(set);
        if (!validation.rpe.valid || !validation.rir.valid) {
          if (options.validOnly) return;
          throw new Error(!validation.rpe.valid ? tr("set.rpeValidation") : tr("set.rirValidation"));
        }
        const includeSetDetails = set.setDetailsWriteRequired;
        const detailProvenance = editableWorkoutSetProvenance(
          set.detailSource,
          set.detailSourceProvider,
          set.detailSourceVersion
        );
        rows.push({
          planExerciseId: item.exercise.id,
          exerciseOrder: exerciseIndex + 1,
          exerciseName: item.exercise.exercise_name,
          exerciseCategory: item.exercise.category || item.exercise.target_muscle || item.exercise.equipment || "Workout",
          plannedSets: item.exercise.sets ?? item.sets.length,
          plannedReps: item.exercise.reps,
          plannedRestSeconds: item.exercise.rest_seconds,
          setNumber: set.setNumber,
          reps: toNumberOrNull(set.reps),
          weightKg: toNumberOrNull(set.weightKg),
          notes: set.notes || null,
          ...(includeSetDetails ? {
            setDetails: {
              schemaVersion: 1 as const,
              setType: set.setType,
              rpe: workoutSetDecimalInputToNumber(set.rpe, 0, 10, "RPE"),
              rir: workoutSetDecimalInputToNumber(set.rir, 0, 20, "RIR"),
              notes: set.notes || null,
              sideMode: set.sideMode,
              plannedTempo: set.plannedTempo,
              performedTempo: set.performedTempo,
              tempoAdherence: set.tempoAdherence,
              source: detailProvenance.source,
              sourceProvider: detailProvenance.sourceProvider,
              sourceVersion: detailProvenance.sourceVersion
            }
          } : {}),
          completedAt: set.completedAt
        });
      });
    });
    return rows;
  }
'''
if component.count(old_build) != 1:
    raise RuntimeError("Could not replace component buildLogRows")
component = component.replace(old_build, new_build, 1)
component = component.replace(
    '''  async function persistProgress(states = exerciseStates) {
    if (!session) return;
    await saveWorkoutSetLogs(session.id, buildLogRows(states, { pendingOnly: true }));
    await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil(elapsedSeconds / 60)));
    setExerciseStates((current) => acknowledgeSetWrites(current, states));
  }

  function startRestTimer(seconds: number) {
''',
    '''  async function persistProgress(states = exerciseStates) {
    if (!session) return;
    await saveWorkoutSetLogs(session.id, buildLogRows(states, { pendingOnly: true }));
    await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil(elapsedSeconds / 60)));
    setExerciseStates((current) => acknowledgeSetWrites(current, states));
  }

  useEffect(() => {
    setAutosaveRef.current?.dispose();
    setAutosaveRef.current = null;
    if (!session?.id) return;
    const controller = createWorkoutSetAutosaveController<SetAutosaveSnapshot>({
      save: async (snapshot) => {
        if (!snapshot.rows.length) return;
        await saveWorkoutSetLogs(snapshot.sessionId, snapshot.rows);
        await updateWorkoutSessionDuration(snapshot.sessionId, snapshot.durationMinutes);
      },
      acknowledge: (snapshot) => {
        setExerciseStates((current) => acknowledgeSetWrites(current, snapshot.states));
      },
      onFailure: (error) => {
        console.warn("Plaivra retained a pending completed-set detail edit for automatic retry.", error);
      },
      debounceMs: 500,
      retryMs: 1500
    });
    setAutosaveRef.current = controller;
    return () => {
      controller.dispose();
      if (setAutosaveRef.current === controller) setAutosaveRef.current = null;
    };
  }, [session?.id]);

  useEffect(() => {
    if (!session?.id || !executionHydratedRef.current) return;
    const rows = buildLogRows(exerciseStates, { pendingOnly: true, validOnly: true });
    if (!rows.length) return;
    setAutosaveRef.current?.schedule({
      key: JSON.stringify(rows),
      value: {
        sessionId: session.id,
        states: exerciseStates,
        rows,
        durationMinutes: Math.max(1, Math.ceil(elapsedSeconds / 60))
      }
    });
  }, [elapsedSeconds, exerciseStates, session?.id]);

  async function flushSetAutosave() {
    try {
      await setAutosaveRef.current?.flush();
    } catch {
      // Dirty state remains queued and the hidden retry authority stays active.
    }
  }

  function handleActionsOpenChange(open: boolean) {
    setActionsOpen(open);
    if (!open) void flushSetAutosave();
  }

  async function navigateToExercise(index: number) {
    await flushSetAutosave();
    const item = exerciseStates[index];
    if (!item) return;
    setActiveExerciseIndex(index);
    const firstOpen = item.sets.findIndex((set) => !set.completedAt);
    setActiveSetIndex(firstOpen >= 0 ? firstOpen : item.sets.length - 1);
    setTimerSeconds(item.exercise.rest_seconds ?? 75);
  }

  async function navigateToSet(setIndex: number) {
    await flushSetAutosave();
    setActiveSetIndex(setIndex);
  }

  function startRestTimer(seconds: number) {
''',
    1,
)
component = component.replace(
    '''    const previousStates = exerciseStates;
''',
    '''    const detailValidation = validateSetDetails(targetSet);
    if (!detailValidation.rpe.valid || !detailValidation.rir.valid) {
      setActiveExerciseIndex(exerciseIndex);
      setActiveSetIndex(setIndex);
      setActionsOpen(true);
      return;
    }

    const previousStates = exerciseStates;
''',
    1,
)
component = component.replace(
    '''  function openSessionReview() {
    if (isStarting || !session?.id || !executionHydratedRef.current) return;
    setFinishOpen(true);
''',
    '''  async function openSessionReview() {
    if (isStarting || !session?.id || !executionHydratedRef.current) return;
    await flushSetAutosave();
    setFinishOpen(true);
''',
    1,
)
component = component.replace(
    '''  async function completeSession() {
    if (!session || isSaving || isStarting || !executionHydratedRef.current) return;
    try {
''',
    '''  async function completeSession() {
    if (!session || isSaving || isStarting || !executionHydratedRef.current) return;
    const invalid = firstInvalidCompletedSet(exerciseStates);
    if (invalid) {
      setActiveExerciseIndex(invalid.exerciseIndex);
      setActiveSetIndex(invalid.setIndex);
      setActionsOpen(true);
      return;
    }
    await flushSetAutosave();
    try {
''',
    1,
)
component = component.replace(
    '''  const activeSet = activeExercise?.sets[activeSetIndex];
''',
    '''  const activeSet = activeExercise?.sets[activeSetIndex];
  const activeRpeValidation = activeSet ? validateWorkoutRpeInput(activeSet.rpe) : { valid: true as const, value: null };
  const activeRirValidation = activeSet ? validateWorkoutRirInput(activeSet.rir) : { valid: true as const, value: null };
  const activeRpeError = activeRpeValidation.valid ? null : tr("set.rpeValidation");
  const activeRirError = activeRirValidation.valid ? null : tr("set.rirValidation");
''',
    1,
)
component = component.replace(
    '''              onClick={() => {
                setActiveExerciseIndex(index);
                const firstOpen = item.sets.findIndex((set) => !set.completedAt);
                setActiveSetIndex(firstOpen >= 0 ? firstOpen : item.sets.length - 1);
                setTimerSeconds(item.exercise.rest_seconds ?? 75);
              }}
''',
    '''              onClick={() => { void navigateToExercise(index); }}
''',
    1,
)
component = component.replace(
    '''                <Button className="mt-4 min-h-12 rounded-[18px]" onClick={() => { setActiveExerciseIndex(activeExerciseIndex + 1); setActiveSetIndex(0); setTimerSeconds(nextExercise.exercise.rest_seconds ?? 75); }} disabled={isSaving || isStarting}>
''',
    '''                <Button className="mt-4 min-h-12 rounded-[18px]" onClick={() => { void navigateToExercise(activeExerciseIndex + 1); }} disabled={isSaving || isStarting}>
''',
    1,
)
component = component.replace(
    '''                      onClick={() => setActiveSetIndex(setIndex)}
''',
    '''                      onClick={() => { void navigateToSet(setIndex); }}
''',
    1,
)
component = component.replace(
    '''      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
''',
    '''      <Dialog open={actionsOpen} onOpenChange={handleActionsOpenChange}>
''',
    1,
)
component = component.replace(
    '''                  <div className="space-y-1"><Label htmlFor="active-set-rpe" className="text-xs">RPE</Label><Input id="active-set-rpe" className="h-12 tabular-nums" dir="ltr" type="number" min="0" max="10" step="0.1" value={activeSet.rpe} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" disabled={isSaving || isStarting} /></div>
                  <div className="space-y-1"><Label htmlFor="active-set-rir" className="text-xs">RIR</Label><Input id="active-set-rir" className="h-12 tabular-nums" dir="ltr" type="number" min="0" max="20" step="0.1" value={activeSet.rir} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rir: event.target.value })} inputMode="decimal" placeholder="2" disabled={isSaving || isStarting} /></div>
''',
    '''                  <div className="space-y-1">
                    <Label htmlFor="active-set-rpe" className="text-xs">RPE</Label>
                    <Input id="active-set-rpe" className="h-12 tabular-nums" dir="ltr" type="text" value={activeSet.rpe} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" disabled={isSaving || isStarting} aria-invalid={Boolean(activeRpeError)} aria-describedby={activeRpeError ? "active-set-rpe-error" : undefined} />
                    {activeRpeError ? <p id="active-set-rpe-error" role="alert" className="text-xs text-destructive">{activeRpeError}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="active-set-rir" className="text-xs">RIR</Label>
                    <Input id="active-set-rir" className="h-12 tabular-nums" dir="ltr" type="text" value={activeSet.rir} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rir: event.target.value })} inputMode="decimal" placeholder="2" disabled={isSaving || isStarting} aria-invalid={Boolean(activeRirError)} aria-describedby={activeRirError ? "active-set-rir-error" : undefined} />
                    {activeRirError ? <p id="active-set-rir-error" role="alert" className="text-xs text-destructive">{activeRirError}</p> : null}
                  </div>
''',
    1,
)
component = component.replace(
    '''                  <Button type="button" className="min-h-12" onClick={() => { setActionsOpen(false); setReplacementPickerOpen(true); }} disabled={isSavingAlternative}>{isSavingAlternative ? tr("common.saving") : tr("actions.useToday")}</Button>
''',
    '''                  <Button type="button" className="min-h-12" onClick={() => { handleActionsOpenChange(false); setReplacementPickerOpen(true); }} disabled={isSavingAlternative}>{isSavingAlternative ? tr("common.saving") : tr("actions.useToday")}</Button>
''',
    1,
)
# Promise-returning review handler should be invoked deliberately from event callbacks.
component = component.replace('onClick={openSessionReview}', 'onClick={() => { void openSessionReview(); }}')
write(component_path, component)

# Migration: always release timeline deferral if the inner authority raises and is caught by a caller.
migration_path = "supabase/migrations/20260724003000_active_workout_aw3b_final_logic_hardening.sql"
replace_once(
    migration_path,
    '''  PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'on', true);
  v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(p_user_id, p_session_id, v_canonical_logs);
  PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
''',
    '''  BEGIN
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'on', true);
    v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(p_user_id, p_session_id, v_canonical_logs);
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);
    RAISE;
  END;
''',
)

# Existing integration assertion follows the new bounded structured summary.
replace_once(
    "supabase/verification/active-workout-aw3b-integration.sql",
    '''    where exercise_log_id=v_log.id and event_type='set_edited'
      and payload->>'rpeChanged'='true' and payload->>'segmentCount'='2'
      and payload::text not like '%Free note only%'
''',
    '''    where exercise_log_id=v_log.id and event_type='set_edited'
      and payload->'changedFields' ? 'structuredSetDetails'
      and payload->'structuredSet'->>'segmentCount'='2'
      and payload::text not like '%Free note only%'
''',
)

write(
    "supabase/verification/active-workout-aw3b-final-hardening.sql",
    r'''begin;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
('b3f00000-0000-4000-8000-000000000001','authenticated','authenticated','aw3b-final-a@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false),
('b3f00000-0000-4000-8000-000000000002','authenticated','authenticated','aw3b-final-b@plaivra.invalid','',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);

insert into public.profiles(id,email,full_name,role) values
('b3f00000-0000-4000-8000-000000000001','aw3b-final-a@plaivra.invalid','AW-3B Final A','member'),
('b3f00000-0000-4000-8000-000000000002','aw3b-final-b@plaivra.invalid','AW-3B Final B','member')
on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select set_config(
  'plaivra.aw3b_final_session_id',
  public.start_or_resume_direct_workout_session_atomic(
    'b3f00000-0000-4000-8000-000000000001',
    'provider_activity','aw3b-final-logic-hardening','plaivra_aw3b_verification',
    'AW-3B Final Hardening','Verification','{"sets":2}'::jsonb,null
  )->'session'->>'id',true
);

select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',
  current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',1,
    'reps',8,'weight_kg',50,'metric_source','chatgpt','metric_source_provider','openai',
    'notes','PRIVATE-AW3B-NOTE-ALPHA','completed_at','2026-07-23T20:00:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',9,'rir',0,'notes','PRIVATE-AW3B-NOTE-ALPHA',
      'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
      'tempo_adherence','adhered','source','chatgpt','source_version','model-v1'
    ),
    'segments',jsonb_build_array(jsonb_build_object(
      'segment_order',1,'segment_kind','primary','side','bilateral','completed_at','2026-07-23T20:00:00Z',
      'source','chatgpt','source_version','model-v1','performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','repetitions','value',8,'source','chatgpt','captured_at','2026-07-23T20:00:00Z'),
        jsonb_build_object('metric_key','external_load_kg','value',50,'source','chatgpt','captured_at','2026-07-23T20:00:00Z')
      )
    ))
  ))
);

reset role;

do $verify_initial_structured_completion$
declare
  v_log_id uuid;
  v_note_hash text;
begin
  select id into strict v_log_id from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid
    and exercise_order=1 and set_number=1;
  select encode(extensions.digest(convert_to('PRIVATE-AW3B-NOTE-ALPHA','UTF8'),'sha256'),'hex') into v_note_hash;
  if (select count(*) from public.workout_session_timeline_events
      where exercise_log_id=v_log_id and event_type='set_completed')<>1 then
    raise exception 'AW-3B initial completion did not emit exactly one event.';
  end if;
  if not exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_log_id and event_type='set_completed'
      and payload->'structuredSet'->>'schemaVersion'='1'
      and payload->'structuredSet'->'detail'->>'source'='chatgpt'
      and payload->'structuredSet'->>'segmentCount'='1'
      and payload->'structuredSet'->>'segmentMetricCount'='2'
  ) then raise exception 'AW-3B initial completion lacks bounded structured evidence.'; end if;
  if exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_log_id
      and (payload::text like '%PRIVATE-AW3B-NOTE-ALPHA%'
        or idempotency_key like '%'||v_note_hash||'%'
        or payload::text like '%'||v_note_hash||'%')
  ) then raise exception 'AW-3B timeline leaked raw note text or its direct digest.'; end if;
  if (select source from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'chatgpt'
     or (select source_provider from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'openai' then
    raise exception 'Trusted ChatGPT provenance defaults were not preserved.';
  end if;
end
$verify_initial_structured_completion$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3f00000-0000-4000-8000-000000000001',true);

-- An unchanged graph preserves existing trusted provenance even if an authenticated
-- caller supplies a spoofed source. The database compares semantic content.
select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',
  current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',1,
    'reps',8,'weight_kg',50,'metric_source','chatgpt','metric_source_provider','openai',
    'notes','PRIVATE-AW3B-NOTE-ALPHA','completed_at','2026-07-23T20:00:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',9,'rir',0,'notes','PRIVATE-AW3B-NOTE-ALPHA',
      'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
      'tempo_adherence','adhered','source','import','source_provider','spoof.vendor'
    ),
    'segments',jsonb_build_array(jsonb_build_object(
      'segment_order',1,'segment_kind','primary','side','bilateral','completed_at','2026-07-23T20:00:00Z',
      'source','device','source_provider','spoof.vendor','performance_metrics',jsonb_build_array(
        jsonb_build_object('metric_key','external_load_kg','value',50,'source','import','source_provider','spoof.vendor'),
        jsonb_build_object('metric_key','repetitions','value',8,'source','device','source_provider','spoof.vendor')
      )
    ))
  ))
);

reset role;

do $verify_unchanged_provenance$
declare v_log_id uuid;
begin
  select id into strict v_log_id from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid
    and exercise_order=1 and set_number=1;
  if (select source from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'chatgpt'
     or (select source_provider from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'openai'
     or exists (select 1 from public.exercise_log_set_segments where exercise_log_id=v_log_id and source<>'chatgpt')
     or exists (select 1 from public.exercise_log_set_segment_metric_values where exercise_log_id=v_log_id and source<>'chatgpt') then
    raise exception 'Authenticated unchanged graph rewrote trusted provenance.';
  end if;
  if (select count(*) from public.workout_session_timeline_events
      where exercise_log_id=v_log_id and event_type='set_edited')<>0 then
    raise exception 'Authenticated unchanged graph emitted a noisy edit event.';
  end if;
end
$verify_unchanged_provenance$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3f00000-0000-4000-8000-000000000001',true);

-- A changed browser detail is always manual Plaivra provenance, regardless of spoofed JSON.
select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',
  current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',1,
    'reps',8,'weight_kg',50,'metric_source','chatgpt','metric_source_provider','openai',
    'notes','PRIVATE-AW3B-NOTE-ALPHA','completed_at','2026-07-23T20:00:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',8.5,'rir',0,'notes','PRIVATE-AW3B-NOTE-ALPHA',
      'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
      'tempo_adherence','adhered','source','device','source_provider','spoof.vendor'
    )
  ))
);

reset role;

do $verify_manual_transition$
declare v_log_id uuid;
begin
  select id into strict v_log_id from public.exercise_logs
  where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid
    and exercise_order=1 and set_number=1;
  if (select source from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'manual'
     or (select source_provider from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'plaivra'
     or (select source_version from public.exercise_log_set_details where exercise_log_id=v_log_id)<>'aw3b-v1' then
    raise exception 'Changed browser detail retained spoofed machine provenance.';
  end if;
end
$verify_manual_transition$;

create temporary table aw3b_note_event_baseline on commit drop as
select l.id as exercise_log_id,
       (select count(*) from public.workout_session_timeline_events e where e.exercise_log_id=l.id and e.event_type='set_edited') as event_count
from public.exercise_logs l
where l.workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid
  and l.exercise_order=1 and l.set_number=1;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3f00000-0000-4000-8000-000000000001',true);

select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',1,
    'reps',8,'weight_kg',50,'metric_source','chatgpt','metric_source_provider','openai',
    'notes','PRIVATE-AW3B-NOTE-BETA','completed_at','2026-07-23T20:00:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',8.5,'rir',0,'notes','PRIVATE-AW3B-NOTE-BETA',
      'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
      'tempo_adherence','adhered','source','chatgpt'
    )
  ))
);
select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',1,
    'reps',8,'weight_kg',50,'metric_source','chatgpt','metric_source_provider','openai',
    'notes','PRIVATE-AW3B-NOTE-BETA','completed_at','2026-07-23T20:00:00Z',
    'set_details',jsonb_build_object(
      'set_type','drop','rpe',8.5,'rir',0,'notes','PRIVATE-AW3B-NOTE-BETA',
      'side_mode','bilateral','planned_tempo','3-1-1-0','performed_tempo','3-1-1-0',
      'tempo_adherence','adhered','source','manual','source_provider','plaivra','source_version','aw3b-v1'
    )
  ))
);

reset role;

do $verify_note_privacy_and_retry$
declare
  v_baseline aw3b_note_event_baseline%rowtype;
  v_note_hash text;
begin
  select * into strict v_baseline from aw3b_note_event_baseline;
  select encode(extensions.digest(convert_to('PRIVATE-AW3B-NOTE-BETA','UTF8'),'sha256'),'hex') into v_note_hash;
  if (select count(*) from public.workout_session_timeline_events
      where exercise_log_id=v_baseline.exercise_log_id and event_type='set_edited')<>v_baseline.event_count+1 then
    raise exception 'AW-3B note-only retry emitted duplicate edit history.';
  end if;
  if not exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_baseline.exercise_log_id and event_type='set_edited'
      and payload->>'notesChanged'='true'
  ) then raise exception 'AW-3B note-only edit lacks bounded change metadata.'; end if;
  if exists (
    select 1 from public.workout_session_timeline_events
    where exercise_log_id=v_baseline.exercise_log_id
      and (payload::text like '%PRIVATE-AW3B-NOTE-BETA%'
        or idempotency_key like '%'||v_note_hash||'%'
        or payload::text like '%'||v_note_hash||'%')
  ) then raise exception 'AW-3B note-only timeline leaked note text or its direct digest.'; end if;
end
$verify_note_privacy_and_retry$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $trusted_provider_requirements$
begin
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,
      jsonb_build_array(jsonb_build_object(
        'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',2,'reps',1,
        'set_details',jsonb_build_object('set_type','working','source','device')
      ))
    );
    raise exception 'Trusted device provenance without provider was accepted.';
  exception when check_violation then null; end;
  if exists (
    select 1 from public.exercise_logs
    where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid and set_number=2
  ) then raise exception 'Rejected trusted provenance partially committed a log.'; end if;
end
$trusted_provider_requirements$;

select public.upsert_workout_set_logs_atomic(
  'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'exercise_order',1,'exercise_name','AW-3B Provenance Set','set_number',2,
    'reps',6,'weight_kg',30,'completed_at','2026-07-23T20:02:00Z',
    'set_details',jsonb_build_object('set_type','working','source','import','source_provider','trusted.importer')
  ))
);

select public.complete_workout_session_atomic(
  'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,
  null,30,'AW-3B final hardening complete'
);

reset role;

do $verify_completion_convergence$
begin
  if (select status::text from public.workout_sessions where id=current_setting('plaivra.aw3b_final_session_id')::uuid)<>'completed'
     or (select count(*) from public.workout_session_timeline_events
       where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid and event_type='session_completed')<>1
     or (select count(*) from public.workout_session_timeline_events
       where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid and event_type='set_completed')<>2 then
    raise exception 'AW-3B completion did not converge on the canonical final authority.';
  end if;
end
$verify_completion_convergence$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3f00000-0000-4000-8000-000000000002',true);

do $cross_user_and_direct_write_rejection$
begin
  begin
    perform public.upsert_workout_set_logs_atomic(
      'b3f00000-0000-4000-8000-000000000001',current_setting('plaivra.aw3b_final_session_id')::uuid,'[]'::jsonb
    );
    raise exception 'Cross-user AW-3B final RPC call was accepted.';
  exception when insufficient_privilege then null; end;
  begin
    update public.exercise_log_set_details set rpe=1
    where workout_session_id=current_setting('plaivra.aw3b_final_session_id')::uuid;
    raise exception 'Authenticated direct AW-3B update was accepted.';
  exception when insufficient_privilege then null; end;
end
$cross_user_and_direct_write_rejection$;

rollback;
''',
)

# Permanent Quality must execute the new behavioral SQL verification.
replace_once(
    ".github/workflows/quality.yml",
    '''          PGPASSWORD=postgres psql "$PLAIVRA_LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/verification/active-workout-aw3b-integration.sql;
          PGPASSWORD=postgres psql "$PLAIVRA_LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/verification/train-atomic-rpc-security.sql;
''',
    '''          PGPASSWORD=postgres psql "$PLAIVRA_LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/verification/active-workout-aw3b-integration.sql;
          PGPASSWORD=postgres psql "$PLAIVRA_LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/verification/active-workout-aw3b-final-hardening.sql;
          PGPASSWORD=postgres psql "$PLAIVRA_LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/verification/train-atomic-rpc-security.sql;
''',
)

# Update source-contract coverage for the final forward migration.
migration_test = read("lib/product/active-workout-aw3b-migration.test.ts")
migration_test = migration_test.replace(
    '''const correctionMigration = readFileSync(
  "supabase/migrations/20260723010500_active_workout_aw3b_read_and_payload_corrections.sql",
  "utf8",
);
''',
    '''const correctionMigration = readFileSync(
  "supabase/migrations/20260723010500_active_workout_aw3b_read_and_payload_corrections.sql",
  "utf8",
);
const finalHardeningMigration = readFileSync(
  "supabase/migrations/20260724003000_active_workout_aw3b_final_logic_hardening.sql",
  "utf8",
);
''',
    1,
)
old_timeline_test = re.search(
    r'''  it\("emits only bounded timeline fingerprints and suppresses no-op duplicates", \(\) => \{.*?\n  \}\);\n''',
    migration_test,
    flags=re.S,
)
if not old_timeline_test:
    raise RuntimeError("Could not find old AW-3B timeline source test")
new_timeline_test = '''  it("defers core timeline creation until the complete graph is known without note-derived keys", () => {
    expect(finalHardeningMigration).toContain("plaivra.aw3b_defer_set_timeline");
    expect(finalHardeningMigration).toContain("private.aw3b_safe_structured_summary");
    expect(finalHardeningMigration).toContain("private.aw3b_graph_revision");
    expect(finalHardeningMigration).toContain("'structuredSet', v_structured_summary");
    expect(finalHardeningMigration).toContain("'runtime:set_completed:' || v_after.id::text || ':aw3b:'");
    expect(finalHardeningMigration).toContain("'runtime:set_edited:' || v_after.id::text || ':aw3b:r'");
    expect(finalHardeningMigration).not.toContain("'before',v_before_structured,'after',v_after_structured");
    expect(finalHardeningMigration).not.toContain("v_after.notes,'sha256'");
    expect(finalHardeningMigration).toContain("'notePresent', d.notes IS NOT NULL");
    expect(finalHardeningMigration).toContain("'notesChanged', v_notes_changed");
  });
'''
migration_test = migration_test[:old_timeline_test.start()] + new_timeline_test + migration_test[old_timeline_test.end():]
migration_test = migration_test.replace(
    '''  it("leaves the deployed compatibility marker untouched", () => {
''',
    '''  it("actor-binds authenticated structured provenance and preserves trusted no-op graphs", () => {
    expect(finalHardeningMigration).toContain("v_role <> 'service_role'");
    expect(finalHardeningMigration).toContain("'source', 'manual'");
    expect(finalHardeningMigration).toContain("'source_provider', 'plaivra'");
    expect(finalHardeningMigration).toContain("'source_version', 'aw3b-v1'");
    expect(finalHardeningMigration).toContain("v_existing_details");
    expect(finalHardeningMigration).toContain("v_existing_segment");
    expect(finalHardeningMigration).toContain("v_existing_metric");
  });

  it("leaves the deployed compatibility marker untouched", () => {
''',
    1,
)
migration_test = migration_test.replace(
    '''    expect(migration).not.toContain(
      "update public.release_schema_compatibility",
    );
''',
    '''    expect(migration).not.toContain(
      "update public.release_schema_compatibility",
    );
    expect(finalHardeningMigration).toContain("v_marker <> '20260722161542'");
    expect(finalHardeningMigration).not.toContain("update public.release_schema_compatibility");
''',
    1,
)
write("lib/product/active-workout-aw3b-migration.test.ts", migration_test)

print("AW-3B finalization patches applied.")
