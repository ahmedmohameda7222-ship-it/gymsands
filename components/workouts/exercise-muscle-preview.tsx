"use client";

import { useMemo, useState } from "react";

import { MuscleHeatMap } from "@/components/train/muscle-heat-map/muscle-heat-map";
import { Button } from "@/components/ui/button";
import type { SupportedLanguage } from "@/lib/i18n/types";
import {
  getMuscleHeatMapLabels,
  getMuscleIntelligenceCopy
} from "@/lib/train/muscle-intelligence/muscle-intelligence-ui-copy";
import {
  calculateExerciseAdvancedMusclePreview,
  type PlanMuscleExerciseLike
} from "@/lib/train/muscle-intelligence/plan-advanced-analysis";

export function ExerciseMusclePreview({
  exercise,
  language
}: {
  exercise: (PlanMuscleExerciseLike & { name?: string | null; exercise_name?: string | null }) | null;
  language: SupportedLanguage;
}) {
  const [mobileView, setMobileView] = useState<"front" | "back">("front");
  const resolvedLanguage = language ?? "en";
  const text = getMuscleIntelligenceCopy(resolvedLanguage);
  const labels = useMemo(() => getMuscleHeatMapLabels(resolvedLanguage), [resolvedLanguage]);
  const analysis = useMemo(() => {
    if (!exercise) return null;
    try {
      return calculateExerciseAdvancedMusclePreview(exercise);
    } catch {
      return null;
    }
  }, [exercise]);
  const name = exercise?.name || exercise?.exercise_name || null;
  const state = !exercise ? "empty" : analysis ? "ready" : "unavailable";
  const disclosure = exercise && !analysis ? text.unavailableDisclosure : null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4" aria-labelledby="phase4b-exercise-preview-heading" data-phase4b-exercise-preview>
      <div>
        <h2 id="phase4b-exercise-preview-heading" className="text-lg font-semibold">{text.exercisePreviewTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {name ? `${name} · ${text.exercisePreviewDescription}` : text.focusPrompt}
        </p>
      </div>
      <div className="mt-3 flex justify-center gap-2 sm:hidden">
        <Button type="button" size="sm" variant={mobileView === "front" ? "default" : "outline"} aria-pressed={mobileView === "front"} onClick={() => setMobileView("front")}>{text.front}</Button>
        <Button type="button" size="sm" variant={mobileView === "back" ? "default" : "outline"} aria-pressed={mobileView === "back"} onClick={() => setMobileView("back")}>{text.back}</Button>
      </div>
      <div className="mt-4 sm:hidden">
        <MuscleHeatMap mode="exercise_preview" view={mobileView} state={state} analysis={analysis} labels={labels} disclosure={disclosure} />
      </div>
      <div className="mt-4 hidden sm:block">
        <MuscleHeatMap mode="exercise_preview" view="both" state={state} analysis={analysis} labels={labels} disclosure={disclosure} />
      </div>
    </section>
  );
}
