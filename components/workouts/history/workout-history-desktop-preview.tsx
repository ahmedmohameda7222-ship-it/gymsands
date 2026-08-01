"use client";

import Link from "next/link";
import { CalendarRange, ChevronRight, Clock3, Dumbbell, Layers3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WorkoutHistorySummary } from "@/components/workouts/history/workout-history-summary";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryDateRange } from "@/lib/workouts/history/date-range";
import type { WorkoutHistoryListSummary, WorkoutHistorySessionSummary } from "@/types/workout-history";

export function WorkoutHistoryDesktopPreview({
  item,
  summary,
  range,
  periodDays,
}: {
  item: WorkoutHistorySessionSummary | null;
  summary: WorkoutHistoryListSummary;
  range: WorkoutHistoryDateRange;
  periodDays: number;
}) {
  const { locale, tr } = useTrainTranslation();
  const rangeFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: range.timezone,
  });
  if (!item) {
    return (
      <aside className="sticky top-24 space-y-4 rounded-[20px] border border-border/70 bg-card p-4 shadow-sm" aria-labelledby="history-period-context" data-workout-history-desktop-preview>
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" aria-hidden="true" />
          <h2 id="history-period-context" className="text-sm font-semibold text-foreground">{tr("historyPeriodContext")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {rangeFormatter.format(new Date(range.from))} – {rangeFormatter.format(new Date(Date.parse(range.to) - 1))}
        </p>
        <WorkoutHistorySummary summary={summary} periodDays={periodDays} compact />
        <p className="text-sm leading-6 text-muted-foreground">{tr("historyNoPreviewSelection")}</p>
      </aside>
    );
  }
  const detailId = item.canonicalSessionId ?? item.scheduledSessionId;
  const detailHref = detailId
    ? `/workout-history/${encodeURIComponent(detailId)}${item.sourceKind === "scheduled_fallback" ? "?source=scheduled" : ""}`
    : "/workout-history";
  const metrics = [
    item.durationMinutes === null ? null : { icon: Clock3, label: tr("historyDurationMetric"), value: tr("historyMinutesShort", { count: item.durationMinutes }) },
    item.completedSetCount === null ? null : { icon: Layers3, label: tr("historySetsMetric"), value: String(item.completedSetCount) },
    item.exerciseCount === null ? null : { icon: Dumbbell, label: tr("historyExercisesMetric"), value: String(item.exerciseCount) },
  ].filter((metric): metric is { icon: typeof Clock3; label: string; value: string } => Boolean(metric));

  return (
    <aside className="sticky top-24 space-y-4 rounded-[20px] border border-border/70 bg-card p-5 shadow-sm" aria-labelledby="history-selected-workout" data-workout-history-desktop-preview>
      <div>
        <p className="text-xs font-medium text-primary">{tr("historySelectedWorkout")}</p>
        <h2 id="history-selected-workout" className="mt-1 text-lg font-semibold text-foreground">{item.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: range.timezone }).format(new Date(item.effectiveAt))}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div key={label} className="min-w-0 rounded-xl bg-muted/40 p-2.5">
            <dt className="flex items-center gap-1 text-[10px] text-muted-foreground"><Icon className="size-3" aria-hidden="true" /><span className="truncate">{label}</span></dt>
            <dd className="mt-1 text-sm font-semibold text-foreground"><bdi dir="ltr">{value}</bdi></dd>
          </div>
        ))}
      </dl>
      {item.exerciseNames.length ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{tr("historyMusclePreview")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.exerciseNames.slice(0, 3).map((name) => (
              <span key={name} className="max-w-full truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{name}</span>
            ))}
          </div>
        </div>
      ) : null}
      {item.insight ? <p className="rounded-xl bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">{item.insight}</p> : null}
      <Button asChild className="w-full min-h-11">
        <Link href={detailHref}>{tr("historyOpenFullDetails")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" /></Link>
      </Button>
    </aside>
  );
}
