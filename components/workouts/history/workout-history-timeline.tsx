"use client";

import { WorkoutHistoryCard } from "@/components/workouts/history/workout-history-card";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

function localDateKey(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(value);
}

export function WorkoutHistoryTimeline({ items, timezone, selectedId, onSelect }: { items: WorkoutHistorySessionSummary[]; timezone: string; selectedId?: string | null; onSelect?: (item: WorkoutHistorySessionSummary) => void }) {
  const { locale, tr } = useTrainTranslation();
  const now = new Date();
  const today = localDateKey(now, timezone);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate, timezone);
  const groups = new Map<string, WorkoutHistorySessionSummary[]>();
  for (const item of items) {
    const key = localDateKey(new Date(item.effectiveAt), timezone);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  // Preserve the server's newest-first logical order in both LTR and RTL. Direction mirrors
  // the presentation, never the chronology of the member's activity history.
  const fullDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });

  return (
    <div className="space-y-6" data-workout-history-timeline>
      {[...groups].map(([date, group]) => {
        const heading = date === today
          ? tr("historyToday")
          : date === yesterday
            ? tr("historyYesterday")
            : fullDate.format(new Date(`${date}T12:00:00.000Z`));
        return (
          <section key={date} aria-labelledby={`history-date-${date}`}>
            <div className="mb-2 flex items-center gap-3">
              <h2 id={`history-date-${date}`} className="shrink-0 text-sm font-semibold text-foreground">{heading}</h2>
              <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {group.map((item) => (
                <WorkoutHistoryCard
                  key={item.activityId}
                  item={item}
                  selected={selectedId === item.activityId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
