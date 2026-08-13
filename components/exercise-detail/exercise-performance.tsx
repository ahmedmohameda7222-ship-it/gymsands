"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CanonicalPersonalRecordEvent } from "@/lib/personal-records/contracts";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { getExercisePersonalRecords } from "@/services/personal-records/client";

type Performance = {
  performed: boolean;
  lastPerformedAt: string | null;
  highestLoad: CanonicalPersonalRecordEvent | null;
  estimatedOneRepMax: CanonicalPersonalRecordEvent | null;
  recentWorkoutId: string | null;
};

function value(event: CanonicalPersonalRecordEvent, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(event.value)} ${event.definition.canonicalUnit}`;
}

export function ExercisePerformance({ identity }: { identity: string }) {
  const { locale, ed } = useExerciseDetailTranslation();
  const [state, setState] = useState<{ kind: "loading" | "ready" | "failed"; data: Performance | null }>({ kind: "loading", data: null });
  const load = useCallback(() => {
    setState({ kind: "loading", data: null });
    void getExercisePersonalRecords(identity).then((data) => setState({ kind: "ready", data: data as Performance })).catch(() => setState({ kind: "failed", data: null }));
  }, [identity]);
  useEffect(load, [load]);
  return <section className="border-t pt-8" aria-labelledby="exercise-performance-heading"><h2 id="exercise-performance-heading" className="text-xl font-semibold tracking-tight">{ed("performance")}</h2>{state.kind === "loading" ? <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label={ed("loading")}><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-20 animate-pulse rounded-2xl bg-muted" /></div> : state.kind === "failed" ? <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">{ed("unavailablePerformance")}</p><Button type="button" variant="outline" className="min-h-11" onClick={load}>{ed("retry")}</Button></div> : !state.data?.performed ? <p className="mt-4 text-sm text-muted-foreground">{ed("noPerformance")}</p> : <div className="mt-5 space-y-5"><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">{state.data.lastPerformedAt ? <Metric label={ed("lastPerformed")} value={new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(state.data.lastPerformedAt))} /> : null}{state.data.highestLoad ? <Metric label={ed("highestLoad")} value={value(state.data.highestLoad, locale)} /> : null}{state.data.estimatedOneRepMax ? <Metric label={ed("estimatedOneRm")} value={value(state.data.estimatedOneRepMax, locale)} /> : null}</dl><Button asChild variant="ghost" className="min-h-11 px-0 hover:bg-transparent"><Link href={`/workout-history?exercise=${encodeURIComponent(identity)}`}>{ed("recentSessions")}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button></div>}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold"><bdi>{value}</bdi></dd></div>;
}
