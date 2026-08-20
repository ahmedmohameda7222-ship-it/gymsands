"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Heart, MoreHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ExerciseMoreDialog } from "@/components/exercise-detail/exercise-more-dialog";
import { Button } from "@/components/ui/button";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useDetailPlatformPresentation } from "@/lib/exercise-detail/presentation";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { cn } from "@/lib/utils";
import { useExerciseDetail } from "./exercise-detail-provider";

export function DetailSurface({ children, className, ariaLabelledby }: { children: ReactNode; className?: string; ariaLabelledby?: string }) {
  return <section aria-labelledby={ariaLabelledby} className={cn("rounded-2xl border bg-card px-4 py-5 shadow-none sm:px-5 sm:py-6 lg:px-6", className)}>{children}</section>;
}

export function DetailGroupTitle({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="text-xl font-semibold tracking-tight sm:text-[22px]">{children}</h2>;
}

export function DetailRowLink({ href, title, supporting }: { href: string; title: string; supporting?: string | null }) {
  return <Link href={href} className="flex min-h-14 items-center justify-between gap-4 py-3 outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <span><span className="font-medium">{title}</span>{supporting ? <span className="mt-0.5 block text-sm text-muted-foreground">{supporting}</span> : null}</span>
    <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
  </Link>;
}

export function DetailMetric({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}

export function ExerciseDetailPageFrame({ children, child, title, description }: {
  children: ReactNode;
  child?: "anatomy" | "technique" | "performance" | "alternatives" | "details";
  title?: string;
  description?: string | null;
}) {
  const { state, resolved, retry, childHref, backHref, favorite, favoritePending, toggleFavorite, userId } = useExerciseDetail();
  const { dir, ed } = useExerciseDetailTranslation();
  const platform = useDetailPlatformPresentation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (state !== "ready" || !resolved) {
    return <TrainPageContainer className="max-w-[1080px] py-4" dir={dir} data-detail-platform={platform}>
      {state === "loading" ? <div className="space-y-5" role="status" aria-label={ed("loading")}><div className="h-11 w-32 animate-pulse rounded-xl bg-muted" /><div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" /><div className="h-44 animate-pulse rounded-2xl bg-muted" /></div> : <div className="mx-auto max-w-xl py-20 text-center"><h1 className="text-3xl font-semibold">{state === "not_found" ? ed("notFound") : ed("coreFailed")}</h1><p className="mt-3 text-muted-foreground">{state === "not_found" ? ed("notFoundDescription") : ed("coreFailed")}</p><div className="mt-6 flex justify-center gap-3">{state === "failed" ? <Button onClick={retry}>{ed("retry")}</Button> : null}<Button asChild variant="outline"><Link href={backHref}>{ed("backShort")}</Link></Button></div></div>}
    </TrainPageContainer>;
  }

  const exercise = resolved.core;
  const topBackHref = child ? childHref() : backHref;
  return <TrainPageContainer className="max-w-[1080px] pb-24 pt-2 sm:py-5" dir={dir} data-detail-platform={platform}>
    <nav aria-label={ed("backShort")} className={cn("sticky top-0 z-20 -mx-2 flex min-h-14 items-center justify-between gap-2 bg-background/95 px-2 supports-[backdrop-filter]:bg-background/90 sm:static sm:mx-0 sm:bg-transparent sm:px-0", platform === "android" && "rounded-b-xl", platform === "ios" && "rounded-b-2xl")}>
      <Button asChild variant="ghost" className="min-h-11 px-2"><Link href={topBackHref}><ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /><span>{child ? ed("overviewTitle") : ed("backShort")}</span></Link></Button>
      {userId ? <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={favorite ? ed("saved") : ed("favorite")} aria-pressed={favorite} aria-busy={favoritePending} disabled={favoritePending} onClick={() => void toggleFavorite()}><Heart className={cn("h-5 w-5", favorite && "fill-current")} /></Button><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={ed("more")} onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button></div> : null}
    </nav>
    {title ? <header className="pb-6 pt-4"><p className="text-sm text-muted-foreground">{exercise.name}</p><h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground sm:text-base">{description}</p> : null}</header> : null}
    <div>{children}</div>
    {userId ? <ExerciseMoreDialog open={moreOpen} onOpenChange={setMoreOpen} userId={userId} exerciseId={exercise.identity.activityId} exerciseName={exercise.name} customExercise={exercise.identity.source === "custom"} /> : null}
  </TrainPageContainer>;
}
