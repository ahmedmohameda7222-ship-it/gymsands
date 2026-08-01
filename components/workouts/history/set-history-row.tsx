"use client";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryExerciseSetDetail, WorkoutHistoryPlannedSet } from "@/types/workout-history";

function recordLabel(record: WorkoutHistoryExerciseSetDetail["verifiedRecords"][number], tr: ReturnType<typeof useTrainTranslation>["tr"]): string {
  if (record.recordType === "highest_load") return tr("historyHighestLoadRecord");
  if (record.recordType === "same_load_max_repetitions") return tr("historySameLoadRepsRecord");
  if (record.recordType === "estimated_one_rep_max") return tr("historyEstimatedOneRepMaxRecord");
  return tr("historySessionVolumeRecord");
}

function recordValue(value: number, unit: WorkoutHistoryExerciseSetDetail["verifiedRecords"][number]["unit"], number: Intl.NumberFormat): string {
  if (unit === "repetitions") return `${number.format(value)} reps`;
  if (unit === "kg_repetitions") return `${number.format(value)} kg × reps`;
  return `${number.format(value)} kg`;
}

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
      {set.verifiedRecords.length ? (
        <div className="mt-3 space-y-2" aria-label={tr("historyVerifiedRecord")}>
          {set.verifiedRecords.map((record) => (
            <div key={record.id} className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-primary">{recordLabel(record, tr)}</p>
                <p className="text-sm font-semibold text-foreground"><bdi dir="ltr">{recordValue(record.currentValue, record.unit, number)}</bdi></p>
              </div>
              {record.previousValue !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {tr("historyPreviousComparable", { value: recordValue(record.previousValue, record.unit, number) })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {set.notes ? <p className="mt-3 border-s-2 border-primary/30 ps-3 text-sm leading-6 text-muted-foreground">{set.notes}</p> : null}
    </div>
  );
}
