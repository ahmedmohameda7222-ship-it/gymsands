"use client";

import { ExternalLink, Heart, Play, RotateCcw, Save, TrendingUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeading } from "@/components/layout/page-heading";
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";
import { getExerciseVideos, getUserExerciseVideo, getWorkout, getWorkouts, resetUserExerciseVideo, upsertUserExerciseVideo } from "@/services/database/workout-library";
import { getWorkoutHistoryDetailed } from "@/services/database/workout-sessions";
import { getCustomExercise, getCustomExercises, getFavoriteExerciseIds, setFavoriteExercise } from "@/services/workouts/exercise-library-store";
import { findExerciseVideo } from "@/services/workouts/video-matching";
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

export default function WorkoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [video, setVideo] = useState<ExerciseVideo | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState("");
  const [customVideoDraft, setCustomVideoDraft] = useState("");
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [alternatives, setAlternatives] = useState<Workout[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const customExercise = await getCustomExercise(user?.id, params.id);
        const nextWorkout = customExercise ?? await getWorkout(params.id);
        const [videos, customVideo, workoutHistory, libraryAlternatives] = await Promise.all([
          getExerciseVideos(nextWorkout.name),
          user?.id && !customExercise ? getUserExerciseVideo(user.id, nextWorkout.id) : Promise.resolve(null),
          user?.id ? getWorkoutHistoryDetailed(user.id, 150) : Promise.resolve([]),
          getWorkouts("", {
            primaryMuscles: nextWorkout.target_muscle ? [nextWorkout.target_muscle] : [],
            equipmentRequired: nextWorkout.equipment_required || nextWorkout.equipment ? [nextWorkout.equipment_required || nextWorkout.equipment] : []
          }, 0)
        ]);
        const customExercises = await getCustomExercises(user?.id);
        const localCustomAlternatives = customExercises.filter((item) => item.id !== nextWorkout.id);
        const combinedAlternatives = [...localCustomAlternatives, ...libraryAlternatives]
          .filter((item) => item.id !== nextWorkout.id)
          .filter((item) => sameText(item.target_muscle, nextWorkout.target_muscle) || sameText(item.equipment, nextWorkout.equipment) || sameText(item.mechanics, nextWorkout.mechanics))
          .filter((item, index, all) => all.findIndex((match) => match.id === item.id) === index)
          .slice(0, 6);
        setWorkout(nextWorkout);
        setVideo(findExerciseVideo(nextWorkout, videos));
        setCustomVideoUrl(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
        setCustomVideoDraft(customExercise?.custom_video_url ?? customVideo?.custom_video_url ?? "");
        setHistory(workoutHistory);
        setAlternatives(combinedAlternatives);
        const favoriteIds = await getFavoriteExerciseIds(user?.id);
        setFavoriteIds(favoriteIds);
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load workout details.";
        setLoadError(message);
        toast({ title: "Could not load workout", description: message });
      }
    }
    load();
  }, [params.id, toast, user?.id]);

  const exerciseHistory = useMemo(() => workout ? buildExerciseHistory(exerciseLogsFor(history, workout.name)) : null, [history, workout]);

  if (!workout) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout..."}</p>;

  const guideUrl = workout.exercise_url || (workout.notes?.startsWith("http") ? workout.notes : video?.exercise_url);
  const videoUrl = customVideoUrl || null;
  const displayVideo = video
    ? { ...video, exercise_url: guideUrl ?? video.exercise_url, video_url: customVideoUrl || video.video_url }
    : videoUrl
      ? { id: workout.id, exercise_name: workout.name, category_type: workout.category, category: workout.target_muscle, exercise_url: guideUrl ?? "", video_url: customVideoUrl, instructions: workout.instructions, source: "user_custom", is_global: true }
      : null;
  const secondaryMuscles = workout.secondary_muscles ?? video?.secondary_muscles ?? [];
  const favorite = favoriteIds.includes(workout.id);
  const mistakes = workout.notes && !workout.notes.startsWith("http") && /mistake|avoid|form/i.test(workout.notes) ? workout.notes : "No specific mistakes saved for this exercise yet.";

  async function saveCustomVideo() {
    if (!workout) return;
    if (!user?.id) return toast({ title: "Login required", description: "Sign in again before saving a custom video link." });
    try {
      setIsSavingVideo(true);
      const saved = await upsertUserExerciseVideo(user.id, workout.id, customVideoDraft);
      setCustomVideoUrl(saved.custom_video_url);
      setCustomVideoDraft(saved.custom_video_url);
      toast({ title: "Custom video saved", description: "This exercise now has your manually added custom video." });
    } catch (error) {
      toast({ title: "Could not save video link", description: error instanceof Error ? error.message : "Please check the URL." });
    } finally {
      setIsSavingVideo(false);
    }
  }

  async function resetCustomVideo() {
    if (!workout || !user?.id) return;
    try {
      setIsSavingVideo(true);
      await resetUserExerciseVideo(user.id, workout.id);
      setCustomVideoUrl("");
      setCustomVideoDraft("");
      toast({ title: "Custom video cleared", description: "The exercise guide remains separate from your custom video link." });
    } catch (error) {
      toast({ title: "Could not reset video link", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSavingVideo(false);
    }
  }

  async function toggleFavorite() {
    const currentWorkout = workout;
    if (!currentWorkout) return;
    const next = await setFavoriteExercise(user?.id, currentWorkout.id, !favorite);
    setFavoriteIds(next);
    toast({ title: !favorite ? "Exercise favorited" : "Exercise unfavorited", description: currentWorkout.name });
  }

  return (
    <>
      <PageHeading
        title={workout.name}
        description={`${workout.target_muscle} | ${workout.equipment} | ${workout.difficulty}`}
        action={<div className="flex flex-wrap gap-2"><Button variant={favorite ? "default" : "outline"} onClick={toggleFavorite}><Heart className="h-4 w-4" /> {favorite ? "Favorited" : "Favorite"}</Button><Button asChild><Link href={`/workouts/session/${workout.id}`}><Play className="h-4 w-4" /> Start Workout</Link></Button></div>}
      />
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

              <TextPanel title="Instructions" text={video?.instructions || workout.instructions} />
              <TextPanel title="Mistakes to avoid" text={mistakes} />

              <div className="grid gap-2 sm:grid-cols-2">
                {guideUrl ? <Button asChild variant="outline"><a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Exercise Guide</a></Button> : <Button type="button" variant="outline" disabled>No guide added</Button>}
                {customVideoUrl ? <Button asChild variant="outline"><a href={customVideoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Custom Video</a></Button> : <Button type="button" variant="outline" disabled>No custom video</Button>}
              </div>

              <div className="rounded-md border p-3">
                <Label htmlFor="custom-video-url">Open Custom Video URL</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input id="custom-video-url" value={customVideoDraft} onChange={(event) => setCustomVideoDraft(event.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  <Button type="button" onClick={saveCustomVideo} disabled={isSavingVideo || !customVideoDraft.trim()}><Save className="h-4 w-4" /> Save</Button>
                  <Button type="button" variant="outline" onClick={resetCustomVideo} disabled={isSavingVideo || !customVideoUrl}><RotateCcw className="h-4 w-4" /> Reset</Button>
                </div>
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
              {alternatives.map((item) => <Link key={item.id} href={`/workouts/${item.id}`} className="rounded-md border p-3 transition hover:border-primary"><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{item.target_muscle} | {item.equipment}</p></Link>)}
            </CardContent>
          </Card>
        </div>
        <ExerciseVideoPlayer video={displayVideo} />
      </div>
    </>
  );
}

function TextPanel({ title, text }: { title: string; text: string | null | undefined }) {
  return <div className="rounded-md bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-950">{title}</p><p className="mt-2 leading-7 text-slate-700">{text || "Not saved for this exercise yet."}</p></div>;
}

function Detail({ label, value }: { label: string | null | undefined; value: string | null | undefined }) {
  return <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-slate-950">{value || "N/A"}</p></div>;
}
