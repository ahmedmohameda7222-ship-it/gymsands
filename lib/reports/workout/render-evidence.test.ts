import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { ReportLanguage } from "@/lib/reports/pdf/types";
import { buildWorkoutReportModel } from "@/lib/reports/workout/model";
import { renderWorkoutReport } from "@/lib/reports/workout/render";
import { workoutReportFixture } from "@/lib/reports/workout/test-fixture";
import type { WorkoutHistoryExerciseDetail } from "@/types/workout-history";

const evidenceDirectory = process.env.P8A_PDF_EVIDENCE_DIR;
const fixedGeneratedAt = new Date("2026-08-06T00:00:00.000Z");

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
          ? "Saved long-form set note for wrapping verification. Kontrollierte Ausführung mit vollständigem Bewegungsumfang. ملاحظة محفوظة للتحقق من التفاف النص العربي واللاتيني مع 80 kg × 8."
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

function evidenceDetail(language: ReportLanguage) {
  const detail = workoutReportFixture();
  if (language === "de") {
    detail.activity.title =
      "Langes Ganzkörpertraining — Rücken, Füße und kontrollierte Übergänge";
    detail.activity.notes =
      "Gespeicherte Trainingsnotiz mit Umlauten, ß und bewusst langem Inhalt. ".repeat(
        8,
      );
    detail.exercises = Array.from({ length: 8 }, (_, index) =>
      repeatedExercise(detail.exercises[index % detail.exercises.length]!, index),
    );
  } else if (language === "ar") {
    detail.activity.title = "تمرين القوة — Push 80 kg × 8 ثم سحب أمامي";
    detail.activity.notes =
      "ملاحظة جلسة محفوظة تحتوي على نص عربي وEnglish و80 kg × 8 وأرقام ١٢٣. ".repeat(
        4,
      );
    detail.exercises = Array.from({ length: 5 }, (_, index) =>
      repeatedExercise(detail.exercises[index % detail.exercises.length]!, index),
    );
  }
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
}> = [
  { language: "en", timezone: "Europe/Berlin", filename: "p8a-report-en.pdf" },
  { language: "de", timezone: "Europe/Berlin", filename: "p8a-report-de-long.pdf" },
  { language: "ar", timezone: "Asia/Riyadh", filename: "p8a-report-ar-mixed.pdf" },
];

describe.skipIf(!evidenceDirectory)("P8A PDF evidence generation", () => {
  it.each(cases)("writes loadable $language PDF evidence", async (testCase) => {
    const directory = path.resolve(evidenceDirectory!);
    await mkdir(directory, { recursive: true });
    const model = buildWorkoutReportModel({
      detail: evidenceDetail(testCase.language),
      language: testCase.language,
      timezone: testCase.timezone,
      generatedAt: fixedGeneratedAt,
    });
    const report = await renderWorkoutReport(model);
    const output = path.join(directory, testCase.filename);
    await writeFile(output, report.bytes);

    const loaded = await PDFDocument.load(report.bytes);
    expect(loaded.getPageCount()).toBe(report.pageCount);
    expect(loaded.getPageCount()).toBeGreaterThan(0);
    if (testCase.language !== "en") {
      expect(loaded.getPageCount()).toBeGreaterThan(1);
    }
  }, 30_000);
});
