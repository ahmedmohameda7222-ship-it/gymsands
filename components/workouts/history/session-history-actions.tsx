"use client";

import { RepeatWorkoutReview } from "@/components/workouts/history/repeat-workout-review";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryCapabilities } from "@/types/workout-history";

export function SessionHistoryActions({
  capabilities,
  sessionId,
  title,
  freshAuthority,
}: {
  capabilities: WorkoutHistoryCapabilities;
  sessionId: string;
  title: string;
  freshAuthority: boolean;
}) {
  const { tr } = useTrainTranslation();
  if (!freshAuthority || !capabilities.repeatWorkout) return null;
  return (
    <section
      className="grid gap-2"
      aria-label={tr("historyMoreActions")}
      data-session-history-actions
    >
      <RepeatWorkoutReview sessionId={sessionId} title={title} />
    </section>
  );
}
