"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Heart, MoreHorizontal, Play, Plus } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { AddToPlanDialog } from "@/components/exercise-detail/add-to-plan-dialog";
import { ExerciseAnatomy, exerciseAnatomyAnalysis } from "@/components/exercise-detail/exercise-anatomy";
import { ExerciseMedia } from "@/components/exercise-detail/exercise-media";
import { ExerciseMoreDialog } from "@/components/exercise-detail/exercise-more-dialog";
import { ExercisePerformance } from "@/components/exercise-detail/exercise-performance";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { addToPlanActivityPayload } from "@/lib/exercise-detail/model";
import { validatedActiveWorkoutReturnTo } from "@/lib/workouts/active-workout-detail-navigation";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { cn } from "@/lib/utils";
import { CatalogClientError } from "@/services/activity-catalog/client";
import { getExerciseVideos, getUserExerciseVideo } from "@/services/database/workout-library";
import { loadExerciseAlternatives, resolveExerciseDetail, type ResolvedExerciseDetail } from "@/services/exercise-detail/client";
import { getFavoriteExerciseIdsWithStatus, setFavoriteExercise } from "@/services/workouts/exercise-library-store";
import type { ExerciseVideo } from "@/types";

type Secondary<T> = { kind: "loading" | "ready" | "failed"; data: T };

export default function WorkoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = validatedActiveWorkoutReturnTo(searchParams.get("returnTo"));
  const backHref = returnTo ?? "/workouts";
  const { user } = useAuth();
  const { toast } = useToast();
  const { dir, locale, ed } = useExerciseDetailTranslation();
  const [core, setCore] = useState<ResolvedExerciseDetail | null>(null);
  const [coreState, setCoreState] = useState<"loading" | "failed" | "not_found">("loading");
  const [favorites, setFavorites] = useState<Secondary<string[]>>({ kind: "loading", data: [] });
  const [favoritePending, setFavoritePending] = useState(false);
  const [alternatives, setAlternatives] = useState<Secondary<Awaited<ReturnType<typeof loadExerciseAlternatives>>>>({ kind: "loading", data: [] });
  const [videos, setVideos] = useState<Secondary<ExerciseVideo[]>>({ kind: "loading", data: [] });
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const loadCore = useCallback(() => {
    setCoreState("loading");
    setCore(null);
    void resolveExerciseDetail(params.id, user?.id, locale).then((resolved) => {
      setCore(resolved);
      setCustomVideoUrl(resolved.initialCustomVideoUrl);
    }).catch((error) => setCoreState(error instanceof CatalogClientError && error.status === 404 ? "not_found" : "failed"));
  }, [locale, params.id, user?.id]);
  useEffect(loadCore, [loadCore]);

  useEffect(() => {
    if (!user?.id) { setFavorites({ kind: "ready", data: [] }); return; }
    let active = true;
    setFavorites({ kind: "loading", data: [] });
    void getFavoriteExerciseIdsWithStatus(user.id).then((result) => active && setFavorites({ kind: "ready", data: result.data })).catch(() => active && setFavorites({ kind: "failed", data: [] }));
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!core) return;
    let active = true;
    setAlternatives({ kind: "loading", data: [] });
    void loadExerciseAlternatives(core, locale).then((data) => active && setAlternatives({ kind: "ready", data })).catch(() => active && setAlternatives({ kind: "failed", data: [] }));
    return () => { active = false; };
  }, [core, locale]);

  useEffect(() => {
    if (!core) return;
    let active = true;
    if (core.core.identity.source === "custom") {
      setVideos({ kind: "ready", data: [] });
      return () => { active = false; };
    }
    setVideos({ kind: "loading", data: [] });
    void getExerciseVideos(core.core.name, locale).then((data) => active && setVideos({ kind: "ready", data })).catch(() => active && setVideos({ kind: "failed", data: [] }));
    if (user?.id) {
      void getUserExerciseVideo(user.id, core.core.identity.activityId).then((video) => active && setCustomVideoUrl(video?.custom_video_url ?? null)).catch(() => undefined);
    }
    return () => { active = false; };
  }, [core, locale, user?.id]);

  const favorite = core ? favorites.data.includes(core.core.identity.activityId) : false;
  async function toggleFavorite() {
    if (!core || !user?.id || favoritePending) return;
    const previous = favorites.data;
    const next = favorite ? previous.filter((id) => id !== core.core.identity.activityId) : [...previous, core.core.identity.activityId];
    setFavoritePending(true); setFavorites({ kind: "ready", data: next });
    try { setFavorites({ kind: "ready", data: await setFavoriteExercise(user.id, core.core.identity.activityId, !favorite) }); }
    catch { setFavorites({ kind: "failed", data: previous }); toast({ title: ed("favoriteFailed") }); }
    finally { setFavoritePending(false); }
  }

  if (!core) {
    if (coreState === "loading") return <ExerciseProfileSkeleton label={ed("loading")} />;
    return <TrainPageContainer className="max-w-[1040px] py-4" dir={dir}><div className="mx-auto max-w-xl py-20 text-center"><h1 className="text-2xl font-semibold">{coreState === "not_found" ? ed("notFound") : ed("coreFailed")}</h1><p className="mt-3 text-muted-foreground">{coreState === "not_found" ? ed("notFoundDescription") : ed("coreFailed")}</p><div className="mt-6 flex justify-center gap-3">{coreState === "failed" ? <Button onClick={loadCore}>{ed("retry")}</Button> : null}<Button asChild variant="outline"><Link href={backHref}>{ed("back")}</Link></Button></div></div></TrainPageContainer>;
  }

  const exercise = core.core;
  const displayVideo = videos.data[0] ?? null;
  const mediaUrl = customVideoUrl ?? displayVideo?.video_url ?? exercise.sourceVideoUrl;
  const guideUrl = exercise.guideUrl ?? displayVideo?.exercise_url ?? null;
  const visibleAlternatives = showAllAlternatives ? alternatives.data : alternatives.data.slice(0, 3);
  const metadata = [exercise.activityType ?? exercise.identity.domain, exercise.equipment.join(", "), exercise.difficulty].filter(Boolean);
  const addPayload = addToPlanActivityPayload(core);
  const anatomyAnalysis = exercise.target.anatomyAvailable ? exerciseAnatomyAnalysis(exercise) : null;

  return <TrainPageContainer className="max-w-[1040px] py-2 sm:py-4" dir={dir}>
    <Button asChild variant="ghost" className="min-h-11 px-0 hover:bg-transparent"><Link href={backHref}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ed("back")}</Link></Button>
    <header className="mt-5 border-b pb-7 sm:flex sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{exercise.name}</h1>{exercise.shortDescription ? <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{exercise.shortDescription}</p> : null}{metadata.length ? <p className="mt-3 text-sm text-muted-foreground">{metadata.map((item, index) => <span key={String(item)}>{index ? " · " : ""}<bdi>{item}</bdi></span>)}</p> : null}</div>
      <div className="mt-5 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
        {exercise.startHref ? <Button asChild className="min-h-12"><Link href={exercise.startHref}><Play className="h-4 w-4" />{ed("start")}</Link></Button> : null}
        {user?.id ? <Button type="button" variant="outline" className="min-h-12" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />{ed("addPlan")}</Button> : null}
        {user?.id ? <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={favorite ? ed("saved") : ed("favorite")} aria-pressed={favorite} aria-busy={favoritePending} onClick={toggleFavorite} disabled={favoritePending}><Heart className={cn("h-5 w-5", favorite && "fill-current")} /></Button> : null}
        {user?.id ? <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={ed("more")} onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button> : null}
      </div>
    </header>

    {exercise.target.kind !== "none" ? <section className="py-8" aria-labelledby="exercise-target-heading"><h2 id="exercise-target-heading" className="text-xl font-semibold tracking-tight">{ed("target")}</h2><div className={cn("mt-5", anatomyAnalysis && "grid gap-8 md:grid-cols-[3fr_2fr]")}><dl className="space-y-5">{exercise.target.primary.length ? <Term label={ed("primary")} values={exercise.target.primary} /> : null}{exercise.target.secondary.length ? <Term label={ed("secondary")} values={exercise.target.secondary} /> : null}{exercise.target.focus.length ? <Term label={ed("focus")} values={exercise.target.focus} /> : null}</dl>{anatomyAnalysis ? <ExerciseAnatomy exercise={exercise} analysis={anatomyAnalysis} /> : null}</div></section> : null}

    {(exercise.instructions.length || exercise.instructionProse || guideUrl) ? <section className="border-t py-8" aria-labelledby="exercise-instructions-heading"><h2 id="exercise-instructions-heading" className="text-xl font-semibold tracking-tight">{ed("how")}</h2>{exercise.instructions.length ? <ol className="mt-5 space-y-4">{exercise.instructions.map((step, index) => <li key={`${step.order}-${index}`} className="grid grid-cols-[2rem_1fr] gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">{index + 1}</span><p className="pt-1 leading-7">{step.text}</p></li>)}</ol> : exercise.instructionProse ? <p className="mt-5 max-w-3xl whitespace-pre-line leading-7 text-muted-foreground">{exercise.instructionProse}</p> : null}{guideUrl ? <Button asChild variant="ghost" className="mt-5 min-h-11 px-0 hover:bg-transparent"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{ed("guide")}</a></Button> : null}</section> : null}

    {exercise.stablePerformanceIdentity ? <ExercisePerformance identity={exercise.stablePerformanceIdentity} /> : null}

    {(exercise.movementPattern || exercise.forceType) ? <section className="border-t py-8" aria-labelledby="exercise-details-heading"><h2 id="exercise-details-heading" className="text-xl font-semibold tracking-tight">{ed("details")}</h2><dl className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">{exercise.movementPattern ? <Metric label={ed("movement")} value={exercise.movementPattern} /> : null}{exercise.forceType ? <Metric label={ed("force")} value={exercise.forceType} /> : null}</dl></section> : null}

    {alternatives.kind === "failed" ? <section className="border-t py-8"><h2 className="text-xl font-semibold">{ed("alternatives")}</h2><div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">{ed("alternativesUnavailable")}</p><Button variant="outline" className="min-h-11" onClick={() => { setAlternatives({ kind: "loading", data: [] }); void loadExerciseAlternatives(core, locale).then((data) => setAlternatives({ kind: "ready", data })).catch(() => setAlternatives({ kind: "failed", data: [] })); }}>{ed("retry")}</Button></div></section> : alternatives.kind === "ready" && alternatives.data.length ? <section className="border-t py-8" aria-labelledby="exercise-alternatives-heading"><h2 id="exercise-alternatives-heading" className="text-xl font-semibold tracking-tight">{ed("alternatives")}</h2><div className="mt-4 divide-y">{visibleAlternatives.map((item) => { const target = item.activity.coverage.find((entry) => entry.role === "primary")?.name; const equipment = item.activity.equipment.map((entry) => entry.name ?? entry.slug).filter(Boolean).join(", "); return <Link key={item.activity.id} href={`/workouts/${item.activity.id}`} className="flex min-h-16 items-center justify-between gap-4 py-3 hover:text-primary"><span><span className="font-medium">{item.activity.name}</span>{target || equipment ? <span className="mt-1 block text-sm text-muted-foreground">{[target, equipment].filter(Boolean).join(" · ")}</span> : null}</span><ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" /></Link>; })}</div>{alternatives.data.length > 3 && !showAllAlternatives ? <Button type="button" variant="ghost" className="mt-3 min-h-11 px-0 hover:bg-transparent" onClick={() => setShowAllAlternatives(true)}>{ed("allAlternatives")}</Button> : null}</section> : null}

    {mediaUrl ? <ExerciseMedia name={exercise.name} url={mediaUrl} /> : null}
    {user?.id ? <><AddToPlanDialog open={addOpen} onOpenChange={setAddOpen} userId={user.id} activity={addPayload} fields={exercise.prescription?.fields ?? []} /><ExerciseMoreDialog open={moreOpen} onOpenChange={setMoreOpen} userId={user.id} exerciseId={exercise.identity.activityId} exerciseName={exercise.name} customExercise={exercise.identity.source === "custom"} currentUrl={customVideoUrl} onSaved={setCustomVideoUrl} /></> : null}
  </TrainPageContainer>;
}

function ExerciseProfileSkeleton({ label }: { label: string }) {
  return <TrainPageContainer className="max-w-[1040px] py-4"><div className="sr-only" role="status">{label}</div><div className="h-11 w-48 animate-pulse rounded-xl bg-muted" /><div className="mt-7 border-b pb-8"><div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" /><div className="mt-4 h-5 w-1/2 animate-pulse rounded-lg bg-muted" /><div className="mt-6 flex gap-3"><div className="h-12 w-32 animate-pulse rounded-xl bg-muted" /><div className="h-12 w-32 animate-pulse rounded-xl bg-muted" /></div></div>{[1, 2, 3].map((item) => <div key={item} className="border-b py-8"><div className="h-6 w-40 animate-pulse rounded-lg bg-muted" /><div className="mt-5 h-20 w-full animate-pulse rounded-2xl bg-muted/70" /></div>)}</TrainPageContainer>;
}

function Term({ label, values }: { label: string; values: string[] }) { return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-base font-medium">{values.join(", ")}</dd></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
