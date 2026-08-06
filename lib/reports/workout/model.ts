import { PdfReportError } from "@/lib/reports/pdf/errors";
import {
  PDF_REPORT_BOUNDS,
  type ReportLanguage,
} from "@/lib/reports/pdf/types";
import { workoutReportCopy } from "@/lib/reports/workout/copy";
import type {
  WorkoutReportExercise,
  WorkoutReportModel,
  WorkoutReportSet,
} from "@/lib/reports/workout/types";
import type {
  WorkoutHistoryPlannedSet,
  WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

function tooLarge(reason: string): never {
  throw new PdfReportError("REPORT_TOO_LARGE", reason);
}

function assertText(value: string | null, max: number, label: string) {
  if (value !== null && [...value].length > max) {
    tooLarge(`${label} exceeds the report bound.`);
  }
}

function numberText(value: number, language: ReportLanguage) {
  return new Intl.NumberFormat(
    language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US",
    { maximumFractionDigits: 2, useGrouping: false },
  ).format(value);
}

function humanizeMetric(value: string) {
  return value.replaceAll("_", " ");
}

function plannedTarget(
  set: WorkoutHistoryPlannedSet | null,
  language: ReportLanguage,
): string | null {
  if (!set) return null;
  const copy = workoutReportCopy(language);
  const targets = set.targets.map((target) => {
    const label =
      target.side === "none"
        ? humanizeMetric(target.metricKey)
        : `${humanizeMetric(target.metricKey)} (${target.side})`;
    if (target.targetValue !== null) {
      return `${label}: ${numberText(target.targetValue, language)}`;
    }
    if (target.minimumValue !== null || target.maximumValue !== null) {
      return `${label}: ${
        target.minimumValue === null
          ? "–"
          : numberText(target.minimumValue, language)
      }–${
        target.maximumValue === null
          ? "–"
          : numberText(target.maximumValue, language)
      }`;
    }
    return label;
  });
  if (set.tempoTarget) targets.push(`${copy.tempo}: ${set.tempoTarget}`);
  if (set.restSeconds !== null) {
    targets.push(`${copy.rest}: ${set.restSeconds} ${copy.seconds}`);
  }
  return targets.length ? targets.join(" · ") : set.targetMode || null;
}

function actualResult(
  set: WorkoutHistorySessionDetailResponse["exercises"][number]["performedSets"][number],
  language: ReportLanguage,
): string | null {
  const copy = workoutReportCopy(language);
  const values: string[] = [];
  if (set.weightKg !== null && set.reps !== null) {
    values.push(
      `${numberText(set.weightKg, language)} kg × ${numberText(set.reps, language)}`,
    );
  } else if (set.weightKg !== null) {
    values.push(`${numberText(set.weightKg, language)} kg`);
  } else if (set.reps !== null) {
    values.push(`${numberText(set.reps, language)} ${copy.repetitions}`);
  }
  for (const metric of set.metrics) {
    if (["external_load_kg", "repetitions"].includes(metric.metricKey)) continue;
    values.push(
      `${humanizeMetric(metric.metricKey)}: ${numberText(metric.value, language)}${
        metric.unit ? ` ${metric.unit}` : ""
      }`,
    );
  }
  for (const segment of set.segments) {
    const metrics = segment.metrics.map(
      (metric) =>
        `${humanizeMetric(metric.metricKey)}: ${numberText(metric.value, language)}${
          metric.unit ? ` ${metric.unit}` : ""
        }`,
    );
    if (metrics.length) {
      values.push(
        `${humanizeMetric(segment.segmentKind)}${
          segment.side ? ` (${segment.side})` : ""
        }: ${metrics.join(", ")}`,
      );
    }
  }
  return values.length ? values.join(" · ") : null;
}

export function buildWorkoutReportModel(
  input: Readonly<{
    detail: WorkoutHistorySessionDetailResponse;
    language: ReportLanguage;
    timezone: string;
    generatedAt?: Date;
  }>,
): WorkoutReportModel {
  const { detail, language, timezone } = input;
  if (detail.activity.sourceKind !== "performed") {
    throw new PdfReportError(
      "REPORT_GENERATION_FAILED",
      "Only performed workout history can be reported.",
      404,
    );
  }
  assertText(
    detail.activity.title,
    PDF_REPORT_BOUNDS.maxTitleLength,
    "Workout title",
  );
  assertText(
    detail.activity.notes,
    PDF_REPORT_BOUNDS.maxNoteLength,
    "Session note",
  );
  if (detail.exercises.length > PDF_REPORT_BOUNDS.maxExercises) {
    tooLarge("Exercise count exceeds the report bound.");
  }

  let totalSets = 0;
  let totalNotes = detail.activity.notes ? [...detail.activity.notes].length : 0;
  let knownPlannedSetCount = 0;
  let plannedCountUnavailable = false;
  let verifiedRecordCount = 0;
  let replacedCount = 0;

  const exercises: WorkoutReportExercise[] = detail.exercises.map((exercise) => {
    assertText(
      exercise.name,
      PDF_REPORT_BOUNDS.maxExerciseNameLength,
      "Exercise name",
    );
    assertText(
      exercise.plannedName,
      PDF_REPORT_BOUNDS.maxExerciseNameLength,
      "Planned exercise name",
    );
    if (
      exercise.state === "replaced" ||
      (exercise.plannedName && exercise.plannedName !== exercise.name)
    ) {
      replacedCount += 1;
    }
    if (exercise.plannedSetCount === null) {
      plannedCountUnavailable = true;
    } else {
      knownPlannedSetCount += exercise.plannedSetCount;
    }
    if (
      exercise.performedSets.length + exercise.missingPlannedSets.length >
      PDF_REPORT_BOUNDS.maxSetsPerExercise
    ) {
      tooLarge("An exercise exceeds the report set bound.");
    }

    const sets: WorkoutReportSet[] = exercise.performedSets.map((set) => {
      totalSets += 1;
      verifiedRecordCount += set.verifiedRecords.length;
      assertText(set.notes, PDF_REPORT_BOUNDS.maxNoteLength, "Set note");
      totalNotes += set.notes ? [...set.notes].length : 0;
      return Object.freeze({
        number: set.setNumber,
        state: set.matchState === "unplanned" ? "unplanned" : "performed",
        setType: set.setType,
        plannedTarget: plannedTarget(set.plannedSet, language),
        actualResult: actualResult(set, language),
        rpe: set.rpe,
        rir: set.rir,
        notes: set.notes,
        verifiedRecordCount: set.verifiedRecords.length,
      });
    });
    for (const missing of exercise.missingPlannedSets) {
      totalSets += 1;
      sets.push(
        Object.freeze({
          number: missing.setOrder,
          state: "missing",
          setType: missing.setType,
          plannedTarget: plannedTarget(missing, language),
          actualResult: null,
          rpe: null,
          rir: null,
          notes: null,
          verifiedRecordCount: 0,
        }),
      );
    }
    return Object.freeze({
      name: exercise.name,
      plannedName:
        exercise.plannedName && exercise.plannedName !== exercise.name
          ? exercise.plannedName
          : null,
      state: exercise.state ?? "unknown",
      plannedSetCount: exercise.plannedSetCount,
      performedSetCount: exercise.performedSets.length,
      missingSetCount: exercise.missingPlannedSets.length,
      unplannedSetCount: exercise.performedSets.filter(
        (set) => set.matchState === "unplanned",
      ).length,
      sets: Object.freeze(sets),
    });
  });

  if (totalSets > PDF_REPORT_BOUNDS.maxSets) {
    tooLarge("Set count exceeds the report bound.");
  }
  if (totalNotes > PDF_REPORT_BOUNDS.maxTotalNoteLength) {
    tooLarge("Saved notes exceed the report bound.");
  }

  const copy = workoutReportCopy(language);
  const highlights: string[] = [];
  const canonicalVerifiedCount =
    detail.summary.verifiedRecordCount ?? verifiedRecordCount;
  if (canonicalVerifiedCount > 0) {
    highlights.push(copy.highlightVerified(canonicalVerifiedCount));
  }
  const plannedSetCount = plannedCountUnavailable
    ? null
    : knownPlannedSetCount;
  if (
    plannedSetCount !== null &&
    detail.summary.completedSetCount !== null
  ) {
    highlights.push(
      copy.highlightCompleted(
        detail.summary.completedSetCount,
        plannedSetCount,
      ),
    );
  }
  if (replacedCount > 0) {
    highlights.push(copy.highlightReplaced(replacedCount));
  }

  return Object.freeze({
    language,
    direction: language === "ar" ? "rtl" : "ltr",
    timezone,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    sessionAt: detail.activity.effectiveAt,
    title: detail.activity.title,
    category: detail.activity.category,
    lifecycle: detail.activity.lifecycle,
    notes: detail.activity.notes,
    summary: Object.freeze({
      durationMinutes: detail.activity.durationMinutes,
      exerciseCount: detail.summary.exerciseCount,
      performedSetCount: detail.summary.completedSetCount,
      plannedSetCount,
      reliableVolume: detail.summary.reliableVolume,
      verifiedRecordCount: detail.summary.verifiedRecordCount,
    }),
    highlights: Object.freeze(highlights),
    exercises: Object.freeze(exercises),
  });
}
