"use client";

import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getMuscleLoadVisibilityCopy } from "@/lib/train/muscle-intelligence/muscle-load-visibility-copy";

export function TrainMuscleLoadEntry() {
  const { language, dir } = useTrainTranslation();
  const text = getMuscleLoadVisibilityCopy(language);

  return (
    <TrainPageContainer className="mt-3" dir={dir} data-muscle-load-overview-entry>
      <Card className="overflow-hidden border-primary/20 bg-primary/5">
        <CardContent className="p-0">
          <Link
            href="/my-workout/muscle-load"
            className="group flex min-h-24 items-center gap-4 p-4 transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Activity className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-foreground">{text.cardTitle}</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">{text.cardDescription}</span>
            </span>
            <span className="hidden items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">
              {text.cardAction}
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
            </span>
          </Link>
        </CardContent>
      </Card>
    </TrainPageContainer>
  );
}
