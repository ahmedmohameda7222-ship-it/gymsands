"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryListSummary } from "@/types/workout-history";

export function WorkoutHistorySummary({ summary, periodDays, compact = false }: { summary: WorkoutHistoryListSummary; periodDays: number; compact?: boolean }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const metrics = [
    { label: tr("historyWorkoutsMetric"), value: number.format(summary.eligibleWorkoutCount) },
    summary.trustedDurationMinutes === null ? null : {
      label: tr("historyTrainingTimeMetric"),
      value: tr("historyMinutesShort", { count: number.format(summary.trustedDurationMinutes) }),
    },
    summary.completedSetCount === null ? null : {
      label: tr("historyCompletedSetsMetric"),
      value: number.format(summary.completedSetCount),
    },
    summary.reliableVolume === null ? {
      label: tr("historyFrequencyMetric"),
      value: tr("historyPerWeek", {
        count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
          summary.eligibleWorkoutCount / Math.max(1, periodDays / 7),
        ),
      }),
    } : {
      label: tr("historyReliableVolumeMetric"),
      value: tr("historyKilogramsShort", { count: number.format(summary.reliableVolume) }),
    },
  ].filter((metric): metric is { label: string; value: string } => Boolean(metric)).slice(0, 4);

  return (
    <section className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-4"} aria-label={tr("historyPageTitle")}>
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 rounded-2xl border border-border/70 bg-card p-3">
          <p className="truncate text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground"><bdi dir="ltr">{metric.value}</bdi></p>
        </div>
      ))}
    </section>
  );
}
