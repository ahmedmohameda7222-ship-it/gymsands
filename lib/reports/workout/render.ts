import "server-only";

import { PDFDocument, ReadingDirection } from "pdf-lib";

import {
  PdfReportComposer,
  PDF_COLORS,
  PDF_LAYOUT,
  setPdfLanguage,
} from "@/lib/reports/pdf/document";
import { PdfReportError } from "@/lib/reports/pdf/errors";
import { embedReportFonts } from "@/lib/reports/pdf/fonts";
import {
  PDF_REPORT_BOUNDS,
  type PdfReportResult,
} from "@/lib/reports/pdf/types";
import { workoutReportCopy } from "@/lib/reports/workout/copy";
import type {
  WorkoutReportExercise,
  WorkoutReportModel,
  WorkoutReportSet,
} from "@/lib/reports/workout/types";

const TAGLINE = "Plaivra — Plan. Execute. Track.";
const COLUMN_FRACTIONS = [0.08, 0.23, 0.34, 0.35] as const;

export function assertWorkoutReportResultBounds(input: Readonly<{
  pageCount: number;
  byteCount: number;
  generationMs: number;
}>) {
  if (input.pageCount > PDF_REPORT_BOUNDS.maxPages) {
    throw new PdfReportError(
      "REPORT_TOO_LARGE",
      "The report exceeds the maximum page count.",
    );
  }
  if (input.byteCount > PDF_REPORT_BOUNDS.maxBytes) {
    throw new PdfReportError(
      "REPORT_TOO_LARGE",
      "The report exceeds the maximum file size.",
    );
  }
  if (input.generationMs > PDF_REPORT_BOUNDS.maxGenerationMs) {
    throw new PdfReportError(
      "REPORT_TOO_LARGE",
      "The report exceeded the generation time bound.",
    );
  }
}

function localeFor(language: WorkoutReportModel["language"]) {
  return language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US";
}

function formatDateTime(
  value: string,
  language: WorkoutReportModel["language"],
  timezone: string,
) {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatNumber(value: number, language: WorkoutReportModel["language"]) {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 2,
  }).format(value);
}

function valueOrUnavailable(
  value: number | null,
  model: WorkoutReportModel,
  suffix = "",
) {
  return value === null
    ? workoutReportCopy(model.language).unavailable
    : `${formatNumber(value, model.language)}${suffix}`;
}

function exerciseState(
  exercise: WorkoutReportExercise,
  model: WorkoutReportModel,
) {
  const copy = workoutReportCopy(model.language);
  if (exercise.state === "replaced") return copy.replaced;
  if (exercise.state === "skipped") return copy.lifecycle.skipped;
  if (exercise.state === "completed") return copy.lifecycle.completed;
  if (exercise.state === "adjusted") return copy.adjusted;
  if (exercise.state === "planned") return copy.planned;
  return copy.unavailable;
}

function setState(set: WorkoutReportSet, model: WorkoutReportModel) {
  const copy = workoutReportCopy(model.language);
  if (set.state === "missing") return copy.missing;
  if (set.state === "unplanned") return copy.unplanned;
  return copy.performed;
}

function effortText(set: WorkoutReportSet) {
  if (set.rpe === null && set.rir === null) return null;
  return `RPE ${set.rpe ?? "–"} / RIR ${set.rir ?? "–"}`;
}

function summaryRows(model: WorkoutReportModel) {
  const copy = workoutReportCopy(model.language);
  const planned = model.summary.plannedSetCount;
  const performed = model.summary.performedSetCount;
  return [
    [
      copy.duration,
      valueOrUnavailable(
        model.summary.durationMinutes,
        model,
        ` ${copy.minutes}`,
      ),
    ],
    [copy.exerciseCount, valueOrUnavailable(model.summary.exerciseCount, model)],
    [copy.performedSets, valueOrUnavailable(performed, model)],
    [copy.plannedSets, valueOrUnavailable(planned, model)],
    [
      copy.completedPlanned,
      performed === null || planned === null
        ? copy.unavailable
        : `${formatNumber(performed, model.language)} / ${formatNumber(
            planned,
            model.language,
          )}`,
    ],
    [
      copy.volume,
      valueOrUnavailable(
        model.summary.reliableVolume,
        model,
        ` ${copy.volumeUnit}`,
      ),
    ],
    [
      copy.verifiedRecords,
      valueOrUnavailable(model.summary.verifiedRecordCount, model),
    ],
  ] as const;
}

function drawSummary(composer: PdfReportComposer, model: WorkoutReportModel) {
  const copy = workoutReportCopy(model.language);
  composer.sectionHeading(copy.summary, 56);
  for (const [label, value] of summaryRows(model)) {
    composer.ensureSpace(19);
    const rtl = model.direction === "rtl";
    composer.drawTextAt(label, {
      x: rtl
        ? PDF_LAYOUT.marginX + PDF_LAYOUT.contentWidth * 0.47
        : PDF_LAYOUT.marginX,
      y: composer.y - 10,
      maxWidth: PDF_LAYOUT.contentWidth * 0.53,
      style: {
        size: 9,
        color: PDF_COLORS.muted,
        align: rtl ? "end" : "start",
      },
    });
    composer.drawTextAt(value, {
      x: rtl
        ? PDF_LAYOUT.marginX
        : PDF_LAYOUT.marginX + PDF_LAYOUT.contentWidth * 0.56,
      y: composer.y - 10,
      maxWidth: PDF_LAYOUT.contentWidth * 0.44,
      style: {
        size: 9,
        bold: true,
        align: rtl ? "start" : "end",
      },
    });
    composer.y -= 19;
  }
  composer.gap(5);
}

function columnCells(
  model: WorkoutReportModel,
  values: readonly [string, string, string, string],
) {
  let cursor =
    model.direction === "rtl"
      ? PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX
      : PDF_LAYOUT.marginX;
  return values.map((value, index) => {
    const width = PDF_LAYOUT.contentWidth * COLUMN_FRACTIONS[index]!;
    const x = model.direction === "rtl" ? cursor - width : cursor;
    cursor += model.direction === "rtl" ? -width : width;
    return { value, x, width };
  });
}

function drawColumnHeader(
  composer: PdfReportComposer,
  model: WorkoutReportModel,
) {
  const copy = workoutReportCopy(model.language);
  composer.ensureSpace(22);
  for (const cell of columnCells(model, [
    copy.set,
    copy.state,
    copy.plannedTarget,
    copy.actualResult,
  ])) {
    composer.drawTextAt(cell.value, {
      x: cell.x + 4,
      y: composer.y - 11,
      maxWidth: cell.width - 8,
      style: { size: 7.5, bold: true, color: PDF_COLORS.muted },
    });
  }
  composer.y -= 22;
}

function setCells(model: WorkoutReportModel, set: WorkoutReportSet) {
  const copy = workoutReportCopy(model.language);
  const effort = effortText(set);
  return [
    formatNumber(set.number, model.language),
    `${setState(set, model)}${set.setType ? ` · ${set.setType}` : ""}`,
    set.plannedTarget ?? copy.unavailable,
    `${set.actualResult ?? copy.unavailable}${effort ? ` · ${effort}` : ""}${
      set.verifiedRecordCount > 0 ? ` · ${copy.verifiedRecord}` : ""
    }`,
  ] as const;
}

function setRowHeight(
  composer: PdfReportComposer,
  model: WorkoutReportModel,
  set: WorkoutReportSet,
) {
  const cells = setCells(model, set);
  const textHeight = Math.max(
    26,
    ...cells.map((cell, index) =>
      composer.wrappedHeight(
        cell,
        PDF_LAYOUT.contentWidth * COLUMN_FRACTIONS[index]! - 8,
        { size: 7.5, lineHeight: 10 },
      ),
    ),
  );
  return (
    textHeight +
    (set.notes
      ? composer.wrappedHeight(set.notes, PDF_LAYOUT.contentWidth - 16, {
          size: 7.2,
          lineHeight: 9.5,
        }) + 7
      : 0)
  );
}

function drawSetRow(
  composer: PdfReportComposer,
  model: WorkoutReportModel,
  exercise: WorkoutReportExercise,
  set: WorkoutReportSet,
) {
  const copy = workoutReportCopy(model.language);
  const height = setRowHeight(composer, model, set);
  if (!composer.hasSpace(height)) {
    composer.newPage();
    composer.sectionHeading(`${exercise.name} — ${copy.continued}`, 48);
    drawColumnHeader(composer, model);
  }
  composer.box(
    height,
    set.state === "missing" ? PDF_COLORS.panel : PDF_COLORS.white,
  );
  for (const cell of columnCells(model, setCells(model, set))) {
    composer.drawWrappedAt(cell.value, {
      x: cell.x + 4,
      y: composer.y - 12,
      maxWidth: cell.width - 8,
      style: { size: 7.5, lineHeight: 10 },
    });
  }
  if (set.notes) {
    const noteHeight = composer.wrappedHeight(
      set.notes,
      PDF_LAYOUT.contentWidth - 16,
      { size: 7.2, lineHeight: 9.5 },
    );
    composer.drawWrappedAt(set.notes, {
      x: PDF_LAYOUT.marginX + 8,
      y: composer.y - height + noteHeight + 3,
      maxWidth: PDF_LAYOUT.contentWidth - 16,
      style: { size: 7.2, lineHeight: 9.5, color: PDF_COLORS.muted },
    });
  }
  composer.y -= height + 4;
}

function drawExercise(
  composer: PdfReportComposer,
  model: WorkoutReportModel,
  exercise: WorkoutReportExercise,
) {
  const copy = workoutReportCopy(model.language);
  const firstRowHeight = exercise.sets[0]
    ? setRowHeight(composer, model, exercise.sets[0])
    : 0;
  composer.ensureSpace(Math.min(180, 64 + firstRowHeight));
  composer.sectionHeading(exercise.name, 64 + Math.min(60, firstRowHeight));
  if (exercise.plannedName) {
    composer.drawText(`${copy.originalPlanned}: ${exercise.plannedName}`, {
      size: 8.5,
      color: PDF_COLORS.muted,
    });
  }
  composer.drawText(`${copy.state}: ${exerciseState(exercise, model)}`, {
    size: 8.5,
    color: PDF_COLORS.muted,
  });
  composer.drawText(
    `${copy.performedSets}: ${formatNumber(
      exercise.performedSetCount,
      model.language,
    )} · ${copy.plannedSets}: ${
      exercise.plannedSetCount === null
        ? copy.unavailable
        : formatNumber(exercise.plannedSetCount, model.language)
    }`,
    { size: 8.5, color: PDF_COLORS.muted },
  );
  composer.gap(3);
  if (exercise.sets.length) {
    drawColumnHeader(composer, model);
    for (const set of exercise.sets) {
      drawSetRow(composer, model, exercise, set);
    }
  }
  composer.gap(6);
}

export async function renderWorkoutReport(
  model: WorkoutReportModel,
): Promise<PdfReportResult> {
  const startedAt = performance.now();
  try {
    const document = await PDFDocument.create();
    const fonts = await embedReportFonts(document);
    const copy = workoutReportCopy(model.language);
    const composer = new PdfReportComposer({
      document,
      language: model.language,
      direction: model.direction,
      fonts,
      reportLabel: copy.reportLabel,
    });

    setPdfLanguage(document, model.language);
    const viewerPreferences = document.catalog.getOrCreateViewerPreferences();
    viewerPreferences.setDisplayDocTitle(true);
    viewerPreferences.setReadingDirection(
      model.direction === "rtl" ? ReadingDirection.R2L : ReadingDirection.L2R,
    );
    document.setTitle(`${copy.reportLabel} — ${model.title}`);
    document.setSubject(copy.savedHistoryStatement);
    document.setAuthor("Plaivra");
    document.setCreator("Plaivra workout report authority");
    document.setProducer("Plaivra / pdf-lib / fontkit");
    document.setKeywords(["Plaivra", "workout history", "fitness report"]);
    const generatedAt = new Date(model.generatedAt);
    document.setCreationDate(generatedAt);
    document.setModificationDate(generatedAt);

    composer.drawText(model.title, {
      size: 22,
      bold: true,
      lineHeight: 27,
    });
    composer.drawText(
      formatDateTime(model.sessionAt, model.language, model.timezone),
      { size: 9.5, color: PDF_COLORS.muted },
    );
    composer.drawText(copy.lifecycle[model.lifecycle], {
      size: 9.5,
      bold: true,
      color: PDF_COLORS.green,
    });
    if (model.category) {
      composer.drawText(`${copy.category}: ${model.category}`, {
        size: 9,
        color: PDF_COLORS.muted,
      });
    }
    composer.gap(4);
    composer.drawText(copy.savedHistoryStatement, {
      size: 9,
      color: PDF_COLORS.muted,
      lineHeight: 13,
    });
    composer.gap(10);
    composer.rule(PDF_COLORS.green);

    drawSummary(composer, model);

    if (model.highlights.length) {
      composer.sectionHeading(copy.highlights, 36);
      for (const highlight of model.highlights) {
        composer.drawText(`• ${highlight}`, { size: 9, lineHeight: 13 });
      }
      composer.gap(8);
    }

    composer.sectionHeading(copy.exercises, 48);
    for (const exercise of model.exercises) {
      drawExercise(composer, model, exercise);
    }

    if (model.notes) {
      composer.sectionHeading(copy.notes, 44);
      composer.drawText(model.notes, { size: 9, lineHeight: 13.5 });
    }

    composer.drawFooters({
      pageLabel: copy.page,
      ofLabel: copy.of,
      privateReminder: copy.privateReminder,
      generatedLabel: copy.generated,
      generatedValue: formatDateTime(
        model.generatedAt,
        model.language,
        model.timezone,
      ),
      tagline: TAGLINE,
    });

    const bytes = await document.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    const generationMs = performance.now() - startedAt;
    assertWorkoutReportResultBounds({
      pageCount: composer.pageCount,
      byteCount: bytes.byteLength,
      generationMs,
    });
    return Object.freeze({
      bytes,
      pageCount: composer.pageCount,
      byteCount: bytes.byteLength,
      generationMs,
    });
  } catch (error) {
    if (error instanceof PdfReportError) throw error;
    throw new PdfReportError(
      "REPORT_GENERATION_FAILED",
      "The report could not be generated safely.",
    );
  }
}
