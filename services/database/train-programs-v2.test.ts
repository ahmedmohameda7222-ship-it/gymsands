import { describe, expect, it } from "vitest";
import type { MetricSchema } from "@/lib/activity-catalog/types";
import {
  mapTrainingProgramV2,
  validatePlannedActivityPrescription
} from "./train-programs-v2";

const metricSchema: MetricSchema = {
  slug: "strength_v1",
  name: "Strength",
  fields: [
    { key: "sets", label: "Sets", type: "integer", required: true, min: 1 },
    { key: "load_kg", label: "Load", type: "number", unit: "kg", required: false },
    { key: "tempo", label: "Tempo", type: "text", required: false },
    { key: "assisted", label: "Assisted", type: "boolean", required: false }
  ]
};

describe("Phase 2 training-program mapping", () => {
  it("maps one bounded graph with deterministic ordering, template reuse, snapshots, and archived filtering", () => {
    const program = mapTrainingProgramV2({
      id: "plan-a",
      user_id: "user-a",
      name: "Hybrid program",
      description: "Strength and running",
      user_workout_plan_weeks: [
        { id: "week-2", plan_id: "plan-a", week_template_id: "template-a", week_number: 2, name_override: null, notes: null, is_detached: false, archived_at: null },
        { id: "week-archived", plan_id: "plan-a", week_template_id: "template-b", week_number: 3, name_override: null, notes: null, is_detached: false, archived_at: "2026-07-01T00:00:00Z" },
        { id: "week-1", plan_id: "plan-a", week_template_id: "template-a", week_number: 1, name_override: "Foundation", notes: "Keep easy", is_detached: false, archived_at: null }
      ],
      user_workout_plan_week_templates: [
        {
          id: "template-archived",
          plan_id: "plan-a",
          name: "Archived",
          description: null,
          sort_order: 3,
          source: "manual",
          derived_from_template_id: null,
          archived_at: "2026-07-01T00:00:00Z",
          user_workout_plan_sessions: []
        },
        {
          id: "template-a",
          plan_id: "plan-a",
          name: "Foundation",
          description: null,
          sort_order: 1,
          source: "chatgpt",
          derived_from_template_id: null,
          archived_at: null,
          user_workout_plan_sessions: [
            {
              id: "session-2",
              week_template_id: "template-a",
              source_legacy_plan_day_id: null,
              source: "chatgpt",
              title: "Intervals",
              day_offset: 3,
              weekday: "Thursday",
              sport_slug: "running",
              sport_name_snapshot: "Running",
              session_type_slug: "intervals",
              session_type_name_snapshot: "Intervals",
              duration_minutes: 40,
              sort_order: 2,
              notes: null,
              archived_at: null,
              user_workout_plan_phases: []
            },
            {
              id: "session-1",
              week_template_id: "template-a",
              source_legacy_plan_day_id: "legacy-day-a",
              source: "legacy_backfill",
              title: "Strength",
              day_offset: 1,
              weekday: "Tuesday",
              sport_slug: null,
              sport_name_snapshot: "Legacy training",
              session_type_slug: null,
              session_type_name_snapshot: null,
              duration_minutes: 60,
              sort_order: 1,
              notes: null,
              archived_at: null,
              user_workout_plan_phases: [
                {
                  id: "phase-2",
                  plan_session_id: "session-1",
                  phase_slug: "cooldown",
                  phase_name_snapshot: "Cool-down",
                  is_optional: true,
                  source_legacy_block_type: "cooldown",
                  sort_order: 2,
                  notes: null,
                  archived_at: null,
                  user_workout_plan_activities: []
                },
                {
                  id: "phase-1",
                  plan_session_id: "session-1",
                  phase_slug: "main_work",
                  phase_name_snapshot: "Main work",
                  is_optional: false,
                  source_legacy_block_type: "strength",
                  sort_order: 1,
                  notes: null,
                  archived_at: null,
                  user_workout_plan_activities: [
                    {
                      id: "activity-archived",
                      plan_phase_id: "phase-1",
                      source_legacy_plan_exercise_id: null,
                      legacy_source_workout_id: null,
                      catalog_activity_id: null,
                      catalog_slug: null,
                      catalog_version: null,
                      catalog_source: "manual",
                      activity_name_snapshot: "Archived activity",
                      short_description_snapshot: null,
                      activity_type_slug: null,
                      activity_type_name_snapshot: null,
                      instructions_snapshot: null,
                      metric_schema_snapshot: null,
                      planned_prescription: {},
                      equipment_snapshot: null,
                      taxonomy_snapshot: null,
                      sort_order: 3,
                      notes: null,
                      archived_at: "2026-07-01T00:00:00Z"
                    },
                    {
                      id: "activity-2",
                      plan_phase_id: "phase-1",
                      source_legacy_plan_exercise_id: null,
                      legacy_source_workout_id: null,
                      catalog_activity_id: "catalog-row",
                      catalog_slug: "barbell-row",
                      catalog_version: "7",
                      catalog_source: "external",
                      activity_name_snapshot: "Barbell row",
                      short_description_snapshot: "Horizontal pull",
                      activity_type_slug: "strength",
                      activity_type_name_snapshot: "Strength",
                      instructions_snapshot: [{ order: 1, text: "Pull to the torso." }],
                      metric_schema_snapshot: metricSchema,
                      planned_prescription: { sets: 4, load_kg: 70 },
                      equipment_snapshot: [{ id: "barbell", slug: "barbell", name: "Barbell", isRequired: true }],
                      taxonomy_snapshot: { muscles: ["back"] },
                      sort_order: 2,
                      notes: null,
                      archived_at: null
                    },
                    {
                      id: "activity-1",
                      plan_phase_id: "phase-1",
                      source_legacy_plan_exercise_id: "legacy-exercise-a",
                      legacy_source_workout_id: "legacy-workout-a",
                      catalog_activity_id: null,
                      catalog_slug: null,
                      catalog_version: null,
                      catalog_source: "legacy",
                      activity_name_snapshot: "Back squat",
                      short_description_snapshot: null,
                      activity_type_slug: "strength",
                      activity_type_name_snapshot: "Strength",
                      instructions_snapshot: null,
                      metric_schema_snapshot: metricSchema,
                      planned_prescription: { sets: 3, load_kg: 80, tempo: "3-1-1" },
                      equipment_snapshot: ["Barbell"],
                      taxonomy_snapshot: { target_muscle: "Quadriceps" },
                      sort_order: 1,
                      notes: "Controlled",
                      archived_at: null
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(program.weeks.map((week) => week.weekNumber)).toEqual([1, 2]);
    expect(program.weeks.map((week) => week.weekTemplateId)).toEqual(["template-a", "template-a"]);
    expect(program.weekTemplates).toHaveLength(1);
    expect(program.weekTemplates[0].sessions.map((session) => session.id)).toEqual(["session-1", "session-2"]);
    expect(program.weekTemplates[0].sessions[0].phases.map((phase) => phase.id)).toEqual(["phase-1", "phase-2"]);
    expect(program.weekTemplates[0].sessions[0].phases[0].activities.map((activity) => activity.id)).toEqual(["activity-1", "activity-2"]);
    expect(program.weekTemplates[0].sessions[0].phases[0].activities[1]).toMatchObject({
      catalog: { id: "catalog-row", slug: "barbell-row", version: "7", source: "external" },
      snapshots: {
        name: "Barbell row",
        metricSchema,
        taxonomy: { muscles: ["back"] }
      },
      plannedPrescription: { sets: 4, load_kg: 70 }
    });
  });
});

describe("planned activity prescription validation", () => {
  it("accepts valid primitive values and the legacy compatibility schema", () => {
    expect(() => validatePlannedActivityPrescription(metricSchema, {
      sets: 3,
      load_kg: 82.5,
      tempo: "3-1-1",
      assisted: false
    })).not.toThrow();

    expect(() => validatePlannedActivityPrescription({
      slug: "plaivra_legacy_strength_prescription_v1",
      fields: [
        { key: "sets", label: "Sets", type: "integer", required: false },
        { key: "reps", label: "Reps", type: "text", required: false },
        { key: "rest_seconds", label: "Rest", type: "integer", unit: "seconds", required: false }
      ]
    }, { sets: 4, reps: "6-8", rest_seconds: 120 })).not.toThrow();
  });

  it.each([
    ["missing required value", { load_kg: 50 }],
    ["unknown field", { sets: 3, unknown: 1 }],
    ["invalid integer", { sets: 3.5 }],
    ["invalid number", { sets: 3, load_kg: Number.POSITIVE_INFINITY }],
    ["invalid text", { sets: 3, tempo: 311 }],
    ["invalid boolean", { sets: 3, assisted: "no" }],
    ["negative physical value", { sets: 3, load_kg: -1 }],
    ["array shape", []],
    ["null shape", null]
  ])("rejects %s", (_label, prescription) => {
    expect(() => validatePlannedActivityPrescription(metricSchema, prescription)).toThrow();
  });

  it("honors explicit schema bounds and an explicit negative-value allowance", () => {
    const bounded: MetricSchema = {
      fields: [{ key: "incline", label: "Incline", type: "number", required: true, min: -10, max: 10, allowNegative: true }]
    };
    expect(() => validatePlannedActivityPrescription(bounded, { incline: -5 })).not.toThrow();
    expect(() => validatePlannedActivityPrescription(bounded, { incline: 11 })).toThrow(/maximum/i);
  });
});
