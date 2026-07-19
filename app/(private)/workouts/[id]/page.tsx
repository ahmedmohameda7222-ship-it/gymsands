"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Heart, Play, RotateCcw, Save, TrendingUp, ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { PageHeading } from "@/components/layout/page-heading";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";
import { getExerciseVideos, getUserExerciseVideo, getWorkout, getWorkoutAlternatives, resetUserExerciseVideo, upsertUserExerciseVideo } from "@/services/database/workout-library";
import { getWorkoutHistoryDetailed } from "@/services/database/workout-sessions";
import { getCustomExercisesWithStatus, getFavoriteExerciseIdsWithStatus, setFavoriteExercise } from "@/services/workouts/exercise-library-store";
import { findExerciseVideo } from "@/services/workouts/video-matching";
import { userSafeError } from "@/lib/error-formatting";
import { cn } from "@/lib/utils";
import { useTrainTranslation } from "@/lib/i18n/train";
import { formatExerciseDisplayList, formatExerciseDisplayValue } from "@/lib/train/exercise-display";
import type { ExerciseLog, ExerciseVideo, Workout, WorkoutSessionSummary } from "@/types";

function normalizeExerciseName(value: string) {
  return value.toLowerCase().replace(/^[a-z]\d\s*[:.)-]\s*/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function estimateOneRepMax(weightKg: number, reps: number) {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function exerciseLogsFor(history: WorkoutSessionSummary[], workout: Pick<Workout, "id" | "name">) {
  const target = normalizeExerciseName(workout.name);
  return history.flatMap((session) =>
    (session.exercise_logs ?? [])
      .filter((log) => {
        if (log.source_workout_id) return log.source_workout_id === workout.id;
        if (session.workout_id) return session.workout_id === workout.id;
        return normalizeExerciseName(log.exercise_name) === target;
      })
      .map((log) => ({ ...log, sessionDate: session.completed_at || session.started_at }))
  );
}

function buildExerciseHistory(logs: Array<ExerciseLog & { sessionDate: string }>) {
  const valid = logs.filter((log) => Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0);
  const bestWeight = Math.max(0, ...valid.map((log) => Number(log.weight_kg ?? 0)));
  const bestReps = Math.max(0, ...valid.map((log) => Number(log.reps ?? 0)));
  const bestOneRepMax = Math.max(0, ...valid.map((log) => estimateOneRepMax(Number(log.weight_kg ?? 0), Number(log.reps ?? 0))));
  const bestSet = [...valid].sort((a, b) => (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0)) - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0)))[0] ?? null;
  const volumeByDate = new Map<string, number>();
  const bestSetByDate = new Map<string, number>();
  const oneRmByDate = new Map<string, number>();

  valid.forEach((log) => {
    const date = log.sessionDate.slice(0, 10);
    const volume = Number(log.weight_kg ?? 0) * Number(log.reps ?? 0);
    const oneRm = estimateOneRepMax(Number(log.weight_kg ?? 0), Number(log.reps ?? 0));
    volumeByDate.set(date, (volumeByDate.get(date) ?? 0) + volume);
    bestSetByDate.set(date, Math.max(bestSetByDate.get(date) ?? 0, volume));
    oneRmByDate.set(date, Math.max(oneRmByDate.get(date) ?? 0, oneRm));
  });

  const trends = Array.from(volumeByDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, volume]) => ({
    date,
    volume: round(volume),
    bestSetVolume: round(bestSetByDate.get(date) ?? 0),
    estimatedOneRepMax: round(oneRmByDate.get(date) ?? 0)
  }));

  return { count: valid.length, bestWeight, bestReps, bestOneRepMax: round(bestOneRepMax), bestSet, trends };
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeExerciseName(a ?? "");
  const right = normalizeExerciseName(b ?? "");
  return Boolean(left && right && left === right);
}

function hasInvalidUrl(value: string | null | undefined) {
  const clean = value?.trim();
  return Boolean(clean && !/^https?:\/\/[^\s]+$/i.test(clean));
}

function metadataLine(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(" · ");
}

export default function WorkoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const { language, dir, locale, tr } = useTrainTranslation();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [video, setVideo] = useState<ExerciseVideo | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState("");
  const [customVideoDraft, setCustomVideoDraft] = useState("");
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadWarning, setLoadWarning] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [alternatives, setAlternatives] = useState<Workout[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isFavoritePending, setIsFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const [videoStatus, setVideoStatus] = useState<"idle" | "saving" | "saved" | "failed" | "reset">("idle");
  const [videoMessage, setVideoMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    setLoadWarning("");
    try {
      const warnings: string[] = [];
      const customResult = await getCustomExercisesWithStatus(userId);
      if (customResult.status.source === "degraded" && customResult.status.message) warnings.push(customResult.status.message);
      const customExercise = customResult.data.find((exercise) => exercise.id === params.id) ?? null;
      const nextWorkout = customExercise ?? await getWorkout(params.id, locale);
      const [videosResult, customVideoResult, historyResult, alternativesResult, favoritesResult] = await Promise.allSettled([
        getExerciseVideos(nextWorkout.name, locale),
        userId && !customExercise ? getUserExerciseVideo(userId, nextWorkout.id) : Promise.resolve(null),
        userId ? getWorkoutHistoryDetailed(userId, 150) : Promise.resolve([]),
        getWorkoutAlternatives(nextWorkout.id, 6, locale),
        getFavoriteExerciseIdsWithStatus(userId)
      ]);
      const videos = videosResult.status === "fulfilled" ? videosResult.value : [];
      if (videosResult.status === "rejected") warnings.push(tr("exerciseVideoLoadWarning"));
      const customVideo = customVideoResult.status === "fulfilled" ? customVideoResult.value : null;
      if (customVideoResult.status === "rejected") warnings.push(tr("customVideoLoadWarning"));
      const workoutHistory = historyResult.status === "fulfilled" ? historyResult.value : [];
      if (historyResult.status === "rejected") warnings.push(tr("exerciseHistoryLoadWarning"));
      const libraryAlternatives = alternativesResult.status === "fulfilled" ? alternativesResult.value.data : [];
      if (alternativesResult.status === "fulfilled" && alternativesResult.value.status.message) warnings.push(alternativesResult.value.status.message);
      if (alternativesResult.status === "rejected") warnings.push(tr("alternativesLoadWarning"));
      if (favoritesResult.status === "fulfilled") {
        setFavoriteIds(favoritesResult.value.data);
        if (favoritesResult.value.status.source === "degraded" && favoritesResult.value.status.message) warnings.push(favoritesResult.value.status.message);
      } else {
        warnings.push(tr("favoriteLoadWarning"));
        setFavoriteIds([]);
      }
      const localCustomAlternatives = customResult.data
        .filter((item) => item.id !== nextWorkout.id)
        .filter((item) => sameText(item.target_muscle, nextWorkout.target_muscle) || sameText(item.equipment, nextWorkout.equipment) || sameText(item.mechanics, nextWorkout.mechanics));
      const combinedAlternatives = [...localCustomAlternatives, ...libraryAlternatives]
        .filter((item) => item.id !== nextWorkout.id)
        .filter((item, index, all) => all.findIndex((match) => match.id === item.id) === index)
        .slice(0, 6);
      setWorkout(nextWorkout);
      setVideo(findExerciseVideo(nextWorkout, videos));
      setCustomVideoUrl(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
      setCustomVideoDraft(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
      setHistory(workoutHistory);
      setAlternatives(combinedAlternatives);
      setLoadWarning(Array.from(new Set(warnings)).join(" "));
    } catch (error) {
      const message = userSafeError(error, tr("workoutDetailsLoadFailed"));
      setLoadError(message);
      toast({ title: tr("couldNotLoadWorkout"), description: message });
    } finally {
      setIsLoading(false);
    }
  }, [locale, params.id, toast, tr, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exerciseHistory = useMemo(() => workout ? buildExerciseHistory(exerciseLogsFor(history, workout)) : null, [history, workout]);

  if (isLoading) return <CardSkeleton rows={7} />;

  if (loadError) {
    return (
      <ErrorState
        title={tr("planUnavailable")}
        description={loadError}
        onRetry={load}
        fallbackLabel={tr("exerciseLibrary")}
        fallbackHref="/workouts"
      />
    );
  }

  if (!workout) {
    return (
      <ErrorState
        title={tr("workoutNotFound")}
        description={tr("exerciseNotFoundDescription")}
        fallbackLabel={tr("exerciseLibrary")}
        fallbackHref="/workouts"
      />
    );
  }

  const guideUrl = workout.exercise_url || (workout.notes?.startsWith("http") ? workout.notes : video?.exercise_url);
  const videoUrl = customVideoUrl || null;
  const displayVideo = video
    ? { ...video, exercise_url: guideUrl ?? video.exercise_url, video_url: customVideoUrl || video.video_url }
    : videoUrl
      ? { id: workout.id, exercise_name: workout.name, category_type: workout.category, category: workout.target_muscle, exercise_url: guideUrl ?? "", video_url: customVideoUrl, instructions: workout.instructions, source: "user_custom", is_global: true }
      : null;
  const secondaryMuscles = workout.secondary_muscles ?? video?.secondary_muscles ?? [];
  const displayTarget = formatExerciseDisplayList(workout.muscle_category || workout.target_muscle, language, "muscle");
  const displayEquipment = formatExerciseDisplayList(workout.equipment_required || workout.equipment, language, "equipment");
  const displayDifficulty = formatExerciseDisplayValue(workout.experience_level || workout.difficulty, language, "difficulty");
  const displayMovement = formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics || workout.category, language, "movement");
  const displayForce = formatExerciseDisplayValue(workout.force_type, language, "force");
  const displaySecondary = formatExerciseDisplayList(secondaryMuscles, language, "muscle");
  const favorite = favoriteIds.includes(workout.id);
  const mistakes = workout.notes && !workout.notes.startsWith("http") && /mistake|avoid|form/i.test(workout.notes) ? workout.notes : tr("noneSaved");
  const customVideoInvalid = hasInvalidUrl(customVideoDraft);

  async function saveCustomVideo() {
    if (!workout) return;
    if (!userId) {
      const message = tr("customVideoSignIn");
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: tr("signInRequired"), description: message });
      return;
    }
    if (customVideoInvalid) {
      setVideoStatus("failed");
      setVideoMessage(tr("invalidCustomVideoUrl"));
      return;
    }
    try {
      setIsSavingVideo(true);
      setVideoStatus("saving");
      setVideoMessage("");
      const saved = await upsertUserExerciseVideo(userId, workout.id, customVideoDraft);
      setCustomVideoUrl(saved.custom_video_url);
      setCustomVideoDraft(saved.custom_video_url);
      setVideoStatus("saved");
      setVideoMessage(tr("customVideoSavedMessage"));
      toast({ title: tr("customVideoSavedTitle"), description: tr("customVideoSavedDescription") });
    } catch (error) {
      const message = userSafeError(error, tr("checkVideoLink"));
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: tr("customVideoSaveFailed"), description: message });
    } finally {
      setIsSavingVideo(false);
    }
  }

  async function resetCustomVideo() {
    if (!workout || !userId) return;
    try {
      setIsSavingVideo(true);
      setVideoStatus("saving");
      setVideoMessage("");
      await resetUserExerciseVideo(userId, workout.id);
      setCustomVideoUrl("");
      setCustomVideoDraft("");
      setVideoStatus("reset");
      setVideoMessage(tr("customVideoClearedMessage"));
      toast({ title: tr("customVideoClearedTitle"), description: tr("customVideoClearedDescription") });
    } catch (error) {
      const message = userSafeError(error, tr("customVideoResetFailedMessage"));
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: tr("customVideoResetFailedTitle"), description: message });
    } finally {
      setIsSavingVideo(false);
    }
  }

  async function toggleFavorite() {
    const currentWorkout = workout;
    if (!currentWorkout || isFavoritePending) return;
    const previousIds = favoriteIds;
    const nextFavorite = !favorite;
    const optimistic = nextFavorite
      ? Array.from(new Set([...favoriteIds, currentWorkout.id]))
      : favoriteIds.filter((id) => id !== currentWorkout.id);
    setIsFavoritePending(true);
    setFavoriteError("");
    setFavoriteIds(optimistic);
    try {
      const next = await setFavoriteExercise(userId, currentWorkout.id, nextFavorite);
      setFavoriteIds(next);
      toast({ title: nextFavorite ? tr("exerciseFavorited") : tr("exerciseUnfavorited"), description: currentWorkout.name });
    } catch (error) {
      const message = userSafeError(error, tr("favoriteRestoreMessage"));
      setFavoriteIds(previousIds);
      setFavoriteError(message);
      toast({ title: tr("favoriteNotSaved"), description: message });
    } finally {
      setIsFavoritePending(false);
    }
  }

  return (
    <TrainPageContainer className="space-y-6" dir={dir}>
      <PageHeading
        title={workout.name}
        description={metadataLine(displayTarget, displayEquipment, displayDifficulty)}
        action={
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-12" variant={favorite ? "default" : "outline"} onClick={toggleFavorite} disabled={isFavoritePending} aria-busy={isFavoritePending}>
              <Heart className={cn("h-4 w-4", favorite && "fill-current")} />
              {isFavoritePending ? tr("saving") : favorite ? tr("savedLabel") : tr("favorite")}
            </Button>
            <Button asChild className="min-h-12">
              <Link href={`/workouts/session/${workout.id}`}><Play className="h-4 w-4" /> {tr("startSession")}</Link>
            </Button>
          </div>
        }
      />
      {loadWarning ? <InlineStatus tone="warning" title={tr("degradedExerciseData")} description={loadWarning} /> : null}
      {favoriteError ? <InlineStatus tone="error" title={tr("favoriteNotSaved")} description={favoriteError} /> : null}
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{tr("details")}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {displayTarget ? <Badge>{displayTarget}</Badge> : null}
                {displayEquipment ? <Badge variant="outline">{displayEquipment}</Badge> : null}
                {displayDifficulty ? <Badge variant="outline">{displayDifficulty}</Badge> : null}
                {!workout.is_global ? <Badge variant="success">{tr("custom")}</Badge> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label={tr("primaryMuscle")} value={displayTarget || tr("noneSaved")} />
                <Detail label={tr("secondaryMuscle")} value={displaySecondary || tr("noneSaved")} />
                <Detail label={tr("equipment")} value={displayEquipment || tr("noneSaved")} />
                <Detail label={tr("mechanics")} value={displayMovement || tr("noneSaved")} />
                <Detail label={tr("forceType")} value={displayForce || tr("noneSaved")} />
                <Detail label={tr("difficulty")} value={displayDifficulty || tr("noneSaved")} />
              </div>

              <TextPanel title={tr("instructions")} text={video?.instructions || workout.instructions} fallback={tr("noneSaved")} />
              <TextPanel title={tr("mistakesToAvoid")} text={mistakes} fallback={tr("noneSaved")} />

              <div className="grid gap-2 sm:grid-cols-2">
                {guideUrl ? <Button asChild variant="outline" className="min-h-12"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {tr("openExerciseGuide")}</a></Button> : <Button type="button" variant="outline" className="min-h-12" disabled>{tr("noGuide")}</Button>}
                {customVideoUrl ? <Button asChild variant="outline" className="min-h-12"><a href={customVideoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {tr("openCustomVideo")}</a></Button> : <Button type="button" variant="outline" className="min-h-12" disabled>{tr("noCustomVideo")}</Button>}
              </div>

              <div className="rounded-md border p-3">
                <Label htmlFor="custom-video-url">{tr("customVideoUrl")}</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    id="custom-video-url"
                    value={customVideoDraft}
                    onChange={(event) => {
                      setCustomVideoDraft(event.target.value);
                      setVideoStatus("idle");
                      setVideoMessage("");
                    }}
                    placeholder="https://youtube.com/watch?v=..."
                    className="h-12"
                    aria-invalid={customVideoInvalid}
                  />
                  <Button type="button" className="min-h-12" onClick={saveCustomVideo} disabled={isSavingVideo || !customVideoDraft.trim() || customVideoInvalid}><Save className="h-4 w-4" /> {isSavingVideo && videoStatus === "saving" ? tr("saving") : tr("save")}</Button>
                  <Button type="button" variant="outline" className="min-h-12" onClick={resetCustomVideo} disabled={isSavingVideo || !customVideoUrl}><RotateCcw className="h-4 w-4" /> {tr("reset")}</Button>
                </div>
                {customVideoInvalid ? <p className="mt-2 text-sm leading-6 text-destructive">{tr("invalidCustomVideoUrl")}</p> : null}
                {videoMessage ? <InlineStatus className="mt-3" tone={videoStatus === "failed" ? "error" : "success"} title={videoStatus === "failed" ? tr("customVideoSaveFailed") : videoStatus === "reset" ? tr("customVideoClearedTitle") : tr("customVideoSavedTitle")} description={videoMessage} /> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> {tr("realWorkoutHistory")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!exerciseHistory?.count ? <p className="text-sm text-muted-foreground">{tr("noWorkoutHistory")}</p> : null}
              {exerciseHistory?.count ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Detail label={tr("bestWeight")} value={`${exerciseHistory.bestWeight} kg`} />
                    <Detail label={tr("bestReps")} value={`${exerciseHistory.bestReps}`} />
                    <Detail label={tr("estimatedOneRepMax")} value={`${exerciseHistory.bestOneRepMax} kg`} />
                  </div>
                  <Detail label={tr("bestSet")} value={exerciseHistory.bestSet ? `${exerciseHistory.bestSet.weight_kg ?? 0} kg × ${exerciseHistory.bestSet.reps ?? 0}` : tr("noSetData")} />
                  {exerciseHistory.trends.length < 2 ? <p className="text-sm text-muted-foreground">{tr("notEnoughHistory")}</p> : <div className="space-y-2">{exerciseHistory.trends.slice(-6).map((point) => <div key={point.date} className="rounded-md border p-3 text-sm"><p className="font-semibold">{point.date}</p><p className="text-muted-foreground">{point.volume} kg · {point.bestSetVolume} kg · 1RM {point.estimatedOneRepMax} kg</p></div>)}</div>}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{tr("alternativeExercises")}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {!alternatives.length ? <p className="text-sm text-muted-foreground">{tr("noAlternatives")}</p> : null}
              {alternatives.map((item) => {
                const metadata = metadataLine(formatExerciseDisplayList(item.target_muscle, language, "muscle"), formatExerciseDisplayList(item.equipment, language, "equipment"));
                return <Link key={item.id} href={`/workouts/${item.id}`} className="min-h-12 rounded-md border p-3 transition hover:border-primary"><p className="font-semibold">{item.name}</p>{metadata ? <p className="text-sm text-muted-foreground">{metadata}</p> : null}</Link>;
              })}
            </CardContent>
          </Card>
        </div>
        <ExerciseVideoPlayer video={displayVideo} />
      </div>
    </TrainPageContainer>
  );
}

function TextPanel({ title, text, fallback }: { title: string; text: string | null | undefined; fallback: string }) {
  return (
    <details className="group rounded-md bg-muted/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold text-foreground">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <p className="px-3 pb-3 leading-7 text-muted-foreground">{text || fallback}</p>
    </details>
  );
}

function Detail({ label, value }: { label: string | null | undefined; value: string | null | undefined }) {
  return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-foreground">{value || "N/A"}</p></div>;
}

function InlineStatus({
  tone,
  title,
  description,
  className
}: {
  tone: "success" | "warning" | "error";
  title: string;
  description: string;
  className?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const toneClass = tone === "error"
    ? "border-destructive/30 bg-destructive/5"
    : tone === "warning"
      ? "border-warning/30 bg-warning/10"
      : "border-success/30 bg-success/5";
  const iconClass = tone === "error"
    ? "text-destructive"
    : tone === "warning"
      ? "text-warning"
      : "text-success";

  return (
    <Card className={cn(toneClass, className)}>
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClass)} />
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
