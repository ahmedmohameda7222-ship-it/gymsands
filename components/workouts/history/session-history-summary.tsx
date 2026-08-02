"use client";

import { Clock3, Dumbbell, Layers3, Weight } from "lucide-react";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

export function SessionHistorySummary({ detail }: { detail: WorkoutHistorySessionDetailResponse }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const metrics = [
    detail.activity.durationMinutes === null ? null : { icon: Clock3, label: tr("historyDurationMetric"), value: tr("historyMinutesShort", { count: detail.activity.durationMinutes }) },
    detail.summary.exerciseCount === null ? null : { icon: Dumbbell, label: tr("historyExercisesMetric"), value: number.format(detail.summary.exerciseCount) },
    detail.summary.completedSetCount === null ? null : { icon: Layers3, label: tr("historySetsMetric"), value: number.format(detail.summary.completedSetCount) },
    detail.summary.reliableVolume === null ? null : { icon: Weight, label: tr("historyReliableVolumeMetric"), value: tr("historyKilogramsShort", { count: number.format(detail.summary.reliableVolume) }) },
  ].filter((metric): metric is { icon: typeof Clock3; label: string; value: string } => Boolean(metric));

  if (!metrics.length) return null;
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={tr("historyPrimaryHighlight")} data-session-history-summary>
      {metrics.map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" /><span>{label}</span></div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground"><bdi dir="ltr">{value}</bdi></p>
        </div>
      ))}
    </section>
  );
}
