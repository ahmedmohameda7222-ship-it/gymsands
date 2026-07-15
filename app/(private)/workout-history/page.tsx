"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutHistory } from "@/components/workouts/workout-history";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";

export default function WorkoutHistoryPage() {
  const { dir, tr } = useTrainTranslation();
  return (
    <TrainPageContainer className="space-y-6" dir={dir}>
      <PageHeading title={tr("workoutHistory")} description={tr("workoutHistoryDescription")} />
      <WorkoutHistory />
    </TrainPageContainer>
  );
}
