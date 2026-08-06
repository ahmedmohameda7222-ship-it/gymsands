import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { ReportLanguage } from "@/lib/reports/pdf/types";
import { buildWorkoutReportModel } from "@/lib/reports/workout/model";
import { renderWorkoutReport } from "@/lib/reports/workout/render";
import { workoutReportFixture } from "@/lib/reports/workout/test-fixture";
import type {
  WorkoutHistoryExerciseDetail,
  WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

const evidenceDirectory = process.env.P8A_PDF_EVIDENCE_DIR;
const fixedGeneratedAt = new Date("2026-08-06T00:00:00.000Z");

const REVIEWED_OUTPUT_BYTES = Object.freeze({
  en: 2_276_482,
  ar: 2_297_772,
  longMultilingual: 2_285_200,
});

function compactDetail(language: "en" | "ar") {
  const detail = workoutReportFixture();
  detail.activity.title =
    language === "ar" ? "تمرين القوة — Bench Press 80 kg" : "Strength session";
  detail.activity.notes = null;
  detail.exercises = [structuredClone(detail.exercises[0]!)];
  detail.exercises[0]!.plannedName = null;
  detail.exercises[0]!.performedSets = [
    structuredClone(detail.exercises[0]!.performedSets[0]!),
  ];
  detail.exercises[0]!.performedSets[0]!.notes = null;
  detail.exercises[0]!.missingPlannedSets = [];
  detail.exercises[0]!.plannedSetCount = 1;
  detail.summary = {
    exerciseCount: 1,
    completedSetCount: 1,
    reliableVolume: 640,
    verifiedRecordCount: 1,
  };
  return detail;
}

function repeatedExercise(
  exercise: WorkoutHistoryExerciseDetail,
  index: number,
): WorkoutHistoryExerciseDetail {
  return {
    ...structuredClone(exercise),
    identity: `evidence:${index}`,
    exerciseId: null,
    snapshotItemId: null,
    name: `${exercise.name} ${index + 1}`,
    plannedName: exercise.plannedName
      ? `${exercise.plannedName} ${index + 1}`
      : null,
    performedSets: exercise.performedSets.map((set, setIndex) => ({
      ...set,
      id: `evidence-set-${index}-${setIndex}`,
      notes:
        setIndex % 2 === 0
          ? "Kontrollierte Ausführung mit vollständigem Bewegungsumfang. Saved user text: Bench Press 80 kg × 8. ملاحظة محفوظة للتحقق من النص المختلط."
          : set.notes,
      verifiedRecords: set.verifiedRecords.map((record, recordIndex) => ({
        ...record,
        id: `evidence-record-${index}-${setIndex}-${recordIndex}`,
      })),
    })),
    missingPlannedSets: exercise.missingPlannedSets.map((set, setIndex) => ({
      ...set,
      id: `evidence-missing-${index}-${setIndex}`,
    })),
  };
}

function longMultilingualDetail(): WorkoutHistorySessionDetailResponse {
  const detail = workoutReportFixture();
  detail.activity.title =
    "Langes Ganzkörpertraining — Rücken, Füße und تمرين مختلط 80 kg × 8";
  detail.activity.notes =
    "Gespeicherte Notiz mit Umlauten, ß, English, 80 kg × 8 und نص عربي محفوظ. ".repeat(
      8,
    );
  detail.exercises = Array.from({ length: 8 }, (_, index) =>
    repeatedExercise(detail.exercises[index % detail.exercises.length]!, index),
  );
  detail.summary.exerciseCount = detail.exercises.length;
  detail.summary.completedSetCount = detail.exercises.reduce(
    (sum, exercise) => sum + exercise.performedSets.length,
    0,
  );
  detail.summary.verifiedRecordCount = detail.exercises.reduce(
    (sum, exercise) =>
      sum +
      exercise.performedSets.reduce(
        (setSum, set) => setSum + set.verifiedRecords.length,
        0,
      ),
    0,
  );
  return detail;
}

const cases: ReadonlyArray<{
  language: ReportLanguage;
  timezone: string;
  filename: string;
  detail: () => WorkoutHistorySessionDetailResponse;
  maximumBytes: number;
  expectedPages: "one" | "long";
  evidenceKey: string;
}> = [
  {
    language: "en",
    timezone: "Europe/Berlin",
    filename: "p8a-report-en.pdf",
    detail: () => compactDetail("en"),
    maximumBytes: REVIEWED_OUTPUT_BYTES.en,
    expectedPages: "one",
    evidenceKey: "onePageEnglish",
  },
  {
    language: "ar",
    timezone: "Asia/Riyadh",
    filename: "p8a-report-ar-mixed.pdf",
    detail: () => compactDetail("ar"),
    maximumBytes: REVIEWED_OUTPUT_BYTES.ar,
    expectedPages: "one",
    evidenceKey: "onePageArabic",
  },
  {
    language: "de",
    timezone: "Europe/Berlin",
    filename: "p8a-report-de-long.pdf",
    detail: longMultilingualDetail,
    maximumBytes: REVIEWED_OUTPUT_BYTES.longMultilingual,
    expectedPages: "long",
    evidenceKey: "longMultilingual",
  },
];

const outputMetrics: Record<
  string,
  { bytes: number; pages: number; generationMs: number; reviewedBytes: number }
> = {};

describe.skipIf(!evidenceDirectory)("P8A PDF evidence generation", () => {
  it.each(cases)("writes bounded $evidenceKey PDF evidence", async (testCase) => {
    const directory = path.resolve(evidenceDirectory!);
    await mkdir(directory, { recursive: true });
    const model = buildWorkoutReportModel({
      detail: testCase.detail(),
      language: testCase.language,
      timezone: testCase.timezone,
      generatedAt: fixedGeneratedAt,
    });
    const report = await renderWorkoutReport(model);
    const output = path.join(directory, testCase.filename);
    await writeFile(output, report.bytes);

    const loaded = await PDFDocument.load(report.bytes);
    expect(loaded.getPageCount()).toBe(report.pageCount);
    if (testCase.expectedPages === "one") {
      expect(loaded.getPageCount()).toBe(1);
    } else {
      expect(loaded.getPageCount()).toBeGreaterThan(1);
    }
    expect(report.byteCount).toBeLessThanOrEqual(testCase.maximumBytes);

    outputMetrics[testCase.evidenceKey] = {
      bytes: report.byteCount,
      pages: report.pageCount,
      generationMs: Number(report.generationMs.toFixed(2)),
      reviewedBytes: testCase.maximumBytes,
    };
    if (Object.keys(outputMetrics).length === cases.length) {
      await writeFile(
        path.join(directory, "p8a-output-metrics.json"),
        `${JSON.stringify(outputMetrics, null, 2)}\n`,
      );
    }
  }, 30_000);
});
