"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/components/layout/page-heading";
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { useToast } from "@/components/ui/toaster";
import { getExerciseVideos, getWorkout } from "@/services/database/repository";
import { findExerciseVideo } from "@/services/workouts/video-matching";
import type { ExerciseVideo, Workout } from "@/types";

export default function WorkoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [video, setVideo] = useState<ExerciseVideo | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const nextWorkout = await getWorkout(params.id);
        const videos = await getExerciseVideos(nextWorkout.name);
        setWorkout(nextWorkout);
        setVideo(findExerciseVideo(nextWorkout, videos));
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load workout details.";
        setLoadError(message);
        toast({ title: "Could not load workout", description: message });
      }
    }
    load();
  }, [params.id, toast]);

  if (!workout) return <p className="text-sm text-muted-foreground">{loadError || "Loading workout..."}</p>;

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
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge>{workout.category}</Badge>
              <Badge variant="outline">{workout.sets ?? 3} sets</Badge>
              <Badge variant="outline">{workout.reps ?? "8-12 reps"}</Badge>
              <Badge variant="outline">{workout.rest_seconds ?? 90}s rest</Badge>
            </div>
            <p className="leading-7 text-slate-700">{workout.instructions}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              This app is for general fitness tracking only. Do not train through serious pain.
            </p>
          </CardContent>
        </Card>
        <ExerciseVideoPlayer video={video} />
      </div>
    </>
  );
}
