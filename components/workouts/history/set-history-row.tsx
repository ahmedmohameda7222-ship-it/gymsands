"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryExerciseSetDetail, WorkoutHistoryPlannedSet } from "@/types/workout-history";

function plannedText(set: WorkoutHistoryPlannedSet, number: Intl.NumberFormat): string {
  return set.targets.map((target) => {
    const values = target.targetMode === "range"
      ? `${number.format(target.minimumValue ?? 0)}–${number.format(target.maximumValue ?? 0)}`
      : target.targetValue !== null
        ? number.format(target.targetValue)
        : target.minimumValue !== null
          ? `≥ ${number.format(target.minimumValue)}`
          : target.maximumValue !== null
            ? `≤ ${number.format(target.maximumValue)}`
            : target.targetMode;
    return `${target.metricKey.replaceAll("_", " ")}: ${values}`;
  }).join(" · ") || set.targetMode;
}

function actualText(set: WorkoutHistoryExerciseSetDetail, number: Intl.NumberFormat): string {
  const values = [
    set.weightKg === null ? null : `${number.format(set.weightKg)} kg`,
    set.reps === null ? null : `${number.format(set.reps)} reps`,
    ...set.metrics
      .filter((metric) => !["external_load_kg", "repetitions"].includes(metric.metricKey))
      .map((metric) => `${metric.metricKey.replaceAll("_", " ")}: ${number.format(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`),
    ...set.segments.flatMap((segment) => segment.metrics.map((metric) =>
      `${segment.segmentKind} ${metric.metricKey.replaceAll("_", " ")}: ${number.format(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`)),
  ].filter((value): value is string => Boolean(value));
  return values.join(" × ");
}

export function SetHistoryRow({ set }: { set: WorkoutHistoryExerciseSetDetail }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3" data-set-history-row>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{tr("historySetNumber", { count: set.setNumber })}</p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {set.setType ? <span className="rounded-full bg-muted px-2 py-1">{tr("historySetTypeLabel")}: {set.setType}</span> : null}
          {set.rpe !== null ? <span className="rounded-full bg-muted px-2 py-1"><bdi dir="ltr">{tr("historyRpeLabel")}: {number.format(set.rpe)}</bdi></span> : null}
          {set.rir !== null ? <span className="rounded-full bg-muted px-2 py-1"><bdi dir="ltr">{tr("historyRirLabel")}: {number.format(set.rir)}</bdi></span> : null}
        </div>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {set.plannedSet ? (
          <div className="rounded-lg bg-muted/40 p-2.5">
            <dt className="text-[11px] font-medium text-muted-foreground">{tr("historyPlannedTarget")}</dt>
            <dd className="mt-1 text-sm text-foreground"><bdi dir="ltr">{plannedText(set.plannedSet, number)}</bdi></dd>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/40 p-2.5 text-sm text-muted-foreground">{tr("historyUnplannedSet")}</div>
        )}
        <div className="rounded-lg bg-muted/40 p-2.5">
          <dt className="text-[11px] font-medium text-muted-foreground">{tr("historyActualResult")}</dt>
          <dd className="mt-1 text-sm font-medium text-foreground"><bdi dir="ltr">{actualText(set, number) || tr("historyNoMetric")}</bdi></dd>
        </div>
      </dl>
      {set.notes ? <p className="mt-3 border-s-2 border-primary/30 ps-3 text-sm leading-6 text-muted-foreground">{set.notes}</p> : null}
    </div>
  );
}
