import { describe, expect, it } from "vitest";

import { PdfReportError } from "@/lib/reports/pdf/errors";
import { PDF_REPORT_BOUNDS } from "@/lib/reports/pdf/types";
import { buildWorkoutReportModel } from "@/lib/reports/workout/model";
import {
  semanticWorkoutReportFixture,
  workoutReportFixture,
} from "@/lib/reports/workout/test-fixture";

const generatedAt = new Date("2026-08-06T00:00:00.000Z");

describe("P8A workout report model", () => {
  it("builds an immutable visible-only performed-workout model", () => {
    const model = buildWorkoutReportModel({
      detail: workoutReportFixture(),
      language: "ar",
      timezone: "Europe/Berlin",
      generatedAt,
    });

    expect(model.direction).toBe("rtl");
    expect(model.generatedAt).toBe(generatedAt.toISOString());
    expect(model.category).toBe("القوة");
    expect(model.summary).toMatchObject({
      performedSetCount: 3,
      plannedSetCount: 4,
      reliableVolume: 2_400,
      verifiedRecordCount: 1,
    });
    expect(model.exercises[0]).toMatchObject({
      name: "Bench Press",
      plannedName: "Barbell Bench Press",
      state: "replaced",
      missingSetCount: 1,
      unplannedSetCount: 1,
    });
    expect(model.exercises[0]?.sets.map((set) => set.state)).toEqual([
      "performed",
      "unplanned",
      "missing",
    ]);
    expect(model.highlights).toHaveLength(3);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.exercises)).toBe(true);

    const serialized = JSON.stringify(model);
    for (const privateValue of [
      "11111111-1111-4111-8111-111111111111",
      "20000000-0000-4000-8000-000000000002",
      "activity-private-id",
      "plan-private-id",
      "snapshot-private-id",
      "set-private-id-1",
      "record-private-id",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("preserves unavailable summary values instead of inventing zeros", () => {
    const detail = workoutReportFixture();
    detail.summary = {
      exerciseCount: null,
      completedSetCount: null,
      reliableVolume: null,
      verifiedRecordCount: null,
    };
    detail.activity.durationMinutes = null;
    detail.exercises[0]!.plannedSetCount = null;

    const model = buildWorkoutReportModel({
      detail,
      language: "de",
      timezone: "UTC",
      generatedAt,
    });

    expect(model.summary).toEqual({
      durationMinutes: null,
      exerciseCount: null,
      performedSetCount: null,
      plannedSetCount: null,
      reliableVolume: null,
      verifiedRecordCount: null,
    });
  });

  it("keeps planned-set totals unavailable when any canonical exercise total is unavailable", () => {
    const detail = workoutReportFixture();
    detail.exercises.push({
      identity: "unavailable-planned-count",
      exerciseId: null,
      snapshotItemId: null,
      name: "Saved exercise",
      plannedName: null,
      state: "skipped",
      category: null,
      plannedSetCount: null,
      performedSets: [],
      missingPlannedSets: [],
    });
    const model = buildWorkoutReportModel({
      detail,
      language: "en",
      timezone: "UTC",
      generatedAt,
    });
    expect(model.summary.plannedSetCount).toBeNull();
  });

  it("fails closed before rendering when explicit size bounds are exceeded", () => {
    const detail = workoutReportFixture();
    detail.activity.notes = "x".repeat(PDF_REPORT_BOUNDS.maxNoteLength + 1);

    expect(() =>
      buildWorkoutReportModel({
        detail,
        language: "en",
        timezone: "UTC",
        generatedAt,
      }),
    ).toThrowError(PdfReportError);
    try {
      buildWorkoutReportModel({
        detail,
        language: "en",
        timezone: "UTC",
        generatedAt,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "REPORT_TOO_LARGE", status: 413 });
    }
  });

  it("rejects scheduled fallback data", () => {
    const detail = workoutReportFixture();
    detail.activity.sourceKind = "scheduled_fallback";
    expect(() =>
      buildWorkoutReportModel({
        detail,
        language: "en",
        timezone: "UTC",
      }),
    ).toThrowError(/Only performed workout history/u);
  });

  it.each(["completed", "partial", "cancelled", "skipped"] as const)(
    "preserves the saved %s lifecycle without inventing completion semantics",
    (lifecycle) => {
      const detail = workoutReportFixture();
      detail.activity.lifecycle = lifecycle;
      const model = buildWorkoutReportModel({
        detail,
        language: "en",
        timezone: "UTC",
        generatedAt,
      });
      expect(model.lifecycle).toBe(lifecycle);
    },
  );

  it("fails closed when a single exercise exceeds the explicit set bound", () => {
    const detail = workoutReportFixture();
    const source = detail.exercises[0]!.performedSets[0]!;
    detail.exercises[0]!.performedSets = Array.from(
      { length: PDF_REPORT_BOUNDS.maxSetsPerExercise + 1 },
      (_, index) => ({ ...structuredClone(source), id: `set-${index}`, setNumber: index + 1 }),
    );
    expect(() =>
      buildWorkoutReportModel({
        detail,
        language: "en",
        timezone: "UTC",
        generatedAt,
      }),
    ).toThrowError(/set bound/u);
  });


  it.each([
    ["en", ["Cardio", "Warm-up", "Drop set", "To failure", "Duration", "Distance", "Bodyweight", "Assistance", "Bilateral", "Left", "Right", "Rest-pause", "Rounds"]],
    ["de", ["Cardio", "Aufwärmsatz", "Dropsatz", "Bis zum Muskelversagen", "Dauer", "Distanz", "Körpergewicht", "Unterstützung", "Beidseitig", "Links", "Rechts", "Rest-Pause", "Runden"]],
    ["ar", ["تمارين القلب", "مجموعة إحماء", "مجموعة إسقاط", "حتى الفشل", "المدة", "المسافة", "وزن الجسم", "حمل المساعدة", "ثنائي الجانب", "يسار", "يمين", "راحة وتوقف", "الجولات"]],
  ] as const)(
    "localizes every canonical semantic surface for %s without changing authored text",
    (language, expectedLabels) => {
      const model = buildWorkoutReportModel({
        detail: semanticWorkoutReportFixture(),
        language,
        timezone: "Europe/Berlin",
        generatedAt,
      });
      const visible = JSON.stringify(model);
      for (const label of expectedLabels) expect(visible).toContain(label);
      for (const raw of [
        "duration_seconds",
        "distance_meters",
        "bodyweight_kg",
        "assistance_load_kg",
        "rest_pause",
      ]) {
        expect(visible).not.toContain(raw);
      }
      expect(visible).toContain("Assisted Sprint X1");
      expect(visible).toContain("Assisted Sprint Plan");
      expect(visible).toContain("User note Latin 45 — ملاحظة");
      expect(model.exercises[0]?.sets[0]?.actualResult).toMatch(/[0-9٠-٩]/u);
    },
  );

  it.each(["de", "ar"] as const)(
    "does not expose raw English canonical enums in %s",
    (language) => {
      const visible = JSON.stringify(
        buildWorkoutReportModel({
          detail: semanticWorkoutReportFixture(),
          language,
          timezone: "UTC",
          generatedAt,
        }),
      );
      for (const raw of [
        "strength",
        "working",
        "warmup",
        "failure",
        "bilateral",
        "left",
        "right",
        "primary",
        "rest_pause",
        "seconds",
        "meters",
      ]) {
        expect(visible).not.toMatch(new RegExp(`(?:^|[\" :,(])${raw}(?:$|[\" :,.\)])`, "u"));
      }
    },
  );

  it("preserves explicitly authored free-text categories", () => {
    const detail = semanticWorkoutReportFixture();
    detail.activity.category = "Coach-defined Hybrid";
    const model = buildWorkoutReportModel({
      detail,
      language: "de",
      timezone: "UTC",
      generatedAt,
    });
    expect(model.category).toBe("Coach-defined Hybrid");
  });

  it("fails closed with one stable error for an unsupported internal semantic", () => {
    const detail = semanticWorkoutReportFixture();
    detail.exercises[0]!.performedSets[0]!.metrics[0]!.metricKey =
      "future_internal_metric";
    expect(() =>
      buildWorkoutReportModel({
        detail,
        language: "ar",
        timezone: "UTC",
        generatedAt,
      }),
    ).toThrowError(PdfReportError);
    try {
      buildWorkoutReportModel({
        detail,
        language: "ar",
        timezone: "UTC",
        generatedAt,
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "REPORT_GENERATION_FAILED",
        status: 422,
      });
    }
  });
});
