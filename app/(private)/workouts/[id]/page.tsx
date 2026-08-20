"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddToPlanDialog } from "@/components/exercise-detail/add-to-plan-dialog";
import { ExerciseAnatomyVisualization } from "@/components/exercise-detail/exercise-anatomy";
import { ExerciseDetailPageFrame, DetailGroupTitle, DetailRowLink, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { ExercisePerformancePreview } from "@/components/exercise-detail/exercise-performance-v2";
import { Button } from "@/components/ui/button";
import { addToPlanActivityPayload } from "@/lib/exercise-detail/model";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

export default function ExerciseDetailOverviewPage() {
  const { state, resolved, childHref, planContext, userId } = useExerciseDetail();
  const { ed } = useExerciseDetailTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const addPayload = useMemo(() => resolved ? addToPlanActivityPayload(resolved) : null, [resolved]);

  return <ExerciseDetailPageFrame>{state === "ready" && resolved ? <>
    <header className="pb-6 pt-4">
      <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[32px]">{resolved.core.name}</h1>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {resolved.core.activityType ? <span>{resolved.core.activityType}</span> : null}
        {resolved.core.difficulty ? <span>{resolved.core.difficulty}</span> : null}
        {resolved.core.equipment.length ? <span>{resolved.core.equipment.map((item) => item.name).join(", ")}</span> : null}
      </div>
      {resolved.core.shortDescription ? <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted-foreground sm:text-base">{resolved.core.shortDescription}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {resolved.core.execution.executable && resolved.core.execution.startHref ? <Button asChild className="min-h-11"><Link href={resolved.core.execution.startHref}>{ed("start")}</Link></Button> : null}
        {userId && addPayload ? <Button type="button" variant={resolved.core.execution.executable ? "outline" : "default"} className="min-h-11" onClick={() => setAddOpen(true)}>{ed("addPlan")}</Button> : null}
      </div>
    </header>

    {planContext ? <aside className="mb-5 border-s-2 border-primary/30 ps-4" aria-label={ed("planSection")}><p className="font-medium">{ed("planSection")}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{planContext.planName} · {planContext.dayName}</span>{planContext.sets !== null ? <span>{ed("sets")}: {planContext.sets}</span> : null}{planContext.reps ? <span>{ed("reps")}: {planContext.reps}</span> : null}{planContext.restSeconds !== null ? <span>{ed("rest")}: {ed("seconds", { value: planContext.restSeconds })}</span> : null}</div>{planContext.note ? <p className="mt-2 text-sm">{planContext.note}</p> : null}</aside> : null}

    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <DetailSurface ariaLabelledby="overview-target"><DetailGroupTitle id="overview-target">{ed("target")}</DetailGroupTitle><div className="mt-4 grid gap-4 sm:grid-cols-[minmax(140px,220px)_1fr] sm:items-start"><ExerciseAnatomyVisualization exercise={resolved.core} compact /><div className="space-y-4">{resolved.core.target.primary.length ? <div><h3 className="text-sm font-medium">{ed("primary")}</h3><p className="mt-1 text-sm text-muted-foreground">{resolved.core.target.primary.join(", ")}</p></div> : null}{resolved.core.target.secondary.length ? <div><h3 className="text-sm font-medium">{ed("secondary")}</h3><p className="mt-1 text-sm text-muted-foreground">{resolved.core.target.secondary.join(", ")}</p></div> : null}{resolved.core.target.stabilizer.length ? <div><h3 className="text-sm font-medium">{ed("stabilizers")}</h3><p className="mt-1 text-sm text-muted-foreground">{resolved.core.target.stabilizer.join(", ")}</p></div> : null}</div></div><div className="mt-4 border-t"><DetailRowLink href={childHref("anatomy")} title={ed("fullAnatomy")} /></div></DetailSurface>

      <DetailSurface ariaLabelledby="overview-how"><DetailGroupTitle id="overview-how">{ed("how")}</DetailGroupTitle>{resolved.core.instructions.length ? <ol className="mt-4 space-y-3">{resolved.core.instructions.slice(0, 3).map((step, index) => <li key={`${step.order}-${index}`} className="grid grid-cols-[1.5rem_1fr] gap-2 text-[15px] leading-6"><span className="text-muted-foreground">{index + 1}.</span><span>{step.text}</span></li>)}</ol> : resolved.core.instructionProse ? <p className="mt-4 text-[15px] leading-6">{resolved.core.instructionProse}</p> : <p className="mt-4 text-sm text-muted-foreground">{ed("unavailable")}</p>}<div className="mt-4 border-t"><DetailRowLink href={childHref("technique")} title={ed("techniqueSetup")} /></div></DetailSurface>

      {userId ? <ExercisePerformancePreview identity={resolved.core.identity.performance} href={childHref("performance")} /> : <DetailSurface ariaLabelledby="overview-performance"><DetailGroupTitle id="overview-performance">{ed("performance")}</DetailGroupTitle><p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p><div className="mt-3 border-t"><DetailRowLink href={childHref("performance")} title={ed("performanceTitle")} /></div></DetailSurface>}

      <DetailSurface ariaLabelledby="overview-navigation"><DetailGroupTitle id="overview-navigation">{ed("details")}</DetailGroupTitle><div className="mt-2 divide-y"><DetailRowLink href={childHref("alternatives")} title={ed("alternativesTitle")} /><DetailRowLink href={childHref("details")} title={ed("detailsTitle")} /></div></DetailSurface>
    </div>

    {userId && addPayload ? <AddToPlanDialog open={addOpen} onOpenChange={setAddOpen} userId={userId} activity={addPayload} fields={resolved.core.prescription?.fields ?? []} /> : null}
  </> : null}</ExerciseDetailPageFrame>;
}
