"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ExerciseDetailPageFrame, DetailGroupTitle, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toCatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import {
  EXERCISE_ALTERNATIVE_REASONS,
  isAlternativeReasonSupportedForRelationships,
  rankExerciseAlternativesV2,
  type ExerciseAlternativeReasonV2
} from "@/lib/exercise-detail/alternatives";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { loadExerciseAlternatives } from "@/services/exercise-detail/client";
import type { LibraryAlternative } from "@/lib/activity-catalog/library-types";

function reasonLabel(reason: ExerciseAlternativeReasonV2, ed: ReturnType<typeof useExerciseDetailTranslation>["ed"]) {
  if (reason === "machine_taken") return ed("reasonMachineTaken");
  if (reason === "no_equipment") return ed("reasonEquipmentUnavailable");
  if (reason === "too_hard") return ed("reasonTooHard");
  if (reason === "want_harder") return ed("reasonWantHarder");
  if (reason === "pain_discomfort") return ed("reasonPain");
  if (reason === "no_spotter") return ed("reasonNoSpotter");
  if (reason === "technique_confidence") return ed("reasonTechniqueConfidence");
  return ed("reasonVariation");
}

export default function ExerciseAlternativesPage() {
  const { state, resolved } = useExerciseDetail();
  const { language, ed } = useExerciseDetailTranslation();
  const [reason, setReason] = useState<ExerciseAlternativeReasonV2>("machine_taken");
  const [alternatives, setAlternatives] = useState<LibraryAlternative[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const catalogLocale = toCatalogLocale(language);

  useEffect(() => {
    if (state !== "ready" || !resolved) return;
    const controller = new AbortController();
    setLoadState("loading");
    void loadExerciseAlternatives(resolved, catalogLocale, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setAlternatives(items);
        setLoadState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("failed");
      });
    return () => controller.abort();
  }, [catalogLocale, resolved, retryGeneration, state]);

  const ranked = useMemo(() => rankExerciseAlternativesV2(reason, alternatives), [alternatives, reason]);
  const supported = isAlternativeReasonSupportedForRelationships(reason, alternatives);

  return <ExerciseDetailPageFrame child="alternatives" title={ed("alternativesTitle")}>
    {state === "ready" && resolved ? <div className="space-y-5">
      <div className="max-w-md space-y-2">
        <label htmlFor="exercise-alternative-reason" className="text-sm font-medium">{ed("alternativeReason")}</label>
        <Select value={reason} onValueChange={(value) => setReason(value as ExerciseAlternativeReasonV2)}>
          <SelectTrigger id="exercise-alternative-reason" className="min-h-12"><SelectValue /></SelectTrigger>
          <SelectContent>{EXERCISE_ALTERNATIVE_REASONS.map((value) => <SelectItem key={value} value={value}>{reasonLabel(value, ed)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <DetailSurface ariaLabelledby="alternatives-results">
        <div className="flex items-center justify-between gap-3">
          <DetailGroupTitle id="alternatives-results">{ed("alternatives")}</DetailGroupTitle>
          {loadState === "failed" ? <Button type="button" variant="ghost" size="sm" onClick={() => setRetryGeneration((value) => value + 1)}>{ed("retry")}</Button> : null}
        </div>
        {loadState === "loading" || loadState === "idle" ? <div className="mt-4 space-y-3" role="status" aria-label={ed("loading")}><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div> : loadState === "failed" ? <p className="mt-4 text-sm text-muted-foreground">{ed("alternativesUnavailable")}</p> : !supported ? <p className="mt-4 text-sm text-muted-foreground" role="status">{ed("unsupportedReason")}</p> : ranked.length ? <div className="mt-3 divide-y">{ranked.map((item) => <article key={`${item.relationshipType}-${item.activity.id}`} className="flex min-h-20 items-center justify-between gap-4 py-4 first:pt-1 last:pb-0"><div className="min-w-0"><h3 className="font-medium">{item.activity.name}</h3><p className="mt-1 text-sm text-muted-foreground">{[item.activity.equipment.map((equipment) => equipment.name ?? equipment.slug).filter(Boolean).join(", "), item.activity.difficulty].filter(Boolean).join(" · ")}</p></div><Button asChild variant="outline" size="sm" className="min-h-11 shrink-0"><Link href={`/workouts/${encodeURIComponent(item.activity.id)}`}>{ed("view")}</Link></Button></article>)}</div> : <p className="mt-4 text-sm text-muted-foreground">{ed("unsupportedReason")}</p>}
      </DetailSurface>
    </div> : null}
  </ExerciseDetailPageFrame>;
}
