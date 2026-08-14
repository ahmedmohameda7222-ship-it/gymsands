"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { HistoryFactList, type HistoryFact } from "@/components/workouts/history/history-fact-list";
import { useTrainTranslation } from "@/lib/i18n/train";
import { presentWorkoutMetric } from "@/lib/workouts/metric-presentation";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

export function WorkoutHistoryCard({ item }: { item: WorkoutHistorySessionSummary; onSelect?: (item: WorkoutHistorySessionSummary) => void }) {
  const { locale, tr } = useTrainTranslation();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(item.effectiveAt));
  const detailId = item.canonicalSessionId ?? item.scheduledSessionId;
  const href = detailId
    ? item.sourceKind === "scheduled_fallback" ? `/workout-history/scheduled/${encodeURIComponent(detailId)}` : `/workout-history/${encodeURIComponent(detailId)}`
    : "/workout-history";
  const lifecycle = item.lifecycle === "partial" ? tr("historyPartial") : item.lifecycle === "skipped" ? tr("historySkipped") : item.lifecycle === "cancelled" ? tr("historyCancelled") : null;
  const semanticFacts: HistoryFact[] = item.resultKind === "semantic_metrics"
    ? (item.resultFacts ?? []).map((metric) => presentWorkoutMetric(metric, locale)).filter((fact): fact is { label: string; value: string } => Boolean(fact))
    : [];
  const hasSemanticActivityDuration = item.resultKind === "semantic_metrics"
    && (item.resultFacts ?? []).some((metric) => metric.metricKey === "duration_seconds" && Boolean(presentWorkoutMetric(metric, locale)));
  const facts: HistoryFact[] = [
    item.durationMinutes === null || hasSemanticActivityDuration ? null : { label: tr("historyDurationMetric"), value: tr("historyMinutesShort", { count: item.durationMinutes }) },
    ...(item.resultKind === "strength_sets" ? [
      item.completedSetCount === null ? null : { label: tr("historyCompletedSetsMetric"), value: number.format(item.completedSetCount) },
      item.exerciseCount === null ? null : { label: tr("historyExercisesMetric"), value: number.format(item.exerciseCount) },
    ] : semanticFacts),
    (item.verifiedRecordCount ?? 0) > 0 ? { label: tr("historyVerifiedRecord"), value: number.format(item.verifiedRecordCount ?? 0) } : null,
  ].filter((fact): fact is HistoryFact => Boolean(fact));

  return (
    <article className="group border-b border-border/70" data-workout-history-row>
      <Link href={href} className="flex min-h-20 items-center gap-3 py-3 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none" aria-label={`${tr("historyOpenDetails")}: ${item.title}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold leading-5 text-foreground">{item.title}</h3>
            <span className="text-xs text-muted-foreground">{time}</span>
            {lifecycle ? <span className="text-xs font-semibold text-warning">{lifecycle}</span> : null}
          </div>
          {facts.length ? <p className="mt-1.5 text-sm text-muted-foreground"><HistoryFactList facts={facts} /></p> : <p className="mt-1.5 text-sm text-muted-foreground">{tr("historyLimitedResults")}</p>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
      </Link>
    </article>
  );
}
