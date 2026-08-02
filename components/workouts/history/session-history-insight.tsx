"use client";

import { CheckCircle2 } from "lucide-react";

import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

export function SessionHistoryInsight({ detail }: { detail: WorkoutHistorySessionDetailResponse }) {
  const { tr } = useTrainTranslation();
  if (detail.summary.completedSetCount === null || detail.summary.completedSetCount < 1) return null;
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-label={tr("historyPrimaryHighlight")} data-session-history-insight>
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">{tr("historyPrimaryHighlight")}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{tr("historySavedSetsHighlight", { count: detail.summary.completedSetCount })}</p>
      </div>
    </section>
  );
}
