"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

export function SessionHistorySummary({ detail }: { detail: WorkoutHistorySessionDetailResponse }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const strength = detail.resultKind === "strength_sets";
  const facts = [
    detail.activity.durationMinutes === null ? null : tr("historyMinutesShort", { count: detail.activity.durationMinutes }),
    strength && detail.summary.completedSetCount !== null ? tr("historyCompletedSetsCount", { count: number.format(detail.summary.completedSetCount) }) : null,
    strength && detail.summary.exerciseCount !== null ? tr("historyExercisesCount", { count: number.format(detail.summary.exerciseCount) }) : null,
    (detail.summary.verifiedRecordCount ?? 0) > 0 ? (detail.summary.verifiedRecordCount === 1 ? tr("historyPrCountOne") : tr("historyPrCount", { count: detail.summary.verifiedRecordCount ?? 0 })) : null,
  ].filter((fact): fact is string => Boolean(fact));
  if (!facts.length) return null;
  return <p className="mt-2 text-sm text-muted-foreground" aria-label={tr("historyPrimaryHighlight")} data-session-history-summary><bdi dir="ltr">{facts.join(" / ")}</bdi></p>;
}
