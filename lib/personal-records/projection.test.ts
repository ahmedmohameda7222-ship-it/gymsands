import { describe, expect, it } from "vitest";

import { canonicalizePersonalRecordRows, projectPersonalRecordDetail, projectPersonalRecordSessions, projectPersonalRecordsMain, type PersonalRecordRawRow } from "./projection";

function verified(overrides: Partial<PersonalRecordRawRow>): PersonalRecordRawRow {
  return {
    id: crypto.randomUUID(), exercise_name: "Back Squat", record_type: "Max weight", weight_kg: 100, reps: null,
    record_date: "2026-06-01", notes: null, source_kind: "workout_derived", exercise_identity_kind: "global",
    exercise_identity: "global:squat", workout_session_id: crypto.randomUUID(), derived_record_type: "highest_load",
    record_value: 100, record_unit: "kg", comparison_context_key: "resistance:external|side:none|set:working|unit:kg|formula:wh6-v1",
    schema_version: 1, formula_version: "wh6-v1", achieved_at: "2026-06-01T10:00:00.000Z", ...overrides,
  };
}

function manual(overrides: Partial<PersonalRecordRawRow>): PersonalRecordRawRow {
  return {
    id: crypto.randomUUID(), exercise_name: "Back Squat", record_type: "Highest load", weight_kg: 110, reps: null,
    record_date: "2026-06-01", notes: null, source_kind: "manual", exercise_identity_kind: null, exercise_identity: null,
    workout_session_id: null, derived_record_type: null, record_value: null, record_unit: null, comparison_context_key: null,
    schema_version: null, formula_version: null, achieved_at: "2026-06-01T09:00:00.000Z",
    subject_id: "subject", record_definition_id: "main:highest_load:v1", record_definition_key: "highest_load",
    record_definition_version: "1", comparison_direction: "higher_better", canonical_value: 110, canonical_unit: "kg",
    comparison_context: { resistance: "external", side: "none", set: "working" }, effective_achieved_at: "2026-06-01T09:00:00.000Z",
    event_semantics_version: "manual-event-time-v1",
    subject: { id: "subject", identity_kind: "catalog_activity", identity_value: "global:squat", name_snapshot: "Back Squat", sport_domain: "strength", sport_name_snapshot: "Strength" },
    ...overrides,
  };
}

describe("canonical Personal Records projection", () => {
  it("merges Manual and Verified chronology without deleting weaker raw facts", () => {
    const raw = [manual({ canonical_value: 110 }), verified({ record_value: 105, weight_kg: 105, achieved_at: "2026-07-01T10:00:00.000Z" })];
    expect(raw).toHaveLength(2);
    const events = canonicalizePersonalRecordRows(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ value: 110, source: "manual" });
  });

  it("backdated stronger Manual evidence reprojects later weaker Verified events", () => {
    const events = canonicalizePersonalRecordRows([
      verified({ record_value: 100, weight_kg: 100, achieved_at: "2026-07-01T10:00:00.000Z" }),
      manual({ canonical_value: 110, effective_achieved_at: "2026-06-01T09:00:00.000Z", achieved_at: "2026-06-01T09:00:00.000Z" }),
    ]);
    expect(events.map((event) => event.value)).toEqual([110]);
  });

  it("counts only canonical Verified session events and keeps Manual evidence as Previous Best", () => {
    const weakerSessionId = "10000000-0000-4000-8000-000000000001";
    const strongerSessionId = "10000000-0000-4000-8000-000000000002";
    const rows = [
      manual({
        canonical_value: 110,
        achieved_at: "2026-06-01T09:00:00.000Z",
        effective_achieved_at: "2026-06-01T09:00:00.000Z",
      }),
      verified({
        workout_session_id: weakerSessionId,
        exercise_log_id: "20000000-0000-4000-8000-000000000001",
        record_value: 105,
        weight_kg: 105,
        achieved_at: "2026-07-01T10:00:00.000Z",
      }),
      verified({
        workout_session_id: strongerSessionId,
        exercise_log_id: "20000000-0000-4000-8000-000000000002",
        record_value: 120,
        weight_kg: 120,
        achieved_at: "2026-08-01T10:00:00.000Z",
      }),
    ];

    const projection = projectPersonalRecordSessions(rows, [weakerSessionId, strongerSessionId]);
    expect(projection.eventsBySessionId[weakerSessionId]).toBeUndefined();
    expect(projection.eventsBySessionId[strongerSessionId]).toHaveLength(1);
    expect(projection.eventsBySessionId[strongerSessionId]?.[0]).toMatchObject({
      event: { source: "verified", value: 120, sourceExerciseLogId: "20000000-0000-4000-8000-000000000002" },
      previousComparable: { source: "manual", value: 110 },
    });
  });

  it("supports lower-better current best and stable lineage URLs", () => {
    const subject = { id: "run", identity_kind: "custom_subject" as const, identity_value: "custom:5k", name_snapshot: "5K", sport_domain: "running", sport_name_snapshot: "Running" };
    const rows = [manual({ subject_id: "run", subject, record_definition_id: "main:fastest_time:v1", record_definition_key: "fastest_time", record_type: "Fastest time", comparison_direction: "lower_better", canonical_unit: "seconds", canonical_value: 1500, comparison_context: { distance_meters: 5000 }, achieved_at: "2026-01-01T10:00:00.000Z", effective_achieved_at: "2026-01-01T10:00:00.000Z" }), manual({ subject_id: "run", subject, record_definition_id: "main:fastest_time:v1", record_definition_key: "fastest_time", record_type: "Fastest time", comparison_direction: "lower_better", canonical_unit: "seconds", canonical_value: 1400, comparison_context: { distance_meters: 5000 }, achieved_at: "2026-02-01T10:00:00.000Z", effective_achieved_at: "2026-02-01T10:00:00.000Z" })];
    const events = canonicalizePersonalRecordRows(rows);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.lineageId)).size).toBe(1);
    expect(events[0].value).toBe(1400);
  });

  it("keeps ambiguous legacy events Uncategorized and unmerged", () => {
    const rows = [manual({ subject_id: null, subject: null, canonical_value: null, record_definition_key: null, comparison_direction: null }), manual({ subject_id: null, subject: null, canonical_value: null, record_definition_key: null, comparison_direction: null })];
    const result = projectPersonalRecordsMain(rows);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sportDomain).toBeNull();
    expect(result.groups[0].records).toHaveLength(2);
  });

  it("paginates current-best lineages with deterministic opaque cursors", () => {
    const rows = [manual({ id: "00000000-0000-4000-8000-000000000001" }), manual({ id: "00000000-0000-4000-8000-000000000002", subject: { id: "other", identity_kind: "custom_subject", identity_value: "custom:other", name_snapshot: "Other", sport_domain: "strength", sport_name_snapshot: "Strength" }, subject_id: "other" })];
    const first = projectPersonalRecordsMain(rows, { limit: 1 });
    expect(first.groups.flatMap((group) => group.records)).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = projectPersonalRecordsMain(rows, { limit: 1, cursor: first.nextCursor });
    expect(second.groups.flatMap((group) => group.records)).toHaveLength(1);
  });

  it("provides Previous Best and selected-event detail without exposing raw context keys", () => {
    const earlier = manual({ id: "00000000-0000-4000-8000-000000000003", canonical_value: 90, achieved_at: "2026-01-01T10:00:00.000Z", effective_achieved_at: "2026-01-01T10:00:00.000Z" });
    const later = manual({ id: "00000000-0000-4000-8000-000000000004", canonical_value: 110, achieved_at: "2026-02-01T10:00:00.000Z", effective_achieved_at: "2026-02-01T10:00:00.000Z" });
    const lineageId = canonicalizePersonalRecordRows([earlier, later])[0].lineageId;
    const detail = projectPersonalRecordDetail([earlier, later], lineageId, { selectedEventId: earlier.id });
    expect(detail?.lineage.previousBest?.value).toBe(90);
    expect(detail?.selectedEventId).toBe(earlier.id);
    expect(JSON.stringify(detail)).not.toContain("comparison_context_key");
  });
});
