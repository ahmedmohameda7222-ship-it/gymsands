"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddToPlanDialog } from "@/components/exercise-detail/add-to-plan-dialog";
import { ExerciseAnatomyRoleList, ExerciseAnatomyVisualization } from "@/components/exercise-detail/exercise-anatomy";
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
    <header data-exercise-detail-hero className="grid gap-6 pb-7 pt-4 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[42px]">{resolved.core.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
          {resolved.core.activityType ? <span className="rounded-full border border-border/70 bg-card px-3 py-1.5">{resolved.core.activityType}</span> : null}
          {resolved.core.difficulty ? <span className="rounded-full border border-border/70 bg-card px-3 py-1.5">{resolved.core.difficulty}</span> : null}
          {resolved.core.equipment.length ? <span className="rounded-full border border-border/70 bg-card px-3 py-1.5">{resolved.core.equipment.map((item) => item.name).join(", ")}</span> : null}
        </div>
        {resolved.core.shortDescription ? <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted-foreground sm:text-base">{resolved.core.shortDescription}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {resolved.core.execution.executable && resolved.core.execution.startHref ? <Button asChild className="min-h-11"><Link href={resolved.core.execution.startHref}>{ed("start")}</Link></Button> : null}
        {userId && addPayload ? <Button type="button" variant={resolved.core.execution.executable ? "outline" : "default"} className="min-h-11" onClick={() => setAddOpen(true)}>{ed("addPlan")}</Button> : null}
      </div>
    </header>

    {planContext ? <DetailSurface className="mb-5 border-primary/20 bg-primary/[0.035]" ariaLabelledby="overview-plan"><p id="overview-plan" className="font-semibold">{ed("planSection")}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{planContext.planName} · {planContext.dayName}</span>{planContext.sets !== null ? <span>{ed("sets")}: {planContext.sets}</span> : null}{planContext.reps ? <span>{ed("reps")}: {planContext.reps}</span> : null}{planContext.restSeconds !== null ? <span>{ed("rest")}: {ed("seconds", { value: planContext.restSeconds })}</span> : null}</div>{planContext.note ? <p className="mt-2 text-sm">{planContext.note}</p> : null}</DetailSurface> : null}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-start">
      <DetailSurface className="overflow-hidden" ariaLabelledby="overview-target"><div data-overview-anatomy><DetailGroupTitle id="overview-target">{ed("target")}</DetailGroupTitle><div className="mt-5 grid gap-5 sm:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)] sm:items-start"><ExerciseAnatomyVisualization exercise={resolved.core} compact /><ExerciseAnatomyRoleList exercise={resolved.core} compact /></div><div className="mt-5 border-t"><DetailRowLink href={childHref("anatomy")} title={ed("fullAnatomy")} /></div></div></DetailSurface>

      <DetailSurface ariaLabelledby="overview-how"><DetailGroupTitle id="overview-how">{ed("how")}</DetailGroupTitle>{resolved.core.instructions.length ? <ol className="mt-4 space-y-3">{resolved.core.instructions.slice(0, 3).map((step, index) => <li key={`${step.order}-${index}`} className="grid grid-cols-[1.5rem_1fr] gap-2 text-[15px] leading-6"><span className="text-muted-foreground">{index + 1}.</span><span>{step.text}</span></li>)}</ol> : resolved.core.instructionProse ? <p className="mt-4 text-[15px] leading-6">{resolved.core.instructionProse}</p> : <p className="mt-4 text-sm text-muted-foreground">{ed("unavailable")}</p>}<div className="mt-4 border-t"><DetailRowLink href={childHref("technique")} title={ed("techniqueSetup")} /></div></DetailSurface>

      {userId ? <ExercisePerformancePreview identity={resolved.core.identity.performance} href={childHref("performance")} /> : <DetailSurface ariaLabelledby="overview-performance"><DetailGroupTitle id="overview-performance">{ed("performance")}</DetailGroupTitle><p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p><div className="mt-3 border-t"><DetailRowLink href={childHref("performance")} title={ed("performanceTitle")} /></div></DetailSurface>}

      <DetailSurface ariaLabelledby="overview-navigation"><DetailGroupTitle id="overview-navigation">{ed("details")}</DetailGroupTitle><div className="mt-2 divide-y"><DetailRowLink href={childHref("alternatives")} title={ed("alternativesTitle")} /><DetailRowLink href={childHref("details")} title={ed("detailsTitle")} /></div></DetailSurface>
    </div>

    {userId && addPayload ? <AddToPlanDialog open={addOpen} onOpenChange={setAddOpen} userId={userId} activity={addPayload} fields={resolved.core.prescription?.fields ?? []} /> : null}
  </> : null}</ExerciseDetailPageFrame>;
}
