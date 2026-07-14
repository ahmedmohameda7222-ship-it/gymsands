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
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";
import { getWorkout, getWorkoutAlternatives, type WorkoutLibraryStatus } from "@/services/database/workout-library";
import { getUserExerciseVideo, resetUserExerciseVideo, upsertUserExerciseVideo } from "@/services/database/exercise-user-data";
import { getWorkoutHistoryDetailed } from "@/services/database/workout-sessions";
import { getCustomExercisesWithStatus, getFavoriteExerciseIdsWithStatus, setFavoriteExercise } from "@/services/workouts/exercise-library-store";
import { userSafeError } from "@/lib/error-formatting";
import { cn } from "@/lib/utils";
import type { ExerciseLog, Workout, WorkoutSessionSummary } from "@/types";

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

function exerciseLogsFor(history: WorkoutSessionSummary[], exerciseName: string) {
  const target = normalizeExerciseName(exerciseName);
  return history.flatMap((session) =>
    (session.exercise_logs ?? [])
      .filter((log) => normalizeExerciseName(log.exercise_name) === target)
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

export default function WorkoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [workout, setWorkout] = useState<Workout | null>(null);
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
      const nextWorkout = customExercise ?? await getWorkout(params.id);
      const [customVideoResult, historyResult, alternativesResult, favoritesResult] = await Promise.allSettled([
        userId && !customExercise ? getUserExerciseVideo(userId, nextWorkout.id) : Promise.resolve(null),
        userId ? getWorkoutHistoryDetailed(userId, 150) : Promise.resolve([]),
        customExercise
          ? Promise.resolve({ data: [] as Workout[], status: { source: "live" } as WorkoutLibraryStatus })
          : getWorkoutAlternatives(nextWorkout.id, { limit: 6 }),
        getFavoriteExerciseIdsWithStatus(userId)
      ]);
      const customVideo = customVideoResult.status === "fulfilled" ? customVideoResult.value : null;
      if (customVideoResult.status === "rejected") warnings.push("Your custom video override could not load.");
      const workoutHistory = historyResult.status === "fulfilled" ? historyResult.value : [];
      if (historyResult.status === "rejected") warnings.push("Workout history could not load for this exercise.");
      const libraryAlternatives = alternativesResult.status === "fulfilled" ? alternativesResult.value.data : [];
      if (alternativesResult.status === "fulfilled" && alternativesResult.value.status.message) warnings.push(alternativesResult.value.status.message);
      if (alternativesResult.status === "rejected") warnings.push("Alternative exercises could not load.");
      if (favoritesResult.status === "fulfilled") {
        setFavoriteIds(favoritesResult.value.data);
        if (favoritesResult.value.status.source === "degraded" && favoritesResult.value.status.message) warnings.push(favoritesResult.value.status.message);
      } else {
        warnings.push("Favorite state could not load.");
        setFavoriteIds([]);
      }
      const combinedAlternatives = (customExercise ? customResult.data : libraryAlternatives)
        .filter((item) => item.id !== nextWorkout.id)
        .filter((item) => !customExercise || sameText(item.target_muscle, nextWorkout.target_muscle) || sameText(item.equipment, nextWorkout.equipment) || sameText(item.mechanics, nextWorkout.mechanics))
        .filter((item, index, all) => all.findIndex((match) => match.id === item.id) === index)
        .slice(0, 6);
      setWorkout(nextWorkout);
      setCustomVideoUrl(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
      setCustomVideoDraft(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
      setHistory(workoutHistory);
      setAlternatives(combinedAlternatives);
      setLoadWarning(Array.from(new Set(warnings)).join(" "));
    } catch (error) {
      const message = userSafeError(error, "Could not load workout details. Please refresh and try again.");
      setLoadError(message);
      toast({ title: "Could not load workout", description: message });
    } finally {
      setIsLoading(false);
    }
  }, [params.id, toast, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exerciseHistory = useMemo(() => workout ? buildExerciseHistory(exerciseLogsFor(history, workout.name)) : null, [history, workout]);

  if (isLoading) return <CardSkeleton rows={7} />;

  if (loadError) {
    return (
      <ErrorState
        title="Exercise details could not load"
        description={loadError}
        onRetry={load}
        fallbackLabel="Back to Exercise Library"
        fallbackHref="/workouts"
      />
    );
  }

  if (!workout) {
    return (
      <ErrorState
        title="Exercise not found"
        description="This exercise could not be found in the library."
        fallbackLabel="Back to Exercise Library"
        fallbackHref="/workouts"
      />
    );
  }

  const guideUrl = workout.exercise_url || null;
  const videoUrl = customVideoUrl || workout.video_url || null;
  const displayVideo = videoUrl
      ? { id: workout.id, exercise_name: workout.name, category_type: workout.category, category: workout.target_muscle, exercise_url: guideUrl ?? "", video_url: videoUrl, instructions: workout.instructions, source: customVideoUrl ? "user_custom" : workout.activity_catalog?.source ?? "legacy", is_global: true }
      : null;
  const secondaryMuscles = workout.secondary_muscles ?? [];
  const favorite = favoriteIds.includes(workout.id);
  const mistakes = workout.notes && !workout.notes.startsWith("http") && /mistake|avoid|form/i.test(workout.notes) ? workout.notes : "No specific mistakes saved for this exercise yet.";
  const customVideoInvalid = hasInvalidUrl(customVideoDraft);

  async function saveCustomVideo() {
    if (!workout) return;
    if (!userId) {
      const message = "Sign in again before saving a custom video link.";
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: "Login required", description: message });
      return;
    }
    if (customVideoInvalid) {
      setVideoStatus("failed");
      setVideoMessage("Custom video URL must start with http:// or https://.");
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
      setVideoMessage("Custom video saved for this exercise only.");
      toast({ title: "Custom video saved", description: "This exercise now has your manually added custom video." });
    } catch (error) {
      const message = userSafeError(error, "Please check the link and try again.");
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: "Could not save video link", description: message });
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
      setVideoMessage("Custom video cleared. The exercise guide remains unchanged.");
      toast({ title: "Custom video cleared", description: "The exercise guide remains separate from your custom video link." });
    } catch (error) {
      const message = userSafeError(error, "Could not reset video link. Your current custom video remains unchanged.");
      setVideoStatus("failed");
      setVideoMessage(message);
      toast({ title: "Could not reset video link", description: message });
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
      toast({ title: nextFavorite ? "Exercise favorited" : "Exercise unfavorited", description: currentWorkout.name });
    } catch (error) {
      const message = userSafeError(error, "Favorite change failed. Your previous favorite state was restored.");
      setFavoriteIds(previousIds);
      setFavoriteError(message);
      toast({ title: "Favorite was not saved", description: message });
    } finally {
      setIsFavoritePending(false);
    }
  }

  return (
    <>
      <PageHeading
        title={workout.name}
        description={`${workout.target_muscle} | ${workout.equipment} | ${workout.difficulty}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-12" variant={favorite ? "default" : "outline"} onClick={toggleFavorite} disabled={isFavoritePending} aria-busy={isFavoritePending}>
              <Heart className={cn("h-4 w-4", favorite && "fill-current")} />
              {isFavoritePending ? "Saving..." : favorite ? "Favorited" : "Favorite"}
            </Button>
            <Button asChild className="min-h-12">
              <Link href={`/workouts/session/${workout.id}`}><Play className="h-4 w-4" /> Start session</Link>
            </Button>
          </div>
        }
      />
      {loadWarning ? <InlineStatus tone="warning" title="Some exercise data is degraded" description={loadWarning} /> : null}
      {favoriteError ? <InlineStatus tone="error" title="Favorite was not saved" description={favoriteError} /> : null}
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Exercise details</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{workout.muscle_category || workout.target_muscle}</Badge>
                <Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>
                <Badge variant="outline">{workout.experience_level || workout.difficulty}</Badge>
                {!workout.is_global ? <Badge variant="success">Custom</Badge> : null}
                {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
                {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Exercise name" value={workout.name} />
                <Detail label="Target muscle" value={workout.muscle_category || workout.target_muscle} />
                <Detail label="Secondary muscles" value={secondaryMuscles.length ? secondaryMuscles.join(", ") : "None saved"} />
                <Detail label="Equipment" value={workout.equipment_required || workout.equipment} />
                <Detail label="Mechanics" value={workout.mechanics || workout.category} />
                <Detail label="Force type" value={workout.force_type || "N/A"} />
                <Detail label="Experience level" value={workout.experience_level || workout.difficulty} />
              </div>

              <TextPanel title="Instructions" text={workout.instructions} />
              <TextPanel title="Mistakes to avoid" text={mistakes} />

              <div className="grid gap-2 sm:grid-cols-2">
                {guideUrl ? <Button asChild variant="outline" className="min-h-12"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Exercise Guide</a></Button> : <Button type="button" variant="outline" className="min-h-12" disabled>No guide added</Button>}
                {customVideoUrl ? <Button asChild variant="outline" className="min-h-12"><a href={customVideoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Custom Video</a></Button> : <Button type="button" variant="outline" className="min-h-12" disabled>No custom video</Button>}
              </div>

              <div className="rounded-md border p-3">
                <Label htmlFor="custom-video-url">Custom video URL</Label>
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
                  <Button type="button" className="min-h-12" onClick={saveCustomVideo} disabled={isSavingVideo || !customVideoDraft.trim() || customVideoInvalid}><Save className="h-4 w-4" /> {isSavingVideo && videoStatus === "saving" ? "Saving..." : "Save"}</Button>
                  <Button type="button" variant="outline" className="min-h-12" onClick={resetCustomVideo} disabled={isSavingVideo || !customVideoUrl}><RotateCcw className="h-4 w-4" /> Reset</Button>
                </div>
                {customVideoInvalid ? <p className="mt-2 text-sm leading-6 text-destructive">Custom video URL must start with http:// or https://.</p> : null}
                {videoMessage ? <InlineStatus className="mt-3" tone={videoStatus === "failed" ? "error" : "success"} title={videoStatus === "failed" ? "Custom video was not saved" : videoStatus === "reset" ? "Custom video cleared" : "Custom video saved"} description={videoMessage} /> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Real workout history</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!exerciseHistory?.count ? <p className="text-sm text-muted-foreground">No workout history yet.</p> : null}
              {exerciseHistory?.count ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Detail label="Best weight" value={`${exerciseHistory.bestWeight} kg`} />
                    <Detail label="Best reps" value={`${exerciseHistory.bestReps} reps`} />
                    <Detail label="Estimated 1RM" value={`${exerciseHistory.bestOneRepMax} kg`} />
                  </div>
                  <Detail label="Best set" value={exerciseHistory.bestSet ? `${exerciseHistory.bestSet.weight_kg ?? 0} kg x ${exerciseHistory.bestSet.reps ?? 0}` : "No set data"} />
                  {exerciseHistory.trends.length < 2 ? <p className="text-sm text-muted-foreground">Not enough workout history yet.</p> : <div className="space-y-2">{exerciseHistory.trends.slice(-6).map((point) => <div key={point.date} className="rounded-md border p-3 text-sm"><p className="font-semibold">{point.date}</p><p className="text-muted-foreground">Volume {point.volume} kg | Best set volume {point.bestSetVolume} kg | Est. 1RM {point.estimatedOneRepMax} kg</p></div>)}</div>}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Alternative exercises</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {!alternatives.length ? <p className="text-sm text-muted-foreground">No alternatives found from matching muscle or equipment.</p> : null}
              {alternatives.map((item) => <Link key={item.id} href={`/workouts/${item.id}`} className="min-h-12 rounded-md border p-3 transition hover:border-primary"><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{item.target_muscle} | {item.equipment}</p></Link>)}
            </CardContent>
          </Card>
        </div>
        <ExerciseVideoPlayer video={displayVideo} />
      </div>
    </>
  );
}

function TextPanel({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <details className="group rounded-md bg-muted/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold text-foreground">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <p className="px-3 pb-3 leading-7 text-muted-foreground">{text || "Not saved for this exercise yet."}</p>
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
