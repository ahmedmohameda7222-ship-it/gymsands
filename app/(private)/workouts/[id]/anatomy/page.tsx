"use client";

import { ExerciseAnatomyVisualization, exerciseAnatomyAnalysis } from "@/components/exercise-detail/exercise-anatomy";
import { ExerciseDetailPageFrame, DetailGroupTitle, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

export default function ExerciseAnatomyPage() {
  const { state, resolved } = useExerciseDetail();
  const { ed } = useExerciseDetailTranslation();
  const exercise = state === "ready" ? resolved?.core ?? null : null;
  const analysis = exercise ? exerciseAnatomyAnalysis(exercise) : null;
  return <ExerciseDetailPageFrame child="anatomy" title={ed("anatomyTitle")}>
    {exercise ? <div className="space-y-5">
      {analysis ? <DetailSurface ariaLabelledby="anatomy-visualization"><DetailGroupTitle id="anatomy-visualization">{ed("anatomyTitle")}</DetailGroupTitle><div className="mt-5"><ExerciseAnatomyVisualization exercise={exercise} /></div></DetailSurface> : null}
      <DetailSurface ariaLabelledby="anatomy-roles"><DetailGroupTitle id="anatomy-roles">{ed("target")}</DetailGroupTitle><div className="mt-4 space-y-5" aria-label={ed("target")}>
        {exercise.target.primary.length ? <section><h3 className="font-medium">{ed("primary")}</h3><p className="mt-1 text-[15px] leading-6 text-muted-foreground">{exercise.target.primary.join(", ")}</p></section> : null}
        {exercise.target.secondary.length ? <section><h3 className="font-medium">{ed("secondary")}</h3><p className="mt-1 text-[15px] leading-6 text-muted-foreground">{exercise.target.secondary.join(", ")}</p></section> : null}
        {exercise.target.stabilizer.length ? <section><h3 className="font-medium">{ed("stabilizers")}</h3><p className="mt-1 text-[15px] leading-6 text-muted-foreground">{exercise.target.stabilizer.join(", ")}</p></section> : null}
        {!exercise.target.primary.length && !exercise.target.secondary.length && !exercise.target.stabilizer.length && exercise.target.focus.length ? <section><h3 className="font-medium">{ed("focus")}</h3><p className="mt-1 text-[15px] leading-6 text-muted-foreground">{exercise.target.focus.join(", ")}</p></section> : null}
      </div></DetailSurface>
    </div> : null}
  </ExerciseDetailPageFrame>;
}
