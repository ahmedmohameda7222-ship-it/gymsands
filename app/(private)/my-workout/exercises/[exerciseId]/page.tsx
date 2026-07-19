"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { ExerciseVideoPlayer } from "@/components/workouts/video-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { formatExerciseDisplayList } from "@/lib/train/exercise-display";
import { getUserWorkoutPlanExerciseDetail } from "@/services/database/workout-plans";
import type { ExerciseVideo, Workout } from "@/types";

type Detail = { exercise: Workout; dayName: string; planName: string };

export default function PlanExerciseDetailsPage() {
  const params = useParams<{ exerciseId: string }>();
  const { user } = useAuth();
  const { language, dir } = useTrainTranslation();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;
    setLoading(true);
    setError("");
    getUserWorkoutPlanExerciseDetail(user.id, params.exerciseId)
      .then((next) => { if (active) setDetail(next); })
      .catch((reason) => { if (active) setError(userSafeError(reason, "This plan exercise could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.exerciseId, user?.id]);

  if (loading) return <CardSkeleton rows={6} />;
  if (error) return <ErrorState title="Exercise details could not load" description={error} fallbackLabel="Back to workout plans" fallbackHref="/my-workout/plans" />;
  if (!detail) return <EmptyState title="Plan exercise not found" description="This exact exercise is no longer present in one of your workout plans." actionLabel="Back to workout plans" actionHref="/my-workout/plans" />;

  const { exercise } = detail;
  const customVideo = exercise.custom_video_url ? {
    id: exercise.plan_exercise_id ?? exercise.id,
    exercise_name: exercise.name,
    category_type: "workout-plan",
    category: exercise.category,
    exercise_url: exercise.exercise_url ?? exercise.custom_video_url,
    video_url: exercise.custom_video_url,
    instructions: exercise.instructions,
    source: "user-plan",
    is_global: false
  } satisfies ExerciseVideo : null;

  return (
    <div className="space-y-5" dir={dir}>
      <Button asChild variant="outline" size="sm"><Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" />Back to workout plans</Link></Button>
      <PageHeading title={exercise.name} description={`${detail.planName} · ${detail.dayName}`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>Planned exercise details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{exercise.sets ?? 3} sets</Badge>
              <Badge variant="outline">{exercise.reps ?? "8–12"} reps</Badge>
              <Badge variant="outline">{exercise.rest_seconds ?? 75}s rest</Badge>
              <Badge variant="outline">{formatExerciseDisplayList(exercise.target_muscle, language, "muscle")}</Badge>
              <Badge variant="outline">{formatExerciseDisplayList(exercise.equipment, language, "equipment")}</Badge>
            </div>
            <div><p className="text-sm font-semibold">Instructions</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{exercise.instructions}</p></div>
            {exercise.notes ? <div><p className="text-sm font-semibold">Plan notes</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{exercise.notes}</p></div> : null}
            {exercise.exercise_url ? <Button asChild variant="outline"><a href={exercise.exercise_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open exercise guide</a></Button> : null}
          </CardContent>
        </Card>
        <ExerciseVideoPlayer video={customVideo} />
      </div>
    </div>
  );
}
