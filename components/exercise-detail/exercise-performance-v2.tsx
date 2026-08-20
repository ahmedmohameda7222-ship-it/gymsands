"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CanonicalExerciseIdentity } from "@/lib/exercise-detail/identity";
import type { ExercisePerformanceBest, ExercisePerformanceModel } from "@/lib/exercise-detail/performance";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { getExercisePerformance } from "@/services/exercise-detail/performance-client";
import { DetailGroupTitle, DetailRowLink, DetailSurface } from "./detail-ui";

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function labelForBest(key: ExercisePerformanceBest["key"], ed: ReturnType<typeof useExerciseDetailTranslation>["ed"]) {
  if (key === "highest_load") return ed("highestLoad");
  if (key === "estimated_one_rep_max") return ed("estimatedOneRm");
  if (key === "same_load_max_repetitions") return ed("sameLoadMaxReps");
  return ed("sessionVolume");
}

function formatBest(best: ExercisePerformanceBest, locale: string) {
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(best.event.value);
  const unit = best.event.definition.canonicalUnit;
  if (unit === "kg") return `${value} kg`;
  if (unit === "repetitions") return value;
  if (unit === "kg_repetitions") return `${value} kg·rep`;
  if (unit === "seconds") return `${value} s`;
  if (unit === "meters") return `${value} m`;
  return value;
}

function usePerformance(identity: CanonicalExerciseIdentity, limit: number) {
  const [data, setData] = useState<ExercisePerformanceModel | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void getExercisePerformance(identity, { limit, signal: controller.signal }).then((next) => {
      if (controller.signal.aborted) return;
      setData(next); setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("failed"); });
    return () => controller.abort();
  }, [identity, limit, generation]);
  return { data, state, retry: () => setGeneration((value) => value + 1) };
}

export function ExercisePerformancePreview({ identity, href }: { identity: CanonicalExerciseIdentity; href: string }) {
  const { locale, ed } = useExerciseDetailTranslation();
  const { data, state, retry } = usePerformance(identity, 1);
  return <DetailSurface ariaLabelledby="detail-performance-preview">
    <div className="flex items-center justify-between gap-3"><DetailGroupTitle id="detail-performance-preview">{ed("performance")}</DetailGroupTitle>{state === "failed" ? <Button type="button" variant="ghost" size="sm" onClick={retry}>{ed("retry")}</Button> : null}</div>
    {state === "loading" ? <div className="mt-4 h-14 animate-pulse rounded-xl bg-muted" role="status" aria-label={ed("loading")} /> : state === "failed" ? <p className="mt-3 text-sm text-muted-foreground">{ed("unavailablePerformance")}</p> : data?.performed ? <div className="mt-4 space-y-2"><p className="font-medium">{data.lastPerformedAt ? formatDate(data.lastPerformedAt, locale) : ed("noPerformance")}</p>{data.bests.slice(0, 2).map((best) => <p key={best.event.lineageId} className="text-sm text-muted-foreground">{labelForBest(best.key, ed)}: {formatBest(best, locale)}</p>)}</div> : <p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p>}
    <div className="mt-3 border-t"><DetailRowLink href={href} title={ed("performanceTitle")} /></div>
  </DetailSurface>;
}

export function ExercisePerformancePageContent({ identity }: { identity: CanonicalExerciseIdentity }) {
  const { locale, ed } = useExerciseDetailTranslation();
  const { data, state, retry } = usePerformance(identity, 8);
  const bests = useMemo(() => data?.bests ?? [], [data?.bests]);
  if (state === "loading") return <div className="space-y-5" role="status" aria-label={ed("loading")}><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>;
  if (state === "failed") return <DetailSurface><p className="text-sm text-muted-foreground">{ed("unavailablePerformance")}</p><Button type="button" className="mt-4" onClick={retry}>{ed("retry")}</Button></DetailSurface>;
  const last = data?.recentSessions[0] ?? null;
  return <div className="space-y-5">
    <DetailSurface ariaLabelledby="performance-last-workout"><DetailGroupTitle id="performance-last-workout">{ed("lastWorkout")}</DetailGroupTitle>{last ? <div className="mt-4 space-y-2"><p className="font-medium">{formatDate(last.effectiveAt, locale)}</p><p className="text-sm text-muted-foreground">{last.title}{last.completedSetCount !== null ? ` · ${new Intl.NumberFormat(locale).format(last.completedSetCount)} ${ed("sets")}` : ""}</p>{data?.recentWorkoutId ? <Button asChild variant="outline" className="mt-2 min-h-11"><Link href={`/workout-history/${encodeURIComponent(data.recentWorkoutId)}`}>{ed("viewSession")}</Link></Button> : null}</div> : <p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p>}</DetailSurface>
    <DetailSurface ariaLabelledby="performance-bests"><DetailGroupTitle id="performance-bests">{ed("personalBests")}</DetailGroupTitle>{bests.length ? <dl className="mt-4 divide-y">{bests.map((best) => <div key={best.event.lineageId} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"><dt className="font-medium">{labelForBest(best.key, ed)}</dt><dd className="text-xl font-semibold tabular-nums">{formatBest(best, locale)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p>}</DetailSurface>
    <DetailSurface ariaLabelledby="performance-recent-sessions"><DetailGroupTitle id="performance-recent-sessions">{ed("recentSessions")}</DetailGroupTitle>{data?.recentSessions.length ? <div className="mt-3 divide-y">{data.recentSessions.map((session) => <Link key={session.activityId} href={`/workout-history/${encodeURIComponent(session.canonicalSessionId ?? session.activityId)}`} className="flex min-h-14 items-center justify-between gap-4 py-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="font-medium">{session.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{formatDate(session.effectiveAt, locale)}</span></span><span aria-hidden="true">›</span></Link>)}</div> : <p className="mt-3 text-sm text-muted-foreground">{ed("noPerformance")}</p>}<div className="mt-3 grid gap-1 border-t pt-2"><DetailRowLink href="/workout-history" title={ed("allSessions")} /><DetailRowLink href="/personal-records" title={ed("personalRecords")} /></div></DetailSurface>
  </div>;
}
