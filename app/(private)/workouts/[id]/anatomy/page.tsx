"use client";

import { ExerciseAnatomyRoleList, ExerciseAnatomyVisualization, exerciseAnatomyAnalysis } from "@/components/exercise-detail/exercise-anatomy";
import { ExerciseDetailPageFrame, DetailGroupTitle, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

export default function ExerciseAnatomyPage() {
  const { state, resolved } = useExerciseDetail();
  const { ed } = useExerciseDetailTranslation();
  const exercise = state === "ready" ? resolved?.core ?? null : null;
  const analysis = exercise ? exerciseAnatomyAnalysis(exercise) : null;
  return <ExerciseDetailPageFrame child="anatomy" title={ed("anatomyTitle")}>
    {exercise ? analysis ? <DetailSurface className="overflow-hidden" ariaLabelledby="anatomy-visualization"><div data-anatomy-workspace className="grid gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(270px,0.75fr)] lg:gap-8">
      <section><DetailGroupTitle id="anatomy-visualization">{ed("anatomyTitle")}</DetailGroupTitle><div className="mt-5"><ExerciseAnatomyVisualization exercise={exercise} /></div></section>
      <aside className="border-t border-border/70 pt-6 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0" aria-labelledby="anatomy-roles"><DetailGroupTitle id="anatomy-roles">{ed("target")}</DetailGroupTitle><div className="mt-5"><ExerciseAnatomyRoleList exercise={exercise} /></div></aside>
    </div></DetailSurface> : <DetailSurface ariaLabelledby="anatomy-roles-text"><DetailGroupTitle id="anatomy-roles-text">{ed("target")}</DetailGroupTitle><div className="mt-5"><ExerciseAnatomyRoleList exercise={exercise} /></div></DetailSurface> : null}
  </ExerciseDetailPageFrame>;
}
