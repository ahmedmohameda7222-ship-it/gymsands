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
import { getWorkoutFilterOptionsWithStatus, getWorkoutsWithStatus, workoutPageSize, type WorkoutFilterOptions, type WorkoutFilters, type WorkoutLibraryStatus } from "@/services/database/workout-library";
import { getCustomExercisesWithStatus, getFavoriteExerciseIdsWithStatus, saveCustomExercise, setFavoriteExercise, type CustomExerciseInput } from "@/services/workouts/exercise-library-store";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { userSafeError } from "@/lib/error-formatting";
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

const emptyOptions: WorkoutFilterOptions = {
  muscleCategories: [],
  primaryMuscles: [],
  equipmentRequired: [],
  mechanics: [],
  exerciseTypes: [],
  forceTypes: [],
  experienceLevels: [],
  secondaryMuscles: []
};

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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesCustomExercise(workout: Workout, query: string, filters: Record<FilterKey, string[]>) {
  const normalized = normalizeText(query);
  const values = [
    workout.name,
    workout.target_muscle,
    workout.muscle_category,
    workout.equipment,
    workout.equipment_required,
    workout.difficulty,
    workout.experience_level,
    workout.mechanics,
    workout.force_type,
    ...(workout.secondary_muscles ?? [])
  ];
  const matchesQuery = !normalized || values.some((value) => normalizeText(value).includes(normalized));
  const inList = (value: string | null | undefined, selected: string[]) => !selected.length || selected.includes(value ?? "");
  return (
    matchesQuery &&
    inList(workout.muscle_category ?? workout.target_muscle, filters.muscleCategories) &&
    inList(workout.target_muscle ?? workout.muscle_category, filters.primaryMuscles) &&
    inList(workout.equipment_required ?? workout.equipment, filters.equipmentRequired) &&
    inList(workout.mechanics ?? workout.category, filters.mechanics) &&
    inList(workout.category ?? workout.mechanics, filters.exerciseTypes) &&
    inList(workout.force_type, filters.forceTypes) &&
    inList(workout.experience_level ?? workout.difficulty, filters.experienceLevels)
  );
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
  const userId = user?.id;
  const [query, setQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<WorkoutFilterOptions>(emptyOptions);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(emptyFilters);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [customExercises, setCustomExercises] = useState<Workout[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomExerciseInput>(emptyCustomExercise);
  const [page, setPage] = useState(0);
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

  const loadFilterOptions = useCallback(async (signal?: AbortSignal) => {
    setFilterError("");
    try {
      const result = await getWorkoutFilterOptionsWithStatus(signal);
      setFilterOptions(result.data);
      setFilterStatus(result.status);
    } catch (error) {
      if (signal?.aborted) return;
      const message = userSafeError(error, "Exercise filters could not load. Your search text is still available.");
      setFilterOptions(emptyOptions);
      setFilterStatus(null);
      setFilterError(message);
      toast({ title: "Could not load workout filters", description: message });
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFilterOptions(controller.signal);
    return () => controller.abort();
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
      setPage(0);
      setHasMore(false);
      setIsLoading(false);
      setResultError("");
      setResultStatus(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setPage(0);
      setResultError("");
      getWorkoutsWithStatus(query.trim(), requestFilters, 0, controller.signal)
        .then((result) => {
          if (!active) return;
          setWorkouts(result.data);
          setResultStatus(result.status);
          setHasMore(result.data.length >= workoutPageSize);
        })
        .catch((error) => {
          if (!active) return;
          const message = userSafeError(error, "Search failed. Your filters were kept.");
          setResultError(message);
          toast({ title: "Could not load workouts", description: message });
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [filters, hasActiveLibraryRequest, isHydrated, query, reloadResultsNonce, requestFilters, toast]);

  const visibleCustomExercises = hasActiveLibraryRequest ? customExercises.filter((workout) => matchesCustomExercise(workout, query.trim(), filters)) : [];
  const allVisibleWorkouts = [...visibleCustomExercises, ...workouts].filter((workout, index, all) => all.findIndex((item) => item.id === workout.id) === index);
  const filteredWorkouts = favoritesOnly ? allVisibleWorkouts.filter((workout) => favoriteIds.includes(workout.id)) : allVisibleWorkouts;
  const duplicateExerciseNames = useMemo(() => duplicateWorkoutNames(filteredWorkouts), [filteredWorkouts]);
  const qualityCounts = useMemo(() => summarizeExerciseQuality(filteredWorkouts, duplicateExerciseNames), [duplicateExerciseNames, filteredWorkouts]);

  async function loadMore() {
    if (!hasActiveLibraryRequest) return;
    const nextPage = page + 1;
    setIsLoading(true);
    setResultError("");
    try {
      const result = await getWorkoutsWithStatus(query.trim(), requestFilters, nextPage);
      setWorkouts((current) => [...current, ...result.data]);
      setResultStatus(result.status);
      setPage(nextPage);
      setHasMore(result.data.length >= workoutPageSize);
    } catch (error) {
      const message = userSafeError(error, "More exercises could not load. Your current results were kept.");
      setResultError(message);
      toast({ title: "Could not load more workouts", description: message });
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
      toast({ title: nextFavorite ? "Exercise favorited" : "Exercise unfavorited", description: `${workout.name} is ${nextFavorite ? "saved to" : "removed from"} your favorites.` });
    } catch (error) {
      const message = userSafeError(error, "Favorite change failed. Your previous favorite state was restored.");
      setFavoriteIds(previousIds);
      setFavoriteErrors((current) => ({ ...current, [workout.id]: message }));
      toast({ title: "Favorite was not saved", description: message });
    } finally {
      setPendingFavoriteIds((current) => current.filter((id) => id !== workout.id));
    }
  }

  async function createCustomExercise() {
    if (isSavingCustom) return;
    if (!customDraft.name.trim()) {
      setCustomFormError("Exercise name is required.");
      setCustomSaveStatus("failed");
      return;
    }
    if (customVideoInvalid) {
      setCustomFormError("Custom video URL must start with http:// or https://.");
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
      toast({ title: "Custom exercise created", description: `${saved.name} is now available in your exercise library.` });
    } catch (error) {
      const message = userSafeError(error, "Create custom exercise failed. Your typed fields are still here.");
      setCustomFormError(message);
      setCustomSaveStatus("failed");
      toast({ title: "Could not create exercise", description: message });
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
      title: "Discard custom exercise draft?",
      description: "The custom exercise has not been saved. Discard the typed fields and close the form?",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
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
    ? "Search failed"
    : isLoading
      ? "Updating exercise results"
      : hasActiveLibraryRequest
        ? `${filteredWorkouts.length} exercises shown`
        : "Ready to browse";
  const resultStatusDescription = resultError
    ? "Search failed. Your filters were kept and any previous results remain visible."
    : hasActiveLibraryRequest
      ? "Start opens a standalone exercise session. To add exercises to a plan, use the workout day editor."
      : "Search by exercise, muscle, or equipment, or use Show all workouts to browse the full library.";

  const filterPanelContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Show all workouts</p>
          <p className="text-sm text-muted-foreground">Keep this off to show exercises only after a search or filter.</p>
        </div>
        <Button type="button" variant={showAllWorkouts ? "default" : "outline"} className="min-h-12" onClick={() => setShowAllWorkouts((current) => !current)}>
          {showAllWorkouts ? "All on" : "Show all"}
        </Button>
      </div>
      {filterError ? (
        <ErrorState
          title="Filter options could not load"
          description={filterError}
          onRetry={loadFilterOptions}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterGroup title="Muscle Category" values={filterOptions.muscleCategories} selected={filters.muscleCategories} open={openFilters.includes("muscleCategories")} onOpenChange={() => toggleFilterGroup("muscleCategories")} onToggle={(value) => toggleFilter("muscleCategories", value)} />
        <FilterGroup title="Primary Muscle" values={filterOptions.primaryMuscles} selected={filters.primaryMuscles} open={openFilters.includes("primaryMuscles")} onOpenChange={() => toggleFilterGroup("primaryMuscles")} onToggle={(value) => toggleFilter("primaryMuscles", value)} />
        <FilterGroup title="Equipment" values={filterOptions.equipmentRequired} selected={filters.equipmentRequired} open={openFilters.includes("equipmentRequired")} onOpenChange={() => toggleFilterGroup("equipmentRequired")} onToggle={(value) => toggleFilter("equipmentRequired", value)} />
        <FilterGroup title="Mechanics" values={filterOptions.mechanics} selected={filters.mechanics} open={openFilters.includes("mechanics")} onOpenChange={() => toggleFilterGroup("mechanics")} onToggle={(value) => toggleFilter("mechanics", value)} />
        <FilterGroup title="Exercise Type" values={filterOptions.exerciseTypes} selected={filters.exerciseTypes} open={openFilters.includes("exerciseTypes")} onOpenChange={() => toggleFilterGroup("exerciseTypes")} onToggle={(value) => toggleFilter("exerciseTypes", value)} />
        <FilterGroup title="Force Type" values={filterOptions.forceTypes} selected={filters.forceTypes} open={openFilters.includes("forceTypes")} onOpenChange={() => toggleFilterGroup("forceTypes")} onToggle={(value) => toggleFilter("forceTypes", value)} />
        <FilterGroup title="Experience Level" values={filterOptions.experienceLevels} selected={filters.experienceLevels} open={openFilters.includes("experienceLevels")} onOpenChange={() => toggleFilterGroup("experienceLevels")} onToggle={(value) => toggleFilter("experienceLevels", value)} />
        <FilterGroup title="Secondary Muscles" values={filterOptions.secondaryMuscles} selected={filters.secondaryMuscles} open={openFilters.includes("secondaryMuscles")} onOpenChange={() => toggleFilterGroup("secondaryMuscles")} onToggle={(value) => toggleFilter("secondaryMuscles", value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {activeFilterCount > 0 ? (
          <Button variant="outline" className="min-h-12" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" /> Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="glass-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises by name, muscle, or equipment"
            className="h-12 pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((current) => !current)} className="min-h-12">
            <Heart className={cn("h-4 w-4", favoritesOnly && "fill-current")} /> Favorites
          </Button>
          <Button variant="outline" onClick={toggleCustomForm} className="min-h-12">
            <Plus className="h-4 w-4" /> {showCustomForm ? "Close custom" : "Custom"}
          </Button>
          <Button variant="outline" onClick={() => setShowFiltersDialog(true)} className="min-h-12 lg:hidden">
            <SlidersHorizontal className="h-4 w-4" /> Filters {activeFilterCount ? `(${activeFilterCount})` : ""}
          </Button>
          <Button variant="outline" onClick={resetFilters} disabled={!query && activeFilterCount === 0 && !favoritesOnly} className="min-h-12">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      {customSaveStatus === "saved" ? (
        <StatusBanner
          tone="success"
          title="Custom exercise saved"
          description="Custom exercises are private to you and available in this exercise library."
        />
      ) : null}

      {showCustomForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create custom exercise</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">Custom exercises are private to you. They support manual corrections and plan building without changing the public exercise library.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {customFormError ? (
              <div className="md:col-span-2">
                <StatusBanner tone="error" title="Custom exercise was not saved" description={customFormError} />
              </div>
            ) : null}
            <Field label="Name" value={customDraft.name} onChange={(value) => setCustomDraft((current) => ({ ...current, name: value }))} placeholder="Example: Cable lateral raise" required />
            <Field label="Target muscle" value={customDraft.targetMuscle} onChange={(value) => setCustomDraft((current) => ({ ...current, targetMuscle: value }))} placeholder="Shoulders" />
            <Field label="Secondary muscles" value={customDraft.secondaryMuscles} onChange={(value) => setCustomDraft((current) => ({ ...current, secondaryMuscles: value }))} placeholder="Traps, core" />
            <Field label="Equipment" value={customDraft.equipment} onChange={(value) => setCustomDraft((current) => ({ ...current, equipment: value }))} placeholder="Cable machine" />
            <Field label="Difficulty" value={customDraft.difficulty} onChange={(value) => setCustomDraft((current) => ({ ...current, difficulty: value }))} placeholder="Intermediate" />
            <Field
              label="Video URL"
              value={customDraft.videoUrl}
              onChange={(value) => setCustomDraft((current) => ({ ...current, videoUrl: value }))}
              placeholder="https://..."
              error={customVideoInvalid ? "Custom video URL must start with http:// or https://." : undefined}
            />
            <div className="space-y-1 md:col-span-2">
              <Label>Instructions</Label>
              <textarea value={customDraft.instructions} onChange={(event) => setCustomDraft((current) => ({ ...current, instructions: event.target.value }))} className="min-h-24 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Setup, execution, tempo, and safety notes." />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
              <Button className="min-h-12" onClick={createCustomExercise} disabled={isSavingCustom || customVideoInvalid}>
                {isSavingCustom ? "Saving..." : "Save custom exercise"}
              </Button>
              <Button className="min-h-12" variant="outline" onClick={closeCustomForm} disabled={isSavingCustom}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="glass-card hidden p-4 lg:block">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <p className="font-semibold text-foreground">Exercise filters</p>
            {activeFilterCount ? <Badge>{activeFilterCount} selected</Badge> : null}
            {favoritesOnly ? <Badge variant="success">Favorites only</Badge> : null}
            {showAllWorkouts ? <Badge variant="success">Showing all</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{filteredWorkouts.length} exercises shown</p>
        </div>
        {filterPanelContent}
      </div>

      <Dialog open={showFiltersDialog} onOpenChange={setShowFiltersDialog}>
        <DialogContent variant="glass" className="max-h-[85dvh] overflow-y-auto pb-0">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>{filteredWorkouts.length} exercises match your selection</DialogDescription>
          </DialogHeader>
          {filterPanelContent}
          <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t bg-card/95 p-4 backdrop-blur sm:-mx-6 sm:px-6">
            <Button onClick={() => setShowFiltersDialog(false)} className="min-h-12 flex-1">Apply</Button>
            <Button variant="outline" className="min-h-12" onClick={() => { resetFilters(); setShowFiltersDialog(false); }}>Clear all</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StatusBanner
        tone={resultError ? "error" : hasDegradedLibraryState ? "warning" : "default"}
        title={resultStatusTitle}
        description={resultStatusDescription}
        badges={[
          resultStatus?.source === "fallback" ? "Fallback data" : null,
          resultStatus?.source === "partial" || filterStatus?.source === "partial" ? "Partial source" : null,
          activeFilterCount ? `${activeFilterCount} filters` : null,
          favoritesOnly ? "Favorites only" : null,
          showAllWorkouts ? "Showing all" : null,
          isLoadingPersonalLibrary ? "Loading saved items" : null
        ].filter(Boolean) as string[]}
      />

      {resultMessages.map((message) => (
        <StatusBanner key={message} tone="warning" title="Library source notice" description={message} />
      ))}

      {resultError ? (
        <ErrorState
          title="Exercise search failed"
          description={resultError}
          onRetry={() => setReloadResultsNonce((current) => current + 1)}
        />
      ) : null}

      {profile?.role === "admin" ? (
        <Card variant="glassStrong">
          <CardHeader>
            <CardTitle className="text-base">Exercise library quality</CardTitle>
            <p className="text-sm text-muted-foreground">Quality checks flag missing guidance and duplicates for review. Nothing is deleted automatically.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <QualityMetric label="Missing video" value={qualityCounts.missingVideo} detail="No video or guide link found" />
            <QualityMetric label="Missing instructions" value={qualityCounts.missingInstructions} detail="Instruction text needs review" />
            <QualityMetric label="Missing muscle/equipment" value={qualityCounts.missingLabels} detail="Filter quality may be weaker" />
            <QualityMetric label="Duplicate names" value={qualityCounts.duplicates} detail="Same visible exercise name appears more than once" />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && !filteredWorkouts.length ? <CardGridSkeleton count={3} /> : null}
        {!isLoading && !hasActiveLibraryRequest ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState
              title="Start browsing"
              description="Search by name, muscle, or equipment. You can also turn on 'Show all workouts' or filter by favorites."
              actionLabel="Show all workouts"
              onAction={() => setShowAllWorkouts(true)}
            />
          </div>
        ) : null}
        {!isLoading && hasActiveLibraryRequest && !resultError && !filteredWorkouts.length ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState title="No exercises found" description="Try adjusting your search or filters." actionLabel="Clear filters" onAction={resetFilters} />
          </div>
        ) : null}
        {filteredWorkouts.map((workout) => {
          const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
          const favorite = favoriteIds.includes(workout.id);
          const favoritePending = pendingFavoriteSet.has(workout.id);
          const favoriteError = favoriteErrors[workout.id];
          const quality = exerciseQuality(workout, duplicateExerciseNames.has(normalizeText(workout.name)));
          return (
            <Card key={workout.id} variant="glass" className="shadow-luxe">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{workout.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{workout.muscle_category || workout.target_muscle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge>{workout.experience_level || workout.difficulty}</Badge>
                    {!workout.is_global ? <Badge variant="success">Custom</Badge> : null}
                    {profile?.role === "admin" ? quality.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{workout.equipment_required || workout.equipment}</Badge>
                  {workout.mechanics ? <Badge variant="outline">{workout.mechanics}</Badge> : null}
                  {workout.force_type ? <Badge variant="outline">{workout.force_type}</Badge> : null}
                  {workout.sets ? <Badge variant="outline">{workout.sets} sets</Badge> : null}
                  {workout.reps ? <Badge variant="outline">{workout.reps}</Badge> : null}
                </div>
                {workout.secondary_muscles?.length ? <p className="mt-2 text-xs text-muted-foreground">Secondary: {workout.secondary_muscles.join(", ")}</p> : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button asChild className="min-h-12">
                    <Link href={`/workouts/session/${workout.id}`}><Play className="h-4 w-4" /> Start session</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-12">
                    <Link href={`/workouts/${workout.id}`} aria-label={`Details for ${workout.name}`}><MoreHorizontal className="h-4 w-4" /> Details</Link>
                  </Button>
                  <Button variant="outline" className="min-h-12" onClick={() => toggleFavorite(workout)} disabled={favoritePending} aria-label={favorite ? "Unfavorite" : "Favorite"} aria-busy={favoritePending}>
                    <Heart className={cn("h-4 w-4", favorite && "fill-current text-primary")} />
                    {favoritePending ? "Saving..." : favorite ? "Saved" : "Save"}
                  </Button>
                  {guideUrl ? (
                    <Button asChild variant="outline" className="min-h-12">
                      <a href={guideUrl} target="_blank" rel="noreferrer" aria-label={`Guide for ${workout.name}`}><ExternalLink className="h-4 w-4" /> Guide</a>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="min-h-12" disabled>No guide</Button>
                  )}
                </div>
                {favoriteError ? <p className="mt-3 text-sm leading-6 text-destructive">{favoriteError}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hasMore && !favoritesOnly ? <div className="flex justify-center"><Button className="min-h-12" variant="outline" onClick={loadMore} disabled={isLoading}>{isLoading ? "Loading..." : "Load more"}</Button></div> : null}
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
    const key = normalizeText(workout.name);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

function exerciseQuality(workout: Workout, duplicateName: boolean) {
  const warnings: string[] = [];
  if (!workout.video_url && !workout.custom_video_url && !workout.exercise_url && !isLink(workout.notes)) warnings.push("missing video");
  if (!workout.instructions?.trim()) warnings.push("missing instructions");
  if (!workout.target_muscle && !workout.muscle_category) warnings.push("missing muscle");
  if (!workout.equipment && !workout.equipment_required) warnings.push("missing equipment");
  if (duplicateName) warnings.push("duplicate");
  return warnings.slice(0, 3);
}

function summarizeExerciseQuality(workouts: Workout[], duplicates: Set<string>) {
  return workouts.reduce(
    (summary, workout) => {
      const warnings = exerciseQuality(workout, duplicates.has(normalizeText(workout.name)));
      return {
        missingVideo: summary.missingVideo + (warnings.includes("missing video") ? 1 : 0),
        missingInstructions: summary.missingInstructions + (warnings.includes("missing instructions") ? 1 : 0),
        missingLabels: summary.missingLabels + (warnings.includes("missing muscle") || warnings.includes("missing equipment") ? 1 : 0),
        duplicates: summary.duplicates + (warnings.includes("duplicate") ? 1 : 0)
      };
    },
    { missingVideo: 0, missingInstructions: 0, missingLabels: 0, duplicates: 0 }
  );
}

function FilterGroup({ title, values, selected, open, onOpenChange, onToggle }: { title: string; values: string[]; selected: string[]; open: boolean; onOpenChange: () => void; onToggle: (value: string) => void; }) {
  return (
    <div className="solid-row p-3">
      <button type="button" onClick={onOpenChange} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-1 text-left">
        <span className="min-w-0 text-sm font-semibold text-foreground">{title}</span>
        <span className="flex items-center gap-2">{selected.length ? <Badge variant="outline">{selected.length}</Badge> : null}<ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} /></span>
      </button>
      {open ? (
        <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto pr-1">
          {values.map((value) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm transition hover:bg-card">
              <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} className="h-4 w-4 rounded border-border text-primary" />
              <span className="min-w-0 truncate">{value}</span>
            </label>
          ))}
          {!values.length ? <p className="text-sm text-muted-foreground">No options yet.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
