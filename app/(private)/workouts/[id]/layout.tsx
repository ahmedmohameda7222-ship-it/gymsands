import type { ReactNode } from "react";
import { ExerciseDetailProvider } from "@/components/exercise-detail/exercise-detail-provider";

export default function WorkoutDetailLayout({ children }: { children: ReactNode }) {
  return <ExerciseDetailProvider><div data-exercise-detail-backdrop className="min-h-full bg-[#f5f6f4] dark:bg-[#11130f]">{children}</div></ExerciseDetailProvider>;
}
