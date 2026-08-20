"use client";

import { ExerciseDetailPageFrame, DetailGroupTitle, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { ExerciseSetupNoteEditor } from "@/components/exercise-detail/exercise-setup-note";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

function AuthorityList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return <section><h3 className="font-medium">{title}</h3><ul className="mt-2 space-y-2 text-[15px] leading-6 text-muted-foreground">{values.map((value, index) => <li key={`${title}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{value}</span></li>)}</ul></section>;
}

export default function ExerciseTechniquePage() {
  const { state, resolved, userId } = useExerciseDetail();
  const { ed } = useExerciseDetailTranslation();
  const exercise = state === "ready" ? resolved?.core ?? null : null;
  if (!exercise) return <ExerciseDetailPageFrame child="technique" title={ed("techniqueTitle")} />;
  const form = exercise.formAuthority;
  const hasForm = form.setup.length || form.techniqueCues.length || form.commonMistakes.length || form.safety.length;
  return <ExerciseDetailPageFrame child="technique" title={ed("techniqueTitle")}>
    <div className="space-y-5">
      <DetailSurface ariaLabelledby="technique-how"><DetailGroupTitle id="technique-how">{ed("how")}</DetailGroupTitle>{exercise.instructions.length ? <ol className="mt-4 space-y-4">{exercise.instructions.map((step, index) => <li key={`${step.order}-${index}`} className="grid grid-cols-[1.75rem_1fr] gap-2 text-[15px] leading-6"><span className="text-muted-foreground">{index + 1}.</span><span>{step.text}</span></li>)}</ol> : exercise.instructionProse ? <p className="mt-4 max-w-3xl whitespace-pre-line text-[15px] leading-7">{exercise.instructionProse}</p> : <p className="mt-4 text-sm text-muted-foreground">{ed("unavailable")}</p>}</DetailSurface>
      {hasForm ? <DetailSurface ariaLabelledby="technique-form"><DetailGroupTitle id="technique-form">{ed("formSetup")}</DetailGroupTitle><div className="mt-4 space-y-5"><AuthorityList title={ed("setup")} values={form.setup} /><AuthorityList title={ed("techniqueCues")} values={form.techniqueCues} /><AuthorityList title={ed("commonMistakes")} values={form.commonMistakes} /><AuthorityList title={ed("safety")} values={form.safety} /></div></DetailSurface> : null}
      {userId ? <DetailSurface ariaLabelledby="technique-personal-setup"><DetailGroupTitle id="technique-personal-setup">{ed("mySetupNote")}</DetailGroupTitle><div className="mt-4"><ExerciseSetupNoteEditor userId={userId} identity={exercise.identity.performance} /></div></DetailSurface> : null}
    </div>
  </ExerciseDetailPageFrame>;
}
