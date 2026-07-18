"use client";

import { Check, Dumbbell, ExternalLink, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-field";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { createCatalogRequestGroupId } from "@/services/activity-catalog/client";
import {
  emptyCanonicalWorkoutFilterOptions,
  getCanonicalWorkoutFilterOptionsWithStatus,
  getWorkoutsWithStatus,
  mergeCanonicalWorkoutFilterOptions,
  type CanonicalWorkoutFilterOptions,
  type WorkoutFilterOption
} from "@/services/database/workout-library";
import {
  getWorkoutReplacementEligibility,
  isReplacementCandidateActionable,
  replacementEligibilityMessage,
  shouldClosePickerAfterAdd,
  type ReplacementEligibility
} from "@/services/database/workout-replacement-eligibility";
import type { Workout } from "@/types";

function normalizeIdentityPart(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

function exerciseKey(exercise: Pick<Workout, "id" | "name" | "target_muscle" | "catalog_slug">) {
  if (exercise.catalog_slug) return `catalog:${exercise.catalog_slug}`;
  if (exercise.id) return `id:${exercise.id}`;
  return `legacy:${normalizeIdentityPart(exercise.name)}:${normalizeIdentityPart(exercise.target_muscle)}`;
}

function optionLabel(options: WorkoutFilterOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError");
}

const emptyPagination = { hasMore: false, nextOffset: null as number | null };

export function ExercisePickerDialog({ open, onOpenChange, dayName, existingKeys, onAdd, maxSelection }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayName: string;
  existingKeys: string[];
  onAdd: (exercises: Workout[]) => void;
  maxSelection?: number;
}) {
  const { user } = useAuth();
  const { dir, locale, tr } = useTrainTranslation();
  const libraryLoadFailedMessage = tr("libraryLoadFailed");
  const replacementMode = maxSelection === 1;
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [muscleCategory, setMuscleCategory] = useState("");
  const [secondaryMuscle, setSecondaryMuscle] = useState("");
  const [forceType, setForceType] = useState("");
  const [exerciseType, setExerciseType] = useState("");
  const [mechanics, setMechanics] = useState("");
  const [results, setResults] = useState<Workout[]>([]);
  const [filterOptions, setFilterOptions] = useState<CanonicalWorkoutFilterOptions>(() => emptyCanonicalWorkoutFilterOptions());
  const [selected, setSelected] = useState<Map<string, Workout>>(new Map());
  const [eligibility, setEligibility] = useState<Map<string, ReplacementEligibility>>(new Map());
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [pagination, setPagination] = useState(emptyPagination);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const initialRequestGroupConsumedRef = useRef<string | null>(null);
  const activeGenerationGroupRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const eligibilityGenerationRef = useRef(0);
  const filtersControllerRef = useRef<AbortController | null>(null);
  const activitiesControllerRef = useRef<AbortController | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const initialCatalogRequestGroupId = useMemo(() => open ? createCatalogRequestGroupId() : null, [open]);
  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);

  const activeFilters = useMemo(() => ({
    primaryMuscles: muscle ? [muscle] : [],
    equipmentRequired: equipment ? [equipment] : [],
    difficulty: difficulty || undefined,
    muscleCategories: muscleCategory ? [muscleCategory] : [],
    secondaryMuscles: secondaryMuscle ? [secondaryMuscle] : [],
    forceTypes: forceType ? [forceType] : [],
    exerciseTypes: exerciseType ? [exerciseType] : [],
    mechanics: mechanics ? [mechanics] : []
  }), [difficulty, equipment, exerciseType, forceType, mechanics, muscle, muscleCategory, secondaryMuscle]);

  useEffect(() => {
    if (open || typeof document === "undefined") return;
    const captureReturnTarget = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        !activeElement.closest("[data-train-exercise-picker]")
      ) {
        returnFocusRef.current = activeElement;
      }
    };
    captureReturnTarget();
    document.addEventListener("focusin", captureReturnTarget, true);
    return () => document.removeEventListener("focusin", captureReturnTarget, true);
  }, [open]);

  useEffect(() => {
    if (!open || !initialCatalogRequestGroupId) return;
    filtersControllerRef.current?.abort();
    const controller = new AbortController();
    filtersControllerRef.current = controller;
    void getCanonicalWorkoutFilterOptionsWithStatus(locale, {
      requestGroupId: initialCatalogRequestGroupId,
      signal: controller.signal
    }).then((result) => {
      if (!controller.signal.aborted) setFilterOptions(result.data);
    }).catch(() => {
      // Result-derived options remain available if filter metadata fails.
    });
    return () => controller.abort();
  }, [initialCatalogRequestGroupId, locale, open]);

  useEffect(() => {
    if (!open) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activitiesControllerRef.current?.abort();
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    activitiesControllerRef.current = controller;
    const initialGroupId = initialCatalogRequestGroupId;
    const useInitialGroup = initialGroupId !== null && initialRequestGroupConsumedRef.current !== initialGroupId;
    const requestGroupId = useInitialGroup ? initialGroupId : createCatalogRequestGroupId();
    activeGenerationGroupRef.current = requestGroupId;
    const timer = window.setTimeout(() => {
      if (useInitialGroup && initialGroupId) initialRequestGroupConsumedRef.current = initialGroupId;
      setLoading(true);
      setLoadingMore(false);
      setError("");
      setLoadMoreError("");
      setPagination(emptyPagination);
      getWorkoutsWithStatus(query.trim(), activeFilters, 0, locale, {
        requestGroupId,
        signal: controller.signal
      })
        .then((result) => {
          if (controller.signal.aborted || generationRef.current !== generation) return;
          setResults(result.data);
          setPagination(result.pagination ?? emptyPagination);
          if (result.filterOptions) setFilterOptions((options) => mergeCanonicalWorkoutFilterOptions(options, result.filterOptions!));
        })
        .catch((loadError) => {
          if (controller.signal.aborted || generationRef.current !== generation || isAbortError(loadError)) return;
          setResults([]);
          setPagination(emptyPagination);
          setError(userSafeError(loadError, libraryLoadFailedMessage));
        })
        .finally(() => {
          if (!controller.signal.aborted && generationRef.current === generation) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeFilters, initialCatalogRequestGroupId, libraryLoadFailedMessage, locale, open, query]);

  useEffect(() => {
    if (!open || !replacementMode) {
      setEligibility(new Map());
      setEligibilityLoading(false);
      setEligibilityError("");
      return;
    }
    const generation = eligibilityGenerationRef.current + 1;
    eligibilityGenerationRef.current = generation;
    if (!user?.id) {
      setEligibility(new Map());
      setEligibilityLoading(false);
      setEligibilityError("Sign in again to verify replacement eligibility.");
      return;
    }
    if (!results.length) {
      setEligibility(new Map());
      setEligibilityLoading(false);
      setEligibilityError("");
      return;
    }
    setEligibilityLoading(true);
    setEligibilityError("");
    void getWorkoutReplacementEligibility(
      user.id,
      results.map((workout) => ({ key: exerciseKey(workout), workout }))
    ).then((next) => {
      if (eligibilityGenerationRef.current !== generation) return;
      setEligibility(next);
    }).catch((loadError) => {
      if (eligibilityGenerationRef.current !== generation) return;
      setEligibility(new Map());
      setEligibilityError(userSafeError(loadError, "Replacement eligibility could not be verified. Your current exercise was preserved."));
    }).finally(() => {
      if (eligibilityGenerationRef.current === generation) setEligibilityLoading(false);
    });
  }, [open, replacementMode, results, user?.id]);

  useEffect(() => {
    if (open) return;
    filtersControllerRef.current?.abort();
    activitiesControllerRef.current?.abort();
    loadMoreControllerRef.current?.abort();
    generationRef.current += 1;
    eligibilityGenerationRef.current += 1;
    initialRequestGroupConsumedRef.current = null;
    activeGenerationGroupRef.current = null;
    setSelected(new Map());
    setResults([]);
    setEligibility(new Map());
    setEligibilityLoading(false);
    setEligibilityError("");
    setPagination(emptyPagination);
    setLoading(false);
    setLoadingMore(false);
    setError("");
    setLoadMoreError("");
  }, [open]);

  const muscleOptions = filterOptions.primaryMuscles;
  const equipmentOptions = filterOptions.equipmentRequired;
  const difficultyOptions = filterOptions.experienceLevels;
  const muscleCategoryOptions = filterOptions.muscleCategories;
  const secondaryMuscleOptions = filterOptions.secondaryMuscles;
  const forceTypeOptions = filterOptions.forceTypes;
  const exerciseTypeOptions = filterOptions.exerciseTypes;
  const mechanicsOptions = filterOptions.mechanics;
  const hasAdvancedOptions = Boolean(muscleCategoryOptions.length || secondaryMuscleOptions.length || forceTypeOptions.length || exerciseTypeOptions.length || mechanicsOptions.length);

  function isActionable(key: string) {
    if (!replacementMode) return true;
    return isReplacementCandidateActionable(eligibility.get(key), eligibilityLoading, eligibilityError);
  }

  function toggle(exercise: Workout) {
    const key = exerciseKey(exercise);
    if (existing.has(key) || !isActionable(key)) return;
    setSelected((current) => {
      if (current.has(key)) {
        const next = new Map(current);
        next.delete(key);
        return next;
      }
      const next = maxSelection === 1 ? new Map<string, Workout>() : new Map(current);
      next.set(key, exercise);
      return next;
    });
  }

  function addSelected() {
    const chosen = Array.from(selected.values());
    if (!chosen.length) return;
    onAdd(chosen);
    if (shouldClosePickerAfterAdd(replacementMode)) onOpenChange(false);
  }

  function clearFilters() {
    setQuery(""); setMuscle(""); setEquipment(""); setDifficulty(""); setMuscleCategory("");
    setSecondaryMuscle(""); setForceType(""); setExerciseType(""); setMechanics("");
  }

  async function loadMore() {
    const nextOffset = pagination.nextOffset;
    if (!pagination.hasMore || nextOffset === null || loadingMore) return;
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    const generation = generationRef.current;
    const requestGroupId = activeGenerationGroupRef.current ?? createCatalogRequestGroupId();
    activeGenerationGroupRef.current = requestGroupId;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const result = await getWorkoutsWithStatus(query.trim(), activeFilters, nextOffset, locale, {
        requestGroupId,
        signal: controller.signal
      });
      if (controller.signal.aborted || generationRef.current !== generation) return;
      setResults((current) => {
        const keys = new Set(current.map(exerciseKey));
        return [...current, ...result.data.filter((exercise) => {
          const key = exerciseKey(exercise);
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        })];
      });
      setPagination(result.pagination ?? emptyPagination);
      if (result.filterOptions) setFilterOptions((options) => mergeCanonicalWorkoutFilterOptions(options, result.filterOptions!));
    } catch (loadError) {
      if (controller.signal.aborted || generationRef.current !== generation || isAbortError(loadError)) return;
      setLoadMoreError(userSafeError(loadError, tr("moreExercisesLoadFallback")));
    } finally {
      if (!controller.signal.aborted && generationRef.current === generation) setLoadingMore(false);
    }
  }

  const hasFilters = Boolean(query || muscle || equipment || difficulty || muscleCategory || secondaryMuscle || forceType || exerciseType || mechanics);
  const activeFilterChips = [
    muscle ? { id: "muscle", label: optionLabel(muscleOptions, muscle), clear: () => setMuscle("") } : null,
    equipment ? { id: "equipment", label: optionLabel(equipmentOptions, equipment), clear: () => setEquipment("") } : null,
    difficulty ? { id: "difficulty", label: optionLabel(difficultyOptions, difficulty), clear: () => setDifficulty("") } : null,
    muscleCategory ? { id: "muscle-category", label: optionLabel(muscleCategoryOptions, muscleCategory), clear: () => setMuscleCategory("") } : null,
    secondaryMuscle ? { id: "secondary-muscle", label: optionLabel(secondaryMuscleOptions, secondaryMuscle), clear: () => setSecondaryMuscle("") } : null,
    forceType ? { id: "force-type", label: optionLabel(forceTypeOptions, forceType), clear: () => setForceType("") } : null,
    exerciseType ? { id: "exercise-type", label: optionLabel(exerciseTypeOptions, exerciseType), clear: () => setExerciseType("") } : null,
    mechanics ? { id: "mechanics", label: optionLabel(mechanicsOptions, mechanics), clear: () => setMechanics("") } : null
  ].filter((chip): chip is { id: string; label: string; clear: () => void } => Boolean(chip));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layout="responsive-drawer"
        className="inset-x-0 bottom-0 top-0 h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 sm:inset-x-0 sm:bottom-0 sm:top-0 sm:h-dvh sm:max-h-dvh sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(54rem,100vw)] lg:max-w-[54rem] lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:border-y-0 lg:border-l lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"
        closeLabel={tr("closePicker")}
        dir={dir}
        data-train-exercise-picker
        onOpenAutoFocus={() => {
          if (returnFocusRef.current?.isConnected) return;
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement && !activeElement.closest("[data-train-exercise-picker]")) {
            returnFocusRef.current = activeElement;
          }
        }}
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (!returnTarget?.isConnected) return;
          event.preventDefault();
          returnTarget.focus();
          window.requestAnimationFrame(() => {
            if (document.activeElement !== returnTarget) returnTarget.focus();
          });
        }}
      >
        <DialogHeader className="mb-0 shrink-0 border-b px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] pe-16 text-start lg:pt-4">
          <DialogTitle className="text-xl">{tr("addExercisesTo", { day: dayName })}</DialogTitle>
          <DialogDescription className="font-medium text-foreground/70">{tr("selectionPreserved", { count: selected.size })}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-32 sm:px-5" data-picker-scroll-region>
          <div className="sticky -top-4 z-20 -mx-4 flex gap-2 overflow-x-auto border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible" data-picker-filters>
            <label className="relative min-w-[240px] shrink-0 lg:min-w-0">
              <span className="sr-only">{tr("searchExercises")}</span>
              <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 ps-10" placeholder={tr("searchExercises")} />
            </label>
            <div className="min-w-[180px] shrink-0 lg:min-w-0"><Select className="h-12 w-full rounded-full border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={tr("primaryMuscle")} value={muscle} onChange={setMuscle} placeholder={tr("primaryMuscle")} options={muscleOptions} /></div>
            <div className="min-w-[180px] shrink-0 lg:min-w-0"><Select className="h-12 w-full rounded-full border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={tr("equipment")} value={equipment} onChange={setEquipment} placeholder={tr("equipment")} options={equipmentOptions} /></div>
            <div className="min-w-[180px] shrink-0 lg:min-w-0"><Select className="h-12 w-full rounded-full border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={tr("difficulty")} value={difficulty} onChange={setDifficulty} placeholder={tr("difficulty")} options={difficultyOptions} /></div>
            {hasFilters ? <Button type="button" variant="ghost" className="min-h-11 justify-self-start px-2 sm:col-span-2 lg:col-span-4" onClick={clearFilters}>{tr("clear")}</Button> : null}
          </div>
          {activeFilterChips.length ? <div className="mt-3 flex gap-2 overflow-x-auto" aria-label={tr("filters")}>{activeFilterChips.map((chip) => <button key={chip.id} type="button" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 text-sm font-medium" onClick={chip.clear}>{chip.label}<X className="h-4 w-4" aria-hidden="true" /></button>)}</div> : null}

          {hasAdvancedOptions ? <details className="mt-3 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
            <summary className="min-h-11 cursor-pointer select-none content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tr("moreFilters")}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {muscleCategoryOptions.length ? <Select aria-label={tr("muscleCategory")} value={muscleCategory} onChange={setMuscleCategory} placeholder={tr("muscleCategory")} options={muscleCategoryOptions} /> : null}
              {secondaryMuscleOptions.length ? <Select aria-label={tr("secondaryMuscle")} value={secondaryMuscle} onChange={setSecondaryMuscle} placeholder={tr("secondaryMuscle")} options={secondaryMuscleOptions} /> : null}
              {forceTypeOptions.length ? <Select aria-label={tr("forceType")} value={forceType} onChange={setForceType} placeholder={tr("forceType")} options={forceTypeOptions} /> : null}
              {exerciseTypeOptions.length ? <Select aria-label={tr("exerciseType")} value={exerciseType} onChange={setExerciseType} placeholder={tr("exerciseType")} options={exerciseTypeOptions} /> : null}
              {mechanicsOptions.length ? <Select aria-label={tr("mechanics")} value={mechanics} onChange={setMechanics} placeholder={tr("mechanics")} options={mechanicsOptions} /> : null}
            </div>
          </details> : null}

          {loading ? <div className="mt-4"><CardGridSkeleton count={4} rows={3} /></div> : null}
          {error ? <div role="alert" className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div> : null}
          {replacementMode && eligibilityError ? (
            <div role="alert" className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              {eligibilityError}
            </div>
          ) : null}

          {!loading && !error ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2" data-picker-results>
                {results.map((exercise) => {
                  const key = exerciseKey(exercise);
                  const duplicate = existing.has(key);
                  const isSelected = selected.has(key);
                  const candidateEligibility = eligibility.get(key);
                  const candidatePending = replacementMode && eligibilityLoading;
                  const ineligible = replacementMode && !candidatePending && candidateEligibility?.eligible !== true;
                  const disabled = duplicate || candidatePending || ineligible || Boolean(replacementMode && eligibilityError);
                  const guideUrl = exercise.custom_video_url || exercise.video_url || exercise.exercise_url;
                  return (
                    <article
                      key={key}
                      className={`relative flex min-h-[152px] flex-col rounded-2xl border p-4 ${disabled ? "border-border/60 bg-muted/30" : isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"}`}
                    >
                      <button type="button" className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={disabled} aria-pressed={isSelected} onClick={() => toggle(exercise)}><span className="sr-only">{isSelected ? tr("deselect") : tr("select")}: {exercise.name}</span></button>
                      <div className="pointer-events-none relative z-10 flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-semibold leading-6">{exercise.name}</h3>
                          <p className="mt-1 break-words text-sm text-muted-foreground">{exercise.target_muscle} · {exercise.equipment}</p>
                        </div>
                        {exercise.difficulty ? <Badge variant="outline" className="shrink-0">{exercise.difficulty}</Badge> : null}
                      </div>
                      <p className="pointer-events-none relative z-10 mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{exercise.instructions}</p>
                      {replacementMode && candidatePending ? <p className="relative z-10 mt-2 text-xs text-muted-foreground">Verifying tracked replacement eligibility…</p> : null}
                      {replacementMode && ineligible ? <p className="relative z-10 mt-2 text-xs text-muted-foreground">{replacementEligibilityMessage(candidateEligibility?.reason)}</p> : null}
                      <div className={`relative z-10 mt-auto grid gap-2 pt-4 ${guideUrl ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                        <Button type="button" variant={isSelected ? "default" : "outline"} className="min-h-11 w-full" disabled={disabled} aria-pressed={isSelected} onClick={() => toggle(exercise)}>
                          {duplicate || isSelected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          {duplicate ? tr("alreadyAdded") : isSelected ? tr("deselect") : ineligible ? "Unavailable" : candidatePending ? "Checking…" : tr("select")}
                        </Button>
                        {guideUrl ? <Button asChild type="button" variant="ghost" className="min-h-11"><a href={guideUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><ExternalLink className="h-4 w-4" />{tr("viewGuide")}</a></Button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {results.length && (pagination.hasMore || loadMoreError) ? <div className="mt-5 flex flex-col items-center gap-3" data-picker-load-more>
                {loadMoreError ? <div role="alert" className="w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{loadMoreError}</div> : null}
                {pagination.hasMore ? <Button type="button" variant="outline" className="min-h-12 min-w-40" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? tr("loadingLabel") : tr("loadMore")}</Button> : null}
              </div> : null}
            </>
          ) : null}

          {!loading && !error && !results.length ? <div className="mt-4 grid min-h-40 place-items-center rounded-2xl border border-dashed text-center"><div><Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">{tr("noExercisesFound")}</p><p className="text-sm text-muted-foreground">{tr("broaderSearch")}</p></div></div> : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5" data-picker-footer>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-11 items-center gap-2">
              <span className="text-sm font-semibold">{tr("selectedCount", { count: selected.size })}</span>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSelected(new Map())} disabled={!selected.size}>{tr("clear")}</Button>
            </div>
            <Button type="button" className="min-h-[52px] w-full sm:w-auto sm:min-w-44" onClick={addSelected} disabled={!selected.size || (replacementMode && (eligibilityLoading || Boolean(eligibilityError)))}>{tr("addNExercises", { count: selected.size })}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { exerciseKey };
