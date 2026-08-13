"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import { HistoryFactList, type HistoryFact } from "@/components/workouts/history/history-fact-list";
import {
  formatWorkoutMetricValue,
  presentWorkoutMetric,
  presentWorkoutPersonalRecord,
  presentWorkoutTarget,
  workoutSegmentLabel,
  workoutSetTypeLabel,
} from "@/lib/workouts/metric-presentation";
import type { WorkoutHistoryExerciseSetDetail } from "@/types/workout-history";

export function SetHistoryRow({ set }: { set: WorkoutHistoryExerciseSetDetail }) {
  const { locale, tr } = useTrainTranslation();
  const actual = [
    set.weightKg === null ? null : { value: formatWorkoutMetricValue("external_load_kg", set.weightKg, locale) },
    set.reps === null ? null : { value: formatWorkoutMetricValue("repetitions", set.reps, locale) },
    ...set.metrics.filter((metric) => !["external_load_kg", "repetitions"].includes(metric.metricKey)).map((metric) => presentWorkoutMetric(metric, locale)),
    ...set.segments.flatMap((segment) => {
      const segmentLabel = workoutSegmentLabel(segment.segmentKind, locale);
      return segment.metrics.map((metric) => {
        const presented = presentWorkoutMetric(metric, locale);
        return segmentLabel && presented ? { label: `${segmentLabel} · ${presented.label}`, value: presented.value } : null;
      });
    }),
  ].flatMap((value): HistoryFact[] => value?.value ? [value as HistoryFact] : []);
  const planned = set.plannedSet?.targets.map((target) => presentWorkoutTarget(target, locale)).filter((target): target is { label: string; value: string } => Boolean(target)) ?? [];
  const setType = workoutSetTypeLabel(set.setType, locale);

  return (
    <div className="border-b border-border/60 py-4 last:border-b-0" data-set-history-row>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{tr("historySetNumber", { count: set.setNumber })}</p>
        {setType ? <p className="text-xs text-muted-foreground">{setType}</p> : null}
      </div>
      <dl className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{tr("historyActualResult")}</dt>
          <dd className="mt-0.5 text-base font-semibold text-foreground">{actual.length ? <HistoryFactList facts={actual} separator=" · " /> : tr("historyNoMetric")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{tr("historyPlannedTarget")}</dt>
          <dd className="mt-0.5 text-sm text-muted-foreground">{planned.length ? <HistoryFactList facts={planned} separator=" · " /> : tr("historyUnplannedSet")}</dd>
        </div>
      </dl>
      {set.rpe !== null || set.rir !== null ? <p className="mt-2 text-xs text-muted-foreground"><HistoryFactList separator=" · " facts={[set.rpe === null ? null : { label: tr("historyRpeLabel"), value: set.rpe }, set.rir === null ? null : { label: tr("historyRirLabel"), value: set.rir }].flatMap((fact): HistoryFact[] => fact ? [fact] : [])} /></p> : null}
      {set.verifiedRecords.length ? (
        <div className="mt-3 space-y-2 border-s-2 border-primary/40 ps-3" aria-label={tr("historyVerifiedRecord")}>
          {set.verifiedRecords.map((record) => {
            const presented = "event" in record
              ? presentWorkoutPersonalRecord(record, locale)
              : {
                  label: record.recordType === "highest_load" ? tr("historyHighestLoadRecord") : record.recordType === "same_load_max_repetitions" ? tr("historySameLoadRepsRecord") : record.recordType === "estimated_one_rep_max" ? tr("historyEstimatedOneRepMaxRecord") : tr("historySessionVolumeRecord"),
                  value: record.unit === "repetitions" ? formatWorkoutMetricValue("repetitions", record.currentValue, locale)! : formatWorkoutMetricValue("external_load_kg", record.currentValue, locale)!,
                  previous: record.previousValue === null ? null : record.unit === "repetitions" ? formatWorkoutMetricValue("repetitions", record.previousValue, locale) : formatWorkoutMetricValue("external_load_kg", record.previousValue, locale),
                };
            const key = "event" in record ? record.event.eventId : record.id;
            return <div key={key}><p className="text-xs font-semibold text-primary">{presented.label}</p><p className="text-sm font-semibold text-foreground"><bdi dir="ltr">{presented.value}</bdi></p>{presented.previous ? <p className="text-xs text-muted-foreground">{tr("historyPreviousComparable", { value: presented.previous })}</p> : null}</div>;
          })}
        </div>
      ) : null}
      {set.notes ? <p className="mt-3 border-s-2 border-border ps-3 text-sm leading-6 text-muted-foreground">{set.notes}</p> : null}
    </div>
  );
}
