"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";
import { getActiveWorkoutReplacementRecommendations } from "@/services/workouts/active-workout/replacement-recommendations-client";
import type {
  RankedReplacement,
  ReplacementExerciseProfile,
  ReplacementReasonCode,
} from "@/services/workouts/active-workout/replacement-ranking";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout,
} from "@/types";

const SUPPORTED_REASONS: ExerciseAlternativeReason[] = [
  "machine_taken",
  "no_equipment",
  "pain_or_discomfort",
  "too_hard",
  "other",
];

const reasonTranslationKey: Record<(typeof SUPPORTED_REASONS)[number], string> = {
  machine_taken: "replacement.reasonMachineTaken",
  no_equipment: "replacement.reasonEquipmentUnavailable",
  pain_or_discomfort: "replacement.reasonPainDiscomfort",
  too_hard: "replacement.reasonTooHard",
  other: "replacement.reasonOther",
};

const explanationTranslationKey: Record<ReplacementReasonCode, string> = {
  same_primary_muscles: "replacement.samePrimaryMuscles",
  similar_movement: "replacement.similarMovement",
  different_equipment: "replacement.differentEquipment",
  easier_variation: "replacement.easierVariation",
  used_before: "replacement.usedBefore",
  strong_identity: "replacement.strongIdentity",
};

export function ActiveWorkoutReplacementRecommendations({
  userId,
  original,
  reason,
  onReasonChange,
  locale,
  savedAlternatives,
  sessionExerciseIds,
  busy,
  onReplace,
  onBrowseAll,
  tr,
}: {
  userId: string;
  original: ReplacementExerciseProfile;
  reason: ExerciseAlternativeReason;
  onReasonChange: (reason: ExerciseAlternativeReason) => void;
  locale: string;
  savedAlternatives: readonly UserExerciseAlternative[];
  sessionExerciseIds: ReadonlySet<string>;
  busy: boolean;
  onReplace: (workout: Workout) => void;
  onBrowseAll: () => void;
  tr: ActiveWorkoutTranslator;
}) {
  const [recommendations, setRecommendations] = useState<RankedReplacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const sessionIdsKey = useMemo(() => [...sessionExerciseIds].sort().join("|"), [sessionExerciseIds]);
  const stableSessionExerciseIds = useMemo(
    () => new Set(sessionIdsKey ? sessionIdsKey.split("|") : []),
    [sessionIdsKey],
  );
  const stableOriginal = useMemo<ReplacementExerciseProfile>(() => ({
    id: original.id,
    name: original.name,
    targetMuscle: original.targetMuscle,
    equipment: original.equipment,
    difficulty: original.difficulty,
    mechanics: original.mechanics,
    forceType: original.forceType,
    movementPattern: original.movementPattern,
    secondaryMuscles: [...original.secondaryMuscles],
    catalogDegraded: original.catalogDegraded,
  }), [
    original.catalogDegraded,
    original.difficulty,
    original.equipment,
    original.forceType,
    original.id,
    original.mechanics,
    original.movementPattern,
    original.name,
    original.secondaryMuscles,
    original.targetMuscle,
  ]);

  useEffect(() => {
    if (!userId || !stableOriginal.id) {
      setRecommendations([]);
      setUnavailable(true);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setUnavailable(false);
    void getActiveWorkoutReplacementRecommendations({
      userId,
      original: stableOriginal,
      reason,
      locale,
      savedAlternatives,
      sessionExerciseIds: stableSessionExerciseIds,
      signal: controller.signal,
      limit: 5,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setRecommendations(result.recommendations);
      setUnavailable(false);
    }).catch((error) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setRecommendations([]);
      setUnavailable(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [locale, reason, savedAlternatives, stableOriginal, stableSessionExerciseIds, userId]);

  return (
    <div data-aw-replacement-recommendations className="mt-4 space-y-4">
      <fieldset disabled={busy}>
        <legend className="text-sm font-semibold text-foreground">{tr("replacement.whyReplace")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUPPORTED_REASONS.map((candidateReason) => (
            <button
              key={candidateReason}
              type="button"
              aria-pressed={reason === candidateReason}
              onClick={() => onReasonChange(candidateReason)}
              className="min-h-11 rounded-full border border-border px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              {tr(reasonTranslationKey[candidateReason])}
            </button>
          ))}
        </div>
      </fieldset>

      {reason === "pain_or_discomfort" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{tr("replacement.painCaution")}</p>
      ) : null}

      <section aria-labelledby="aw-replacement-best-matches">
        <div className="flex items-center justify-between gap-3">
          <h4 id="aw-replacement-best-matches" className="text-sm font-semibold text-foreground">
            {tr("replacement.bestMatches")}
          </h4>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" /> : null}
        </div>

        {loading && !recommendations.length ? (
          <div role="status" className="mt-2 space-y-2" aria-label={tr("replacement.loading")}>
            {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />)}
          </div>
        ) : recommendations.length ? (
          <ol className="mt-2 divide-y divide-border/70 border-y border-border/70">
            {recommendations.slice(0, 3).map((recommendation, index) => (
              <li key={recommendation.workout.id} className="flex min-w-0 items-center gap-3 py-3">
                <span dir="ltr" className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground"><bdi>{recommendation.workout.name}</bdi></p>
                  {recommendation.reasons.length ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {recommendation.reasons.map((item) => tr(explanationTranslationKey[item])).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  onClick={() => onReplace(recommendation.workout)}
                  disabled={busy}
                >
                  {tr("replacement.replace")}
                </Button>
              </li>
            ))}
          </ol>
        ) : !loading ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {tr(unavailable ? "replacement.unavailable" : "replacement.noMatches")}
          </p>
        ) : null}
      </section>

      <Button type="button" variant="ghost" className="min-h-11 px-0" onClick={onBrowseAll} disabled={busy}>
        {tr("replacement.browseAll")}
      </Button>
    </div>
  );
}
