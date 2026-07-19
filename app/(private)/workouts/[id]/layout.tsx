import type { ReactNode } from "react";

import { ExerciseDetailMusclePreview } from "@/components/workouts/exercise-detail-muscle-preview";

export default function WorkoutDetailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ExerciseDetailMusclePreview />
    </>
  );
}
