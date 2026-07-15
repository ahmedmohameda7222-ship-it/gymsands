"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";

export default function WorkoutsPage() {
  const { dir, tr } = useTrainTranslation();
  return (
    <TrainPageContainer className="space-y-6" dir={dir}>
      <PageHeading title={tr("exerciseLibrary")} description={tr("browseExercisesDescription")} />
      <div className="space-y-6">
        <WorkoutBrowser />
      </div>
    </TrainPageContainer>
  );
}
