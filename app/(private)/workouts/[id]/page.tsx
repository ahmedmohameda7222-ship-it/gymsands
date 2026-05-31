"use client";

import Link from "next/link";
import { ExternalLink, Play, RotateCcw, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeading } from "@/components/layout/page-heading";
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getExerciseVideos, getUserExerciseVideo, getWorkout, resetUserExerciseVideo, upsertUserExerciseVideo } from "@/services/database/repository";
import { findExerciseVideo } from "@/services/workouts/video-matching";
import type { ExerciseVideo, Workout } from "@/types";

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

  useEffect(() => {
    async function load() {
      try {
        const nextWorkout = await getWorkout(params.id);
        const videos = await getExerciseVideos(nextWorkout.name);
        const customVideo = user?.id ? await getUserExerciseVideo(user.id, nextWorkout.id) : null;
        setWorkout(nextWorkout);
        setVideo(findExerciseVideo(nextWorkout, videos));
        setCustomVideoUrl(customVideo?.custom_video_url ?? "");
        setCustomVideoDraft(customVideo?.custom_video_url ?? "");
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load workout details.";
        setLoadError(message);
        toast({ title: "Could not load workout", description: message });
      }
    }
    load();
  }, [params.id, toast, user?.id]);

  if (!workout) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout..."}</p>;

  const guideUrl = workout.exercise_url || (workout.notes?.startsWith("http") ? workout.notes : video?.exercise_url);
  const videoUrl = customVideoUrl || workout.video_url || video?.video_url || video?.exercise_url || guideUrl;
  const displayVideo = video
    ? { ...video, video_url: customVideoUrl || video.video_url }
    : videoUrl
      ? {
          id: workout.id,
          exercise_name: workout.name,
          category_type: workout.category,
          category: workout.target_muscle,
          exercise_url: videoUrl,
          video_url: customVideoUrl || workout.video_url || null,
          instructions: workout.instructions,
          source: "user_custom_or_workout",
          is_global: true
        }
      : null;
  const secondaryMuscles = workout.secondary_muscles ?? video?.secondary_muscles ?? [];

  async function saveCustomVideo() {
    if (!workout) return;
    if (!user?.id) return toast({ title: "Login required", description: "Sign in again before saving a custom video link." });
    try {
      setIsSavingVideo(true);
      const saved = await upsertUserExerciseVideo(user.id, workout.id, customVideoDraft);
      setCustomVideoUrl(saved.custom_video_url);
      setCustomVideoDraft(saved.custom_video_url);
      toast({ title: "Video link saved", description: "This exercise now uses your custom instruction video." });
    } catch (error) {
      toast({ title: "Could not save video link", description: error instanceof Error ? error.message : "Please check the URL." });
    } finally {
      setIsSavingVideo(false);
    }
  }

  async function resetCustomVideo() {
    if (!workout) return;
    if (!user?.id) return;
    try {
      setIsSavingVideo(true);
      await resetUserExerciseVideo(user.id, workout.id);
      setCustomVideoUrl("");
      setCustomVideoDraft("");
      toast({ title: "Video link reset", description: "The default instruction link is active again." });
    } catch (error) {
      toast({ title: "Could not reset video link", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSavingVideo(false);
    }
  }

  return (
    <>
      <PageHeading
        title={workout.name}
        description={`${workout.target_muscle} | ${workout.equipment} | ${workout.difficulty}`}
        action={
          <Button asChild>
            <Link href={`/workouts/session/${workout.id}`}>
              <Play className="h-4 w-4" />
              Start Workout
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Exercise details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge>{workout.muscle_category || workout.target_muscle}</Badge>
              <Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>
              <Badge variant="outline">{workout.experience_level || workout.difficulty}</Badge>
              {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
              {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
              <Badge variant="outline">{workout.sets ?? 3} sets</Badge>
              <Badge variant="outline">{workout.reps ?? "8-12 reps"}</Badge>
              <Badge variant="outline">{workout.rest_seconds ?? 90}s rest</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="Exercise name" value={workout.name} />
              <Detail label="Muscle category" value={workout.muscle_category || workout.target_muscle} />
              <Detail label="Secondary muscles" value={secondaryMuscles.length ? secondaryMuscles.join(", ") : "None"} />
              <Detail label="Equipment" value={workout.equipment_required || workout.equipment} />
              <Detail label="Mechanics" value={workout.mechanics || workout.category} />
              <Detail label="Force type" value={workout.force_type || "N/A"} />
              <Detail label="Experience level" value={workout.experience_level || workout.difficulty} />
            </div>

            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">Instructions</p>
              <p className="mt-2 leading-7 text-slate-700">{video?.instructions || workout.instructions}</p>
            </div>

            {guideUrl ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-semibold text-slate-950">Exercise URL</p>
                <a href={guideUrl} target="_blank" rel="noreferrer" className="mt-1 break-all text-sm font-medium text-primary">
                  {guideUrl}
                </a>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              {guideUrl ? (
                <Button asChild variant="outline">
                  <a href={guideUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Exercise Guide
                  </a>
                </Button>
              ) : null}
              {videoUrl ? (
                <Button asChild variant="outline">
                  <a href={videoUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Video/Instructions
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="rounded-md border p-3">
              <Label htmlFor="custom-video-url">My instruction video link</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  id="custom-video-url"
                  value={customVideoDraft}
                  onChange={(event) => setCustomVideoDraft(event.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                />
                <Button type="button" onClick={saveCustomVideo} disabled={isSavingVideo || !customVideoDraft.trim()}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={resetCustomVideo} disabled={isSavingVideo || !customVideoUrl}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
              {customVideoUrl ? <p className="mt-2 text-sm text-emerald-700">Your custom video overrides the default link.</p> : null}
            </div>

            <p className="text-sm text-muted-foreground">
              This app is for general fitness tracking only. Do not train through serious pain.
            </p>
          </CardContent>
        </Card>
        <ExerciseVideoPlayer video={displayVideo} />
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value || "N/A"}</p>
    </div>
  );
}
