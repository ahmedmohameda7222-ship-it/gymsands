"use client";

import { ExerciseDetailPageFrame } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { ExercisePerformancePageContent } from "@/components/exercise-detail/exercise-performance-v2";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

export default function ExercisePerformancePage() {
  const { state, resolved, userId } = useExerciseDetail();
  const { ed } = useExerciseDetailTranslation();
  return <ExerciseDetailPageFrame child="performance" title={ed("performanceTitle")}>
    {state === "ready" && resolved && userId ? <ExercisePerformancePageContent identity={resolved.core.identity.performance} /> : null}
  </ExerciseDetailPageFrame>;
}
