"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Heart, MoreHorizontal, Play, Plus, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import {
  emptyCanonicalWorkoutFilterOptions,
  getCanonicalWorkoutFilterOptionsWithStatus,
  getWorkoutsWithStatus,
  matchesWorkoutRecord,
  mergeCanonicalWorkoutFilterOptions,
  normalizeWorkoutFilterText,
  resolveCanonicalWorkoutFilterValues,
  type CanonicalWorkoutFilterOptions,
  type WorkoutFilterOption,
  type WorkoutFilters,
  type WorkoutLibraryStatus
} from "@/services/database/workout-library";
import { getCustomExercisesWithStatus, getFavoriteExerciseIdsWithStatus, saveCustomExercise, setFavoriteExercise, type CustomExerciseInput } from "@/services/workouts/exercise-library-store";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { formatExerciseDisplayList, formatExerciseDisplayValue } from "@/lib/train/exercise-display";
import type { Workout } from "@/types";

type FilterKey =
  | "muscleCategories"
  | "primaryMuscles"
  | "equipmentRequired"
  | "mechanics"
  | "exerciseTypes"
  | "forceTypes"
  | "experienceLevels"
  | "secondaryMuscles";

const emptyFilters: Record<FilterKey, string[]> = {
  muscleCategories: [],
  primaryMuscles: [],
  equipmentRequired: [],
  mechanics: [],
  exerciseTypes: [],
  forceTypes: [],
  experienceLevels: [],
  secondaryMuscles: []
};

const emptyOptions = emptyCanonicalWorkoutFilterOptions();

const filterStorageKey = "plaivra-workout-browser-filters";
const filterParamKeys: Record<FilterKey, string> = {
  muscleCategories: "muscle",
  primaryMuscles: "primary",
  equipmentRequired: "equip",
  mechanics: "mech",
  exerciseTypes: "type",
  forceTypes: "force",
  experienceLevels: "level",
  secondaryMuscles: "secondary"
};

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function hasInvalidUrl(value: string | null | undefined) {
  const clean = value?.trim();
  return Boolean(clean && !/^https?:\/\/[^\s]+$/i.test(clean));
}

function splitParam(value: string | null) {
  return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

function readPersistedFilterState() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const urlFilters = Object.keys(filterParamKeys).reduce((next, key) => {
    const filterKey = key as FilterKey;
    next[filterKey] = splitParam(params.get(filterParamKeys[filterKey]));
    return next;
  }, { ...emptyFilters } as Record<FilterKey, string[]>);
  const urlQuery = params.get("q") ?? "";
  const urlShowAll = params.get("all") === "1";
  const hasUrlState = Boolean(urlQuery || urlShowAll || Object.values(urlFilters).some((values) => values.length));
  if (hasUrlState) return { query: urlQuery, filters: urlFilters, showAll: urlShowAll };

  const stored = window.localStorage.getItem(filterStorageKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as { query: string; filters: Record<FilterKey, string[]>; showAll?: boolean };
  } catch {
    return null;
  }
}

function persistFilterState(query: string, filters: Record<FilterKey, string[]>, showAll: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(filterStorageKey, JSON.stringify({ query, filters, showAll }));
  const params = new URLSearchParams(window.location.search);
  if (query) params.set("q", query);
  else params.delete("q");
  if (showAll) params.set("all", "1");
  else params.delete("all");
  (Object.keys(filterParamKeys) as FilterKey[]).forEach((key) => {
    const values = filters[key];
    if (values.length) params.set(filterParamKeys[key], values.join("|"));
    else params.delete(filterParamKeys[key]);
  });
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState(null, "", nextUrl);
}

const emptyCustomExercise: CustomExerciseInput = {
  name: "",
  targetMuscle: "",
  secondaryMuscles: "",
  equipment: "",
  difficulty: "",
  instructions: "",
  videoUrl: ""
};

export function WorkoutBrowser() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const { language, dir, locale, tr } = useTrainTranslation();
  const userId = user?.id;
  const [query, setQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<CanonicalWorkoutFilterOptions>(emptyOptions);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(emptyFilters);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [customExercises, setCustomExercises] = useState<Workout[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomExerciseInput>(emptyCustomExercise);
  const [nextProviderOffset, setNextProviderOffset] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [openFilters, setOpenFilters] = useState<FilterKey[]>([]);
  const [showFiltersDialog, setShowFiltersDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState<WorkoutLibraryStatus | null>(null);
  const [filterError, setFilterError] = useState("");
  const [resultStatus, setResultStatus] = useState<WorkoutLibraryStatus | null>(null);
  const [resultError, setResultError] = useState("");
  const [reloadResultsNonce, setReloadResultsNonce] = useState(0);
  const [personalLibraryMessages, setPersonalLibraryMessages] = useState<string[]>([]);
  const [isLoadingPersonalLibrary, setIsLoadingPersonalLibrary] = useState(true);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([]);
  const [favoriteErrors, setFavoriteErrors] = useState<Record<string, string>>({});
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [customFormError, setCustomFormError] = useState("");
  const [customSaveStatus, setCustomSaveStatus] = useState<"idle" | "saved" | "failed">("idle");
  const customDraftDirty = Object.values(customDraft).some((value) => value.trim());
  const customVideoInvalid = hasInvalidUrl(customDraft.videoUrl);
  const pendingFavoriteSet = useMemo(() => new Set(pendingFavoriteIds), [pendingFavoriteIds]);

  useEffect(() => {
    const persisted = readPersistedFilterState();
    if (persisted) {
      setQuery(persisted.query ?? "");
      setFilters({ ...emptyFilters, ...(persisted.filters ?? {}) });
      setShowAllWorkouts(Boolean(persisted.showAll));
    }
    setIsHydrated(true);
  }, []);

  const loadPersonalLibrary = useCallback(async () => {
    setIsLoadingPersonalLibrary(true);
    try {
      const [favorites, custom] = await Promise.all([
        getFavoriteExerciseIdsWithStatus(userId),
        getCustomExercisesWithStatus(userId)
      ]);
      setFavoriteIds(favorites.data);
      setCustomExercises(custom.data);
      setPersonalLibraryMessages([favorites.status.message, custom.status.message].filter(Boolean) as string[]);
    } finally {
      setIsLoadingPersonalLibrary(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPersonalLibrary();
  }, [loadPersonalLibrary]);

  const loadFilterOptions = useCallback(async () => {
    setFilterError("");
    try {
      const result = await getCanonicalWorkoutFilterOptionsWithStatus(locale);
      setFilterOptions(result.data);
      setFilters((current) => resolveCanonicalWorkoutFilterValues(current, result.data) as Record<FilterKey, string[]>);
      setFilterStatus(result.status);
    } catch (error) {
      const message = userSafeError(error, tr("exerciseFiltersLoadFallback"));
      setFilterOptions(emptyOptions);
      setFilterStatus(null);
      setFilterError(message);
      toast({ title: tr("workoutFiltersLoadFailed"), description: message });
    }
  }, [locale, toast, tr]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  const activeFilterCount = useMemo(() => Object.values(filters).reduce((sum, values) => sum + values.length, 0), [filters]);
  const requestFilters: WorkoutFilters = filters;
  const hasActiveLibraryRequest = Boolean(showAllWorkouts || favoritesOnly || query.trim() || activeFilterCount);

  useEffect(() => {
    if (!isHydrated) return;
    persistFilterState(query, filters, showAllWorkouts);
  }, [filters, isHydrated, query, showAllWorkouts]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!hasActiveLibraryRequest) {
      setWorkouts([]);
      setNextProviderOffset(null);
      setHasMore(false);
      setIsLoading(false);
      setResultError("");
      setResultStatus(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setNextProviderOffset(null);
      setResultError("");
      getWorkoutsWithStatus(query.trim(), requestFilters, 0, locale)
        .then((result) => {
          if (!active) return;
          setWorkouts(result.data);
          if (result.filterOptions) setFilterOptions((current) => mergeCanonicalWorkoutFilterOptions(current, result.filterOptions!));
          setResultStatus(result.status);
          setNextProviderOffset(result.pagination?.nextOffset ?? null);
          setHasMore(Boolean(result.pagination?.hasMore));
        })
        .catch((error) => {
          if (!active) return;
          const message = userSafeError(error, tr("searchFailedFiltersKept"));
          setResultError(message);
          toast({ title: tr("workoutsLoadFailed"), description: message });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, hasActiveLibraryRequest, isHydrated, locale, query, reloadResultsNonce, requestFilters, toast, tr]);

  const visibleCustomExercises = hasActiveLibraryRequest ? customExercises.filter((workout) => matchesWorkoutRecord(workout, query.trim(), filters, filterOptions)) : [];
  const visibleGlobalExercises = hasActiveLibraryRequest ? workouts.filter((workout) => matchesWorkoutRecord(workout, query.trim(), filters, filterOptions)) : [];
  const allVisibleWorkouts = [...visibleCustomExercises, ...visibleGlobalExercises].filter((workout, index, all) => all.findIndex((item) => item.id === workout.id) === index);
  const filteredWorkouts = favoritesOnly ? allVisibleWorkouts.filter((workout) => favoriteIds.includes(workout.id)) : allVisibleWorkouts;
  const duplicateExerciseNames = useMemo(() => duplicateWorkoutNames(filteredWorkouts), [filteredWorkouts]);
  const qualityCounts = useMemo(() => summarizeExerciseQuality(filteredWorkouts, duplicateExerciseNames), [duplicateExerciseNames, filteredWorkouts]);

  async function loadMore() {
    if (!hasActiveLibraryRequest) return;
    if (nextProviderOffset === null) return;
    setIsLoading(true);
    setResultError("");
    try {
      const result = await getWorkoutsWithStatus(query.trim(), requestFilters, nextProviderOffset, locale);
      setWorkouts((current) => [...current, ...result.data]);
      if (result.filterOptions) setFilterOptions((current) => mergeCanonicalWorkoutFilterOptions(current, result.filterOptions!));
      setResultStatus(result.status);
      setNextProviderOffset(result.pagination?.nextOffset ?? null);
      setHasMore(Boolean(result.pagination?.hasMore));
    } catch (error) {
      const message = userSafeError(error, tr("moreExercisesLoadFallback"));
      setResultError(message);
      toast({ title: tr("moreWorkoutsLoadFailed"), description: message });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((current) => {
      const values = current[key];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: nextValues };
    });
    setOpenFilters((current) => Array.from(new Set([...current, key])));
  }

  function toggleFilterGroup(key: FilterKey) {
    setOpenFilters((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return Array.from(new Set([...current.filter((item) => filters[item].length), key]));
    });
  }

  function resetFilters() {
    setQuery("");
    setFilters(emptyFilters);
    setOpenFilters([]);
    setFavoritesOnly(false);
    setShowAllWorkouts(false);
    if (typeof window !== "undefined") window.localStorage.removeItem(filterStorageKey);
  }

  async function toggleFavorite(workout: Workout) {
    if (pendingFavoriteSet.has(workout.id)) return;
    const nextFavorite = !favoriteIds.includes(workout.id);
    const previousIds = favoriteIds;
    const optimisticIds = nextFavorite
      ? Array.from(new Set([...favoriteIds, workout.id]))
      : favoriteIds.filter((id) => id !== workout.id);
    setPendingFavoriteIds((current) => Array.from(new Set([...current, workout.id])));
    setFavoriteIds(optimisticIds);
    setFavoriteErrors((current) => ({ ...current, [workout.id]: "" }));
    try {
      const nextIds = await setFavoriteExercise(userId, workout.id, nextFavorite);
      setFavoriteIds(nextIds);
      toast({
        title: nextFavorite ? tr("exerciseFavorited") : tr("exerciseUnfavorited"),
        description: tr(nextFavorite ? "favoriteSavedDescription" : "favoriteRemovedDescription", { name: workout.name })
      });
    } catch (error) {
      const message = userSafeError(error, tr("favoriteChangeFailed"));
      setFavoriteIds(previousIds);
      setFavoriteErrors((current) => ({ ...current, [workout.id]: message }));
      toast({ title: tr("favoriteNotSaved"), description: message });
    } finally {
      setPendingFavoriteIds((current) => current.filter((id) => id !== workout.id));
    }
  }

  async function createCustomExercise() {
    if (isSavingCustom) return;
    if (!customDraft.name.trim()) {
      setCustomFormError(tr("exerciseNameRequired"));
      setCustomSaveStatus("failed");
      return;
    }
    if (customVideoInvalid) {
      setCustomFormError(tr("invalidCustomVideoUrl"));
      setCustomSaveStatus("failed");
      return;
    }
    try {
      setIsSavingCustom(true);
      setCustomFormError("");
      setCustomSaveStatus("idle");
      const saved = await saveCustomExercise(userId, customDraft);
      setCustomExercises((current) => [saved, ...current]);
      setCustomDraft(emptyCustomExercise);
      setShowCustomForm(false);
      setCustomSaveStatus("saved");
      toast({ title: tr("customExerciseCreated"), description: tr("customExerciseCreatedDescription", { name: saved.name }) });
    } catch (error) {
      const message = userSafeError(error, tr("customCreateFallback"));
      setCustomFormError(message);
      setCustomSaveStatus("failed");
      toast({ title: tr("customCreateFailed"), description: message });
    } finally {
      setIsSavingCustom(false);
    }
  }

  function closeCustomForm() {
    if (!customDraftDirty) {
      setShowCustomForm(false);
      setCustomFormError("");
      setCustomSaveStatus("idle");
      return;
    }
    ask({
      title: tr("discardCustomDraftTitle"),
      description: tr("discardCustomDraftDescription"),
      confirmLabel: tr("discardDraft"),
      cancelLabel: tr("keepEditing"),
      variant: "destructive",
      onConfirm: () => {
        setCustomDraft(emptyCustomExercise);
        setCustomFormError("");
        setCustomSaveStatus("idle");
        setShowCustomForm(false);
      }
    });
  }

  function toggleCustomForm() {
    if (showCustomForm) closeCustomForm();
    else {
      setShowCustomForm(true);
      setCustomFormError("");
      setCustomSaveStatus("idle");
    }
  }

  const resultMessages = Array.from(new Set([
    filterStatus?.message,
    resultStatus?.message,
    ...personalLibraryMessages
  ].filter(Boolean) as string[]));
  const hasDegradedLibraryState = Boolean(resultMessages.length || filterError || resultError);
  const resultStatusTitle = resultError
    ? tr("searchFailed")
    : isLoading
      ? tr("updatingExerciseResults")
      : hasActiveLibraryRequest
        ? tr("exercisesShown", { count: filteredWorkouts.length })
        : tr("readyToBrowse");
  const resultStatusDescription = resultError
    ? tr("searchFailureVisible")
    : hasActiveLibraryRequest
      ? tr("sessionStartLibraryDescription")
      : tr("libraryBrowseDescription");

  const filterPanelContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{tr("showAllWorkouts")}</p>
          <p className="text-sm text-muted-foreground">{tr("showAllHint")}</p>
        </div>
        <Button type="button" variant={showAllWorkouts ? "default" : "outline"} className="min-h-12" onClick={() => setShowAllWorkouts((current) => !current)}>
          {showAllWorkouts ? tr("all") : tr("showAll")}
        </Button>
      </div>
      {filterError ? (
        <ErrorState
          title={tr("filterOptionsLoadFailed")}
          description={filterError}
          onRetry={loadFilterOptions}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterGroup title={tr("muscleCategory")} values={filterOptions.muscleCategories} selected={filters.muscleCategories} open={openFilters.includes("muscleCategories")} onOpenChange={() => toggleFilterGroup("muscleCategories")} onToggle={(value) => toggleFilter("muscleCategories", value)} />
        <FilterGroup title={tr("primaryMuscle")} values={filterOptions.primaryMuscles} selected={filters.primaryMuscles} open={openFilters.includes("primaryMuscles")} onOpenChange={() => toggleFilterGroup("primaryMuscles")} onToggle={(value) => toggleFilter("primaryMuscles", value)} />
        <FilterGroup title={tr("equipment")} values={filterOptions.equipmentRequired} selected={filters.equipmentRequired} open={openFilters.includes("equipmentRequired")} onOpenChange={() => toggleFilterGroup("equipmentRequired")} onToggle={(value) => toggleFilter("equipmentRequired", value)} />
        <FilterGroup title={tr("mechanics")} values={filterOptions.mechanics} selected={filters.mechanics} open={openFilters.includes("mechanics")} onOpenChange={() => toggleFilterGroup("mechanics")} onToggle={(value) => toggleFilter("mechanics", value)} />
        <FilterGroup title={tr("exerciseType")} values={filterOptions.exerciseTypes} selected={filters.exerciseTypes} open={openFilters.includes("exerciseTypes")} onOpenChange={() => toggleFilterGroup("exerciseTypes")} onToggle={(value) => toggleFilter("exerciseTypes", value)} />
        <FilterGroup title={tr("forceType")} values={filterOptions.forceTypes} selected={filters.forceTypes} open={openFilters.includes("forceTypes")} onOpenChange={() => toggleFilterGroup("forceTypes")} onToggle={(value) => toggleFilter("forceTypes", value)} />
        <FilterGroup title={tr("difficulty")} values={filterOptions.experienceLevels} selected={filters.experienceLevels} open={openFilters.includes("experienceLevels")} onOpenChange={() => toggleFilterGroup("experienceLevels")} onToggle={(value) => toggleFilter("experienceLevels", value)} />
        <FilterGroup title={tr("secondaryMuscles")} values={filterOptions.secondaryMuscles} selected={filters.secondaryMuscles} open={openFilters.includes("secondaryMuscles")} onOpenChange={() => toggleFilterGroup("secondaryMuscles")} onToggle={(value) => toggleFilter("secondaryMuscles", value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {activeFilterCount > 0 ? (
          <Button variant="outline" className="min-h-12" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" /> {tr("clearFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-5" dir={dir}>
      <div className="rounded-2xl border border-border/70 bg-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("searchExercisesLong")}
            className="h-12 ps-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((current) => !current)} className="min-h-12">
            <Heart className={cn("h-4 w-4", favoritesOnly && "fill-current")} /> {tr("favorites")}
          </Button>
          <Button variant="outline" onClick={toggleCustomForm} className="min-h-12">
            <Plus className="h-4 w-4" /> {showCustomForm ? tr("closeCustom") : tr("custom")}
          </Button>
          <Button variant="outline" onClick={() => setShowFiltersDialog(true)} className="min-h-12 lg:hidden">
            <SlidersHorizontal className="h-4 w-4" /> {tr("filters")} {activeFilterCount ? `(${activeFilterCount})` : ""}
          </Button>
          <Button variant="outline" onClick={resetFilters} disabled={!query && activeFilterCount === 0 && !favoritesOnly} className="min-h-12">
            <RotateCcw className="h-4 w-4" /> {tr("reset")}
          </Button>
        </div>
      </div>

      {customSaveStatus === "saved" ? (
        <StatusBanner
          tone="success"
          title={tr("customExerciseSaved")}
          description={tr("customExercisePrivateAvailable")}
        />
      ) : null}

      {showCustomForm ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr("createCustomExercise")}</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">{tr("customExerciseHelp")}</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {customFormError ? (
              <div className="md:col-span-2">
                <StatusBanner tone="error" title={tr("customExerciseNotSaved")} description={customFormError} />
              </div>
            ) : null}
            <Field label={tr("name")} value={customDraft.name} onChange={(value) => setCustomDraft((current) => ({ ...current, name: value }))} placeholder={tr("customNamePlaceholder")} required />
            <Field label={tr("targetMuscle")} value={customDraft.targetMuscle} onChange={(value) => setCustomDraft((current) => ({ ...current, targetMuscle: value }))} placeholder={tr("shouldersPlaceholder")} />
            <Field label={tr("secondaryMuscles")} value={customDraft.secondaryMuscles} onChange={(value) => setCustomDraft((current) => ({ ...current, secondaryMuscles: value }))} placeholder={tr("secondaryMusclesPlaceholder")} />
            <Field label={tr("equipment")} value={customDraft.equipment} onChange={(value) => setCustomDraft((current) => ({ ...current, equipment: value }))} placeholder={tr("equipmentPlaceholder")} />
            <Field label={tr("difficulty")} value={customDraft.difficulty} onChange={(value) => setCustomDraft((current) => ({ ...current, difficulty: value }))} placeholder={tr("difficultyPlaceholder")} />
            <Field
              label={tr("videoUrl")}
              value={customDraft.videoUrl}
              onChange={(value) => setCustomDraft((current) => ({ ...current, videoUrl: value }))}
              placeholder="https://..."
              error={customVideoInvalid ? tr("invalidCustomVideoUrl") : undefined}
            />
            <div className="space-y-1 md:col-span-2">
              <Label>{tr("instructions")}</Label>
              <textarea value={customDraft.instructions} onChange={(event) => setCustomDraft((current) => ({ ...current, instructions: event.target.value }))} className="min-h-24 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={tr("instructionsPlaceholder")} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
              <Button className="min-h-12" onClick={createCustomExercise} disabled={isSavingCustom || customVideoInvalid}>
                {isSavingCustom ? tr("savingPlan") : tr("saveCustomExercise")}
              </Button>
              <Button className="min-h-12" variant="outline" onClick={closeCustomForm} disabled={isSavingCustom}>{tr("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="hidden rounded-2xl border border-border/70 bg-card p-4 lg:block">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <p className="font-semibold text-foreground">{tr("filters")}</p>
            {activeFilterCount ? <Badge>{tr("selectedCount", { count: activeFilterCount })}</Badge> : null}
            {favoritesOnly ? <Badge variant="success">{tr("favoritesOnly")}</Badge> : null}
            {showAllWorkouts ? <Badge variant="success">{tr("showingAll")}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{tr("exercisesShown", { count: filteredWorkouts.length })}</p>
        </div>
        {filterPanelContent}
      </div>

      <Dialog open={showFiltersDialog} onOpenChange={setShowFiltersDialog}>
        <DialogContent variant="glass" className="max-h-[85dvh] overflow-y-auto pb-0">
          <DialogHeader>
            <DialogTitle>{tr("filters")}</DialogTitle>
            <DialogDescription>{tr("exerciseMatches", { count: filteredWorkouts.length })}</DialogDescription>
          </DialogHeader>
          {filterPanelContent}
          <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t bg-card/95 p-4 backdrop-blur sm:-mx-6 sm:px-6">
            <Button onClick={() => setShowFiltersDialog(false)} className="min-h-12 flex-1">{tr("apply")}</Button>
            <Button variant="outline" className="min-h-12" onClick={() => { resetFilters(); setShowFiltersDialog(false); }}>{tr("clearFilters")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StatusBanner
        tone={resultError ? "error" : hasDegradedLibraryState ? "warning" : "default"}
        title={resultStatusTitle}
        description={resultStatusDescription}
        badges={[
          resultStatus?.source === "fallback" ? tr("fallbackData") : null,
          resultStatus?.source === "partial" || filterStatus?.source === "partial" ? tr("partialSource") : null,
          activeFilterCount ? tr("activeFilters", { count: activeFilterCount }) : null,
          favoritesOnly ? tr("favoritesOnly") : null,
          showAllWorkouts ? tr("showingAll") : null,
          isLoadingPersonalLibrary ? tr("loadingSavedItems") : null
        ].filter(Boolean) as string[]}
      />

      {resultMessages.map((message, index) => (
        <StatusBanner key={`${index}-${message}`} tone="warning" title={tr("librarySourceNotice")} description={tr("librarySourceNoticeDescription")} />
      ))}

      {resultError ? (
        <ErrorState
          title={tr("exerciseSearchFailed")}
          description={resultError}
          onRetry={() => setReloadResultsNonce((current) => current + 1)}
        />
      ) : null}

      {profile?.role === "admin" ? (
        <Card variant="glassStrong">
          <CardHeader>
            <CardTitle className="text-base">{tr("exerciseLibraryQuality")}</CardTitle>
            <p className="text-sm text-muted-foreground">{tr("exerciseLibraryQualityDescription")}</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <QualityMetric label={tr("missingVideo")} value={qualityCounts.missingVideo} detail={tr("noVideoGuideFound")} />
            <QualityMetric label={tr("missingInstructions")} value={qualityCounts.missingInstructions} detail={tr("instructionReviewNeeded")} />
            <QualityMetric label={tr("missingMuscleEquipment")} value={qualityCounts.missingLabels} detail={tr("filterQualityWeaker")} />
            <QualityMetric label={tr("duplicateNames")} value={qualityCounts.duplicates} detail={tr("duplicateNamesDescription")} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && !filteredWorkouts.length ? <CardGridSkeleton count={3} /> : null}
        {!isLoading && !hasActiveLibraryRequest ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState
              title={tr("startBrowsing")}
              description={tr("startBrowsingDescription")}
              actionLabel={tr("showAllWorkouts")}
              onAction={() => setShowAllWorkouts(true)}
            />
          </div>
        ) : null}
        {!isLoading && hasActiveLibraryRequest && !resultError && !filteredWorkouts.length ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState title={tr("noExercisesFound")} description={tr("broaderSearch")} actionLabel={tr("clearFilters")} onAction={resetFilters} />
          </div>
        ) : null}
        {filteredWorkouts.map((workout) => {
          const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
          const favorite = favoriteIds.includes(workout.id);
          const favoritePending = pendingFavoriteSet.has(workout.id);
          const favoriteError = favoriteErrors[workout.id];
          const quality = exerciseQuality(workout, duplicateExerciseNames.has(normalizeWorkoutFilterText(workout.name)));
          return (
            <Card key={workout.id} variant="glass" className="shadow-luxe">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{workout.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{formatExerciseDisplayList(workout.target_muscle || workout.muscle_category, language, "muscle")}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge>{formatExerciseDisplayValue(workout.experience_level || workout.difficulty, language, "difficulty")}</Badge>
                    {!workout.is_global ? <Badge variant="success">{tr("custom")}</Badge> : null}
                    {profile?.role === "admin" ? quality.map((item) => <Badge key={item} variant="outline">{tr(qualityLabels[item])}</Badge>) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{formatExerciseDisplayList(workout.equipment_required || workout.equipment, language, "equipment")}</Badge>
                  {workout.movement_pattern || workout.mechanics ? <Badge variant="outline">{formatExerciseDisplayValue(workout.movement_pattern || workout.mechanics, language, "movement")}</Badge> : null}
                  {workout.force_type ? <Badge variant="outline">{formatExerciseDisplayValue(workout.force_type, language, "force")}</Badge> : null}
                  {workout.sets ? <Badge variant="outline">{tr("setsCount", { count: workout.sets })}</Badge> : null}
                  {workout.reps ? <Badge variant="outline">{workout.reps}</Badge> : null}
                </div>
                {workout.secondary_muscles?.length ? <p className="mt-2 text-xs text-muted-foreground">{tr("secondaryMusclesNamed", { names: formatExerciseDisplayList(workout.secondary_muscles, language, "muscle") })}</p> : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button asChild className="min-h-12">
                    <Link href={`/workouts/session/${workout.id}`}><Play className="h-4 w-4" /> {tr("startSession")}</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-12">
                    <Link href={`/workouts/${workout.id}`} aria-label={`${tr("details")}: ${workout.name}`}><MoreHorizontal className="h-4 w-4" /> {tr("details")}</Link>
                  </Button>
                  <Button variant="outline" className="min-h-12" onClick={() => toggleFavorite(workout)} disabled={favoritePending} aria-label={favorite ? tr("unfavorite") : tr("favorite")} aria-busy={favoritePending}>
                    <Heart className={cn("h-4 w-4", favorite && "fill-current text-primary")} />
                    {favoritePending ? tr("saving") : favorite ? tr("savedLabel") : tr("save")}
                  </Button>
                  {guideUrl ? (
                    <Button asChild variant="outline" className="min-h-12">
                      <a href={guideUrl} target="_blank" rel="noreferrer" aria-label={`${tr("guide")}: ${workout.name}`}><ExternalLink className="h-4 w-4" /> {tr("guide")}</a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="min-h-12" disabled>{tr("noGuide")}</Button>
                  )}
                </div>
                {favoriteError ? <p className="mt-3 text-sm leading-6 text-destructive">{favoriteError}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hasMore && !favoritesOnly ? <div className="flex justify-center"><Button className="min-h-12" variant="outline" onClick={loadMore} disabled={isLoading}>{isLoading ? tr("loadingLabel") : tr("loadMore")}</Button></div> : null}
      {dialog}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      <Input className="h-12" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={Boolean(error)} />
      {error ? <p className="text-sm leading-6 text-destructive">{error}</p> : null}
    </div>
  );
}

function StatusBanner({
  tone = "default",
  title,
  description,
  badges = []
}: {
  tone?: "default" | "success" | "warning" | "error";
  title: string;
  description: string;
  badges?: string[];
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "default" ? CheckCircle2 : AlertTriangle;
  const className = tone === "error"
    ? "border-destructive/30 bg-destructive/5"
    : tone === "warning"
      ? "border-warning/30 bg-warning/10"
      : tone === "success"
        ? "border-success/30 bg-success/5"
        : "border-primary/20 bg-primary/5";
  const iconClassName = tone === "error"
    ? "text-destructive"
    : tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : "text-primary";

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClassName)} />
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {badges.length ? (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => <Badge key={badge} variant={tone === "error" ? "destructive" : "outline"}>{badge}</Badge>)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QualityMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="solid-row p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function duplicateWorkoutNames(workouts: Workout[]) {
  const counts = new Map<string, number>();
  workouts.forEach((workout) => {
    const key = normalizeWorkoutFilterText(workout.name);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

type QualityWarning = "missingVideo" | "missingInstructions" | "missingMuscle" | "missingEquipment" | "duplicate";
const qualityLabels = {
  missingVideo: "missingVideo",
  missingInstructions: "missingInstructions",
  missingMuscle: "missingMuscle",
  missingEquipment: "missingEquipment",
  duplicate: "duplicateName"
} as const;

function exerciseQuality(workout: Workout, duplicateName: boolean) {
  const warnings: QualityWarning[] = [];
  if (!workout.video_url && !workout.custom_video_url && !workout.exercise_url && !isLink(workout.notes)) warnings.push("missingVideo");
  if (!workout.instructions?.trim()) warnings.push("missingInstructions");
  if (!workout.target_muscle && !workout.muscle_category) warnings.push("missingMuscle");
  if (!workout.equipment && !workout.equipment_required) warnings.push("missingEquipment");
  if (duplicateName) warnings.push("duplicate");
  return warnings.slice(0, 3);
}

function summarizeExerciseQuality(workouts: Workout[], duplicates: Set<string>) {
  return workouts.reduce(
    (summary, workout) => {
      const warnings = exerciseQuality(workout, duplicates.has(normalizeWorkoutFilterText(workout.name)));
      return {
        missingVideo: summary.missingVideo + (warnings.includes("missingVideo") ? 1 : 0),
        missingInstructions: summary.missingInstructions + (warnings.includes("missingInstructions") ? 1 : 0),
        missingLabels: summary.missingLabels + (warnings.includes("missingMuscle") || warnings.includes("missingEquipment") ? 1 : 0),
        duplicates: summary.duplicates + (warnings.includes("duplicate") ? 1 : 0)
      };
    },
    { missingVideo: 0, missingInstructions: 0, missingLabels: 0, duplicates: 0 }
  );
}

function FilterGroup({ title, values, selected, open, onOpenChange, onToggle }: { title: string; values: WorkoutFilterOption[]; selected: string[]; open: boolean; onOpenChange: () => void; onToggle: (value: string) => void; }) {
  const byValue = new Map(values.map((option) => [option.value, option]));
  selected.forEach((value) => { if (!byValue.has(value)) byValue.set(value, { value, label: value }); });
  const availableValues = Array.from(byValue.values()).sort((left, right) => left.label.localeCompare(right.label));
  if (!availableValues.length) return null;
  return (
    <div className="solid-row p-3">
      <button type="button" onClick={onOpenChange} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-1 text-left">
        <span className="min-w-0 text-sm font-semibold text-foreground">{title}</span>
        <span className="flex items-center gap-2">{selected.length ? <Badge variant="outline">{selected.length}</Badge> : null}<ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} /></span>
      </button>
      {open ? (
        <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto pr-1">
          {availableValues.map((option) => (
            <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm transition hover:bg-card">
              <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} className="h-4 w-4 rounded border-border text-primary" />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
