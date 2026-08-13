"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import { HistoryFactList, type HistoryFact } from "@/components/workouts/history/history-fact-list";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

export function SessionHistorySummary({ detail }: { detail: WorkoutHistorySessionDetailResponse }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const strength = detail.resultKind === "strength_sets";
  const facts = [
    detail.activity.durationMinutes === null ? null : { label: tr("historyDurationMetric"), value: tr("historyMinutesShort", { count: detail.activity.durationMinutes }) },
    strength && detail.summary.completedSetCount !== null ? { label: tr("historyCompletedSetsMetric"), value: number.format(detail.summary.completedSetCount) } : null,
    strength && detail.summary.exerciseCount !== null ? { label: tr("historyExercisesMetric"), value: number.format(detail.summary.exerciseCount) } : null,
    (detail.summary.verifiedRecordCount ?? 0) > 0 ? { label: tr("historyVerifiedRecord"), value: number.format(detail.summary.verifiedRecordCount ?? 0) } : null,
  ].flatMap((fact): HistoryFact[] => fact ? [fact] : []);
  if (!facts.length) return null;
  return <p className="mt-2 text-sm text-muted-foreground" aria-label={tr("historyPrimaryHighlight")} data-session-history-summary><HistoryFactList facts={facts} /></p>;
}
