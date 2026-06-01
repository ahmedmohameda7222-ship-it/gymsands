"use client";

import { ExternalLink, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExerciseVideo } from "@/types";
import { isEmbeddableVideo, toEmbedUrl } from "@/services/workouts/video-matching";

export function ExerciseVideoPlayer({ video }: { video: ExerciseVideo | null }) {
  if (!video) {
    return (
      <Card>
        <CardContent className="flex aspect-video flex-col items-center justify-center text-center">
          <PlayCircle className="h-10 w-10 text-primary" />
          <p className="mt-3 font-semibold">No custom video added</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a custom URL manually to show it here.</p>
        </CardContent>
      </Card>
    );
  }

  const playableUrl = video.video_url;
  const embed = toEmbedUrl(playableUrl);
  const embeddable = isEmbeddableVideo(playableUrl);

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-navy-950">
        {playableUrl && embeddable && embed ? (
          <iframe
            src={embed}
            title={`${video.exercise_name} custom video`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playableUrl ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white">
            <PlayCircle className="h-12 w-12 text-primary" />
            <Button asChild className="mt-4" variant="outline">
              <a href={playableUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open Custom Video
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white">
            <PlayCircle className="h-12 w-12 text-primary" />
            <p className="mt-3 font-semibold">No custom video added</p>
          </div>
        )}
      </div>
      <CardContent className="pt-5">
        <h3 className="font-semibold">{video.exercise_name}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {video.instructions || "Follow controlled form and stop if you feel serious pain."}
        </p>
      </CardContent>
    </Card>
  );
}
