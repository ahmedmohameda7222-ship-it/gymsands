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
  const platform = useDetailPlatformPresentation();
  return <section
    data-detail-surface
    data-detail-surface-platform={platform}
    aria-labelledby={ariaLabelledby}
    className={cn(
      "border border-black/[0.065] bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.055)] dark:border-white/10 dark:shadow-black/25",
      platform === "ios" && "rounded-[20px] px-4 py-4 sm:px-5 sm:py-5",
      platform === "android" && "rounded-2xl px-4 py-5 sm:px-5 sm:py-5",
      platform === "web" && "rounded-[22px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7",
      className,
    )}
  >{children}</section>;
}

export function DetailGroupTitle({ id, children }: { id?: string; children: ReactNode }) {
  const platform = useDetailPlatformPresentation();
  return <h2 id={id} className={cn(
    "font-semibold tracking-tight",
    platform === "ios" && "text-[17px] sm:text-xl",
    platform === "android" && "text-xl",
    platform === "web" && "text-xl sm:text-[22px]",
  )}>{children}</h2>;
}

export function DetailRowLink({ href, title, supporting }: { href: string; title: string; supporting?: string | null }) {
  const platform = useDetailPlatformPresentation();
  return <Link href={href} className={cn(
    "flex items-center justify-between gap-4 outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    platform === "ios" ? "min-h-12 py-2.5" : "min-h-14 py-3",
  )}>
    <span><span className="font-medium">{title}</span>{supporting ? <span className="mt-0.5 block text-sm text-muted-foreground">{supporting}</span> : null}</span>
    <ArrowRight className={cn("shrink-0 rtl:rotate-180", platform === "ios" ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
  </Link>;
}

export function DetailMetric({ label, value }: { label: string; value: ReactNode }) {
  return <div data-detail-metric><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
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
  return <TrainPageContainer className="max-w-[1180px] pb-24 pt-2 sm:py-5" dir={dir} data-detail-platform={platform}>
    <nav aria-label={ed("backShort")} data-exercise-detail-topbar className={cn(
      "sticky top-0 z-20 -mx-2 flex items-center justify-between gap-2 bg-[#f5f6f4]/95 px-2 backdrop-blur-md dark:bg-[#11130f]/95 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none",
      platform === "ios" && "min-h-12 border-b border-border/50 sm:border-b-0",
      platform === "android" && "min-h-16 border-b border-border/60 sm:border-b-0",
      platform === "web" && "min-h-14",
    )}>
      <Button asChild variant="ghost" className={cn(
        "min-h-11",
        platform === "ios" && "px-1 text-primary hover:bg-transparent",
        platform === "android" && "rounded-full px-3",
        platform === "web" && "px-2",
      )}><Link href={topBackHref}><ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /><span>{child ? ed("overviewTitle") : ed("backShort")}</span></Link></Button>
      {userId ? <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" className={cn("min-h-11 min-w-11", platform === "android" && "rounded-full")} aria-label={favorite ? ed("saved") : ed("favorite")} aria-pressed={favorite} aria-busy={favoritePending} disabled={favoritePending} onClick={() => void toggleFavorite()}><Heart className={cn("h-5 w-5", favorite && "fill-current")} /></Button><Button type="button" variant="ghost" size="icon" className={cn("min-h-11 min-w-11", platform === "android" && "rounded-full")} aria-label={ed("more")} onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button></div> : null}
    </nav>
    {title ? <header className={cn("pb-7 pt-4 sm:pt-6", platform === "ios" && "px-1")}><p className="text-sm font-medium text-muted-foreground">{exercise.name}</p><h1 className={cn("mt-1.5 font-semibold leading-[1.08] tracking-[-0.025em]", platform === "ios" ? "text-[30px] sm:text-[36px]" : "text-[32px] sm:text-[38px]")}>{title}</h1>{description ? <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted-foreground sm:text-base">{description}</p> : null}</header> : null}
    <div>{children}</div>
    {userId ? <ExerciseMoreDialog open={moreOpen} onOpenChange={setMoreOpen} userId={userId} exerciseId={exercise.identity.activityId} exerciseName={exercise.name} customExercise={exercise.identity.source === "custom"} /> : null}
  </TrainPageContainer>;
}
