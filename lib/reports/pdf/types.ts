export const REPORT_LANGUAGES = ["en", "de", "ar"] as const;
export type ReportLanguage = (typeof REPORT_LANGUAGES)[number];
export type ReportDirection = "ltr" | "rtl";

export const PDF_REPORT_BOUNDS = Object.freeze({
  maxExercises: 80,
  maxSetsPerExercise: 120,
  maxSets: 600,
  maxTitleLength: 160,
  maxExerciseNameLength: 180,
  maxNoteLength: 1_200,
  maxTotalNoteLength: 12_000,
  maxPages: 40,
  maxBytes: 8 * 1024 * 1024,
  maxGenerationMs: 8_000,
});

export type PdfReportResult = Readonly<{
  bytes: Uint8Array;
  pageCount: number;
  byteCount: number;
  generationMs: number;
}>;
