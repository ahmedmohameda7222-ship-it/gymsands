import type { ReactNode } from "react";
import { ExerciseDetailProvider } from "@/components/exercise-detail/exercise-detail-provider";

export default function WorkoutDetailLayout({ children }: { children: ReactNode }) {
  return <ExerciseDetailProvider>{children}</ExerciseDetailProvider>;
}
