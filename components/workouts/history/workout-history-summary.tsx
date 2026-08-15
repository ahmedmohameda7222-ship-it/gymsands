"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryListSummary } from "@/types/workout-history";

export function WorkoutHistorySummary({ summary }: { summary: WorkoutHistoryListSummary; periodDays?: number; compact?: boolean }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const facts = [
    tr("historyWorkoutsCount", { count: number.format(summary.eligibleWorkoutCount) }),
    summary.trustedDurationMinutes === null
      ? null
      : tr("historyMinutesShort", { count: number.format(summary.trustedDurationMinutes) }),
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <section aria-label={tr("historyPeriodContext")}>
      <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
    </section>
  );
}
