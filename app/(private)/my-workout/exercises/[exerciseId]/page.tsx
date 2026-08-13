"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ExerciseMedia } from "@/components/exercise-detail/exercise-media";
import { ExercisePerformance } from "@/components/exercise-detail/exercise-performance";
import { Button } from "@/components/ui/button";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { planExerciseDetailModel } from "@/lib/exercise-detail/model";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { getUserWorkoutPlanExerciseDetail } from "@/services/database/workout-plans";

type RawDetail = NonNullable<Awaited<ReturnType<typeof getUserWorkoutPlanExerciseDetail>>>;

export default function PlanExerciseDetailsPage() {
  const params = useParams<{ exerciseId: string }>();
  const { user } = useAuth();
  const { dir, locale, ed } = useExerciseDetailTranslation();
  const [raw, setRaw] = useState<RawDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "not_found">("loading");
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setState("loading");
    void getUserWorkoutPlanExerciseDetail(user.id, params.exerciseId).then((value) => {
      if (!active) return;
      if (!value) setState("not_found"); else { setRaw(value); setState("ready"); }
    }).catch(() => active && setState("failed"));
    return () => { active = false; };
  }, [params.exerciseId, user?.id]);
  const detail = useMemo(() => raw ? planExerciseDetailModel(raw, locale) : null, [locale, raw]);

  if (!detail) {
    if (state === "loading") return <PlanProfileSkeleton label={ed("loading")} />;
    return <TrainPageContainer className="max-w-[1040px] py-4" dir={dir}><div className="mx-auto max-w-lg py-20 text-center"><h1 className="text-2xl font-semibold">{state === "not_found" ? ed("notFound") : ed("coreFailed")}</h1><p className="mt-3 text-muted-foreground">{ed("notFoundDescription")}</p><Button asChild variant="outline" className="mt-6"><Link href="/my-workout/plans">{ed("backPlan")}</Link></Button></div></TrainPageContainer>;
  }

  const stableIdentity = detail.sourceWorkoutId ? `global:${detail.sourceWorkoutId}` : null;
  return <TrainPageContainer className="max-w-[1040px] py-2 sm:py-4" dir={dir}>
    <Button asChild variant="ghost" className="min-h-11 px-0 hover:bg-transparent"><Link href={`/my-workout/plans/${detail.planId}?day=${encodeURIComponent(detail.dayId)}`}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ed("backPlan")}</Link></Button>
    <header className="mt-5 border-b pb-7"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{detail.name}</h1>{[detail.category, detail.equipment].filter(Boolean).length ? <p className="mt-3 text-sm text-muted-foreground">{[detail.category, detail.equipment].filter(Boolean).join(" · ")}</p> : null}</header>
    <section className="py-8" aria-labelledby="plan-context-heading"><div className="rounded-2xl bg-muted/50 p-5 sm:p-6"><h2 id="plan-context-heading" className="text-xl font-semibold">{ed("planSection")}</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Metric label={ed("plan")} value={detail.planName} /><Metric label={ed("day")} value={detail.dayName} />{detail.prescription.map((item) => <Metric key={item.label} label={ed(item.label)} value={item.label === "rest" ? ed("seconds", { value: item.value }) : item.value} />)}</dl>{detail.note ? <div className="mt-5 border-t pt-5"><p className="text-sm text-muted-foreground">{ed("note")}</p><p className="mt-1 whitespace-pre-line leading-7">{detail.note}</p></div> : null}{detail.canonicalHref ? <Button asChild variant="ghost" className="mt-4 min-h-11 px-0 hover:bg-transparent"><Link href={detail.canonicalHref}>{ed("libraryExercise")}<ExternalLink className="h-4 w-4" /></Link></Button> : null}</div></section>
    {detail.targetMuscle || detail.secondaryMuscles.length ? <section className="border-t py-8" aria-labelledby="plan-target-heading"><h2 id="plan-target-heading" className="text-xl font-semibold">{ed("target")}</h2><dl className="mt-5 space-y-5">{detail.targetMuscle ? <Metric label={ed("primary")} value={detail.targetMuscle} /> : null}{detail.secondaryMuscles.length ? <Metric label={ed("secondary")} value={detail.secondaryMuscles.join(", ")} /> : null}</dl></section> : null}
    {detail.instructions || detail.guideUrl ? <section className="border-t py-8" aria-labelledby="plan-how-heading"><h2 id="plan-how-heading" className="text-xl font-semibold">{ed("how")}</h2>{detail.instructions ? <p className="mt-5 max-w-3xl whitespace-pre-line leading-7 text-muted-foreground">{detail.instructions}</p> : null}{detail.guideUrl ? <Button asChild variant="ghost" className="mt-4 min-h-11 px-0 hover:bg-transparent"><a href={detail.guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{ed("guide")}</a></Button> : null}</section> : null}
    {stableIdentity ? <ExercisePerformance identity={stableIdentity} /> : null}
    {detail.customVideoUrl ? <ExerciseMedia name={detail.name} url={detail.customVideoUrl} /> : null}
  </TrainPageContainer>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium"><bdi>{value}</bdi></dd></div>; }
function PlanProfileSkeleton({ label }: { label: string }) { return <TrainPageContainer className="max-w-[1040px] py-4"><span className="sr-only" role="status">{label}</span><div className="h-11 w-40 animate-pulse rounded-xl bg-muted" /><div className="mt-7 h-10 w-2/3 animate-pulse rounded-xl bg-muted" /><div className="mt-8 h-64 animate-pulse rounded-2xl bg-muted/70" /></TrainPageContainer>; }
