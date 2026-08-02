"use client";

import Link from "next/link";
import { ChevronRight, Clock3, Dumbbell, Layers3, Trophy } from "lucide-react";

import { useTrainTranslation } from "@/lib/i18n/train";
import { cn } from "@/lib/utils";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

export function WorkoutHistoryCard({ item, selected = false, onSelect }: { item: WorkoutHistorySessionSummary; selected?: boolean; onSelect?: (item: WorkoutHistorySessionSummary) => void }) {
  const { locale, tr } = useTrainTranslation();
  const date = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }).format(new Date(item.effectiveAt));
  const detailId = item.canonicalSessionId ?? item.scheduledSessionId;
  const href = detailId
    ? item.sourceKind === "scheduled_fallback"
      ? `/workout-history/scheduled/${encodeURIComponent(detailId)}`
      : `/workout-history/${encodeURIComponent(detailId)}`
    : "/workout-history";
  const lifecycle = item.lifecycle === "partial"
    ? tr("historyPartial")
    : item.lifecycle === "skipped"
      ? tr("historySkipped")
      : item.lifecycle === "cancelled"
        ? tr("historyCancelled")
        : null;
  const metrics = [
    item.durationMinutes === null ? null : {
      icon: Clock3,
      label: tr("historyDurationMetric"),
      value: tr("historyMinutesShort", { count: item.durationMinutes }),
    },
    item.completedSetCount === null ? null : {
      icon: Layers3,
      label: tr("historySetsMetric"),
      value: String(item.completedSetCount),
    },
    item.exerciseCount === null ? null : {
      icon: Dumbbell,
      label: tr("historyExercisesMetric"),
      value: String(item.exerciseCount),
    },
  ].filter((metric): metric is { icon: typeof Clock3; label: string; value: string } => Boolean(metric)).slice(0, 3);

  return (
    <article className={cn("group relative min-h-[158px] overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-sm transition motion-reduce:transition-none hover:border-primary/30 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/40", selected && "border-primary/50 ring-2 ring-primary/20")} data-workout-history-card data-selected={selected || undefined}>
      <Link
        href={href}
        className="flex min-h-[158px] flex-col p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-label={`${selected ? `${tr("historySelectedWorkout")}: ` : ""}${tr("historyOpenDetails")}: ${item.title}`}
        onClick={(event) => {
          if (onSelect && window.matchMedia("(min-width: 1024px)").matches) {
            event.preventDefault();
            onSelect(item);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-semibold leading-5 text-foreground">{item.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{date}</p>
          </div>
          {lifecycle ? (
            <span className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              item.lifecycle === "skipped" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
            )}>
              {lifecycle}
            </span>
          ) : null}
        </div>

        {metrics.length ? (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {metrics.map(({ icon: Icon, label, value }) => (
              <div key={label} className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-2">
                <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Icon className="size-3" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </dt>
                <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground"><bdi dir="ltr">{value}</bdi></dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {(item.verifiedRecordCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <Trophy className="size-3" aria-hidden="true" />
                {item.verifiedRecordCount === 1
                  ? tr("historyPrCountOne")
                  : tr("historyPrCount", { count: item.verifiedRecordCount ?? 0 })}
              </span>
            ) : null}
            {item.category ? <span className="max-w-40 truncate rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{item.category}</span> : null}
            {item.exerciseNames.slice(0, 2).map((name) => (
              <span key={name} className="max-w-32 truncate rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{name}</span>
            ))}
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
        </div>
      </Link>
    </article>
  );
}
