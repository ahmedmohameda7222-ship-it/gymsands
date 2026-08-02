"use client";

import { Disclosure } from "@/components/ui/disclosure";
import { useTrainTranslation, type TrainKey } from "@/lib/i18n/train";
import type { WorkoutHistoryTimelineEntry } from "@/types/workout-history";

const timelineKeys: Record<WorkoutHistoryTimelineEntry["type"], TrainKey> = {
  workout_started: "historyTimelineStarted",
  set_completed: "historyTimelineSetCompleted",
  set_corrected: "historyTimelineSetCorrected",
  exercise_replaced: "historyTimelineExerciseReplaced",
  workout_completed: "historyTimelineCompleted",
};

export function SessionHistoryTimeline({ entries, timezone }: { entries: WorkoutHistoryTimelineEntry[]; timezone: string }) {
  const { locale, tr } = useTrainTranslation();
  if (!entries.length) return null;
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  return (
    <div data-session-history-timeline>
      <Disclosure
        title={tr("historyTimelineTitle")}
        description={tr("historyTimelineDescription")}
        toggleLabel={tr("historyTimelineTitle")}
        className="rounded-[18px]"
      >
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <time className="tabular-nums text-muted-foreground" dateTime={entry.occurredAt}><bdi dir="ltr">{time.format(new Date(entry.occurredAt))}</bdi></time>
              <p className="text-foreground">{tr(timelineKeys[entry.type])}{entry.exerciseName ? <span className="text-muted-foreground"> · {entry.exerciseName}</span> : null}</p>
            </li>
          ))}
        </ol>
      </Disclosure>
    </div>
  );
}
