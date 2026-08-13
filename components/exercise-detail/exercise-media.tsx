"use client";

import { ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isEmbeddableVideo,
  toEmbedUrl,
} from "@/services/workouts/video-matching";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

export function ExerciseMedia({ name, url }: { name: string; url: string }) {
  const { ed } = useExerciseDetailTranslation();
  const embed = toEmbedUrl(url);
  const embeddable = isEmbeddableVideo(url) && Boolean(embed);
  return (
    <section className="border-t pt-8" aria-labelledby="exercise-media-heading">
      <h2
        id="exercise-media-heading"
        className="text-xl font-semibold tracking-tight"
      >
        {ed("media")}
      </h2>
      <div className="mt-4 max-w-[820px] overflow-hidden rounded-2xl border bg-foreground">
        {embeddable ? (
          <iframe
            src={embed!}
            title={`${name} · ${ed("media")}`}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex aspect-video items-center justify-center p-6">
            <Button asChild variant="secondary" className="min-h-12">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {ed("openVideo")}
              </a>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
