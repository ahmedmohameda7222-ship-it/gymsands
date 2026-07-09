"use client";

import { defaultExerciseInstructions, sampleExerciseVideos, sampleWorkouts } from "@/data/workouts";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { ExerciseVideo, UserExerciseVideo, Workout } from "@/types";

const workoutPageSize = 500;

export type WorkoutFilters = {
  category?: string;
  categories?: string[];
  muscleCategories?: string[];
  primaryMuscles?: string[];
  equipment?: string;
  equipmentRequired?: string[];
  difficulty?: string;
  experienceLevels?: string[];
  mechanics?: string[];
  exerciseTypes?: string[];
  forceTypes?: string[];
  secondaryMuscles?: string[];
};

export type WorkoutFilterOptions = {
  muscleCategories: string[];
  primaryMuscles: string[];
  equipmentRequired: string[];
  mechanics: string[];
  exerciseTypes: string[];
  forceTypes: string[];
  experienceLevels: string[];
  secondaryMuscles: string[];
};

export type WorkoutLibraryStatus = {
  source: "live" | "fallback" | "partial";
  message?: string;
};

export type WorkoutLibraryResult<T> = {
  data: T;
  status: WorkoutLibraryStatus;
};

type ActiveExerciseRow = {
  id: string;
  name: string;
  source?: string | null;
  source_url?: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string[] | null;
  difficulty: string | null;
  mechanics: string | null;
  movement_pattern: string | null;
  force_type: string | null;
  instructions: string | null;
  video_url: string | null;
  is_global: boolean;
};

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

function hasAnySelected(values: Array<string | null | undefined>, selected: string[] | undefined) {
  if (!selected?.length) return true;
  const normalizedValues = values.map(normalizeText).filter(Boolean);
  return selected.some((item) => normalizedValues.includes(normalizeText(item)));
}

function looksLikeUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function hydrateWorkoutMetadata(workout: Workout): Workout {
  return {
    ...workout,
    muscle_category: workout.muscle_category ?? workout.target_muscle,
    equipment_required: workout.equipment_required ?? workout.equipment,
    experience_level: workout.experience_level ?? workout.difficulty,
    exercise_url: workout.exercise_url ?? (looksLikeUrl(workout.notes) ? workout.notes : null),
    secondary_muscles: workout.secondary_muscles ?? []
  };
}

function mapVideoToWorkout(video: ExerciseVideo): Workout {
  return {
    id: video.id,
    name: video.exercise_name,
    category: video.category_type ?? "Exercise",
    target_muscle: video.muscle_category ?? video.category ?? "General",
    equipment: video.equipment_required ?? (video.category_type === "Equipment" ? video.category ?? "Varies" : "Varies"),
    difficulty: video.experience_level ?? "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: video.instructions || defaultExerciseInstructions,
    notes: video.exercise_url,
    muscle_category: video.muscle_category ?? video.category,
    equipment_required: video.equipment_required ?? null,
    mechanics: video.mechanics ?? null,
    force_type: video.force_type ?? null,
    experience_level: video.experience_level ?? "Beginner",
    secondary_muscles: video.secondary_muscles ?? [],
    exercise_url: video.exercise_url,
    video_url: video.video_url,
    is_global: video.is_global
  };
}

function mapActiveExerciseToWorkout(exercise: ActiveExerciseRow): Workout {
  const equipment = exercise.equipment?.length ? exercise.equipment.join(", ") : "Varies";
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.mechanics || exercise.movement_pattern || "Exercise",
    target_muscle: exercise.primary_muscle || "General",
    equipment,
    difficulty: exercise.difficulty || "Beginner",
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: exercise.instructions || defaultExerciseInstructions,
    notes: exercise.source_url || (exercise.source ? `Source: ${exercise.source}` : null),
    muscle_category: exercise.primary_muscle,
    equipment_required: equipment,
    mechanics: exercise.mechanics,
    force_type: exercise.force_type,
    experience_level: exercise.difficulty || "Beginner",
    secondary_muscles: exercise.secondary_muscles ?? [],
    exercise_url: exercise.source_url ?? null,
    video_url: exercise.video_url,
    is_global: exercise.is_global
  };
}

function dedupeWorkouts(workouts: Workout[]) {
  const seen = new Set<string>();
  return workouts.filter((workout) => {
    const key = `${normalizeText(workout.name)}-${normalizeText(workout.target_muscle)}-${normalizeText(workout.equipment)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeExerciseVideos(videos: ExerciseVideo[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    const key = `${normalizeText(video.exercise_name)}-${normalizeText(video.category)}-${normalizeText(video.exercise_url)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localWorkoutCategories() {
  return Array.from(
    new Set([
      ...sampleWorkouts.map((workout) => workout.target_muscle),
      ...sampleExerciseVideos.map((video) => video.category).filter(Boolean),
      ...sampleWorkouts.map((workout) => workout.equipment)
    ])
  ).sort() as string[];
}

function getLocalWorkoutFilterOptions(): WorkoutFilterOptions {
  const localWorkouts = sampleWorkouts.map(hydrateWorkoutMetadata);
  const localVideos = sampleExerciseVideos.map(mapVideoToWorkout);
  const all = [...localWorkouts, ...localVideos];
  return {
    muscleCategories: uniqueSorted(all.map((exercise) => exercise.muscle_category ?? exercise.target_muscle)),
    primaryMuscles: uniqueSorted(all.map((exercise) => exercise.target_muscle ?? exercise.muscle_category)),
    equipmentRequired: uniqueSorted(all.map((exercise) => exercise.equipment_required ?? exercise.equipment)),
    mechanics: uniqueSorted(all.map((exercise) => exercise.mechanics ?? exercise.category)),
    exerciseTypes: uniqueSorted(all.map((exercise) => exercise.category ?? exercise.mechanics)),
    forceTypes: uniqueSorted(all.map((exercise) => exercise.force_type)),
    experienceLevels: uniqueSorted(all.map((exercise) => exercise.experience_level ?? exercise.difficulty)),
    secondaryMuscles: uniqueSorted(all.flatMap((exercise) => exercise.secondary_muscles ?? []))
  };
}

function matchesWorkoutFilters(workout: Workout, query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const broadCategories = filters.categories ?? (filters.category ? [filters.category] : []);
  const muscleCategories = filters.muscleCategories ?? [];
  const equipmentRequired = filters.equipmentRequired ?? (filters.equipment ? [filters.equipment] : []);
  const experienceLevels = filters.experienceLevels ?? (filters.difficulty ? [filters.difficulty] : []);
  const secondaryMuscles = workout.secondary_muscles ?? [];

  const matchesQuery =
    !normalized ||
    [
      workout.name,
      workout.target_muscle,
      workout.equipment,
      workout.category,
      workout.mechanics,
      workout.force_type,
      workout.experience_level,
      ...(secondaryMuscles ?? [])
    ].some((value) => normalizeText(value).includes(normalized));

  return (
    matchesQuery &&
    hasAnySelected([workout.muscle_category, workout.target_muscle, workout.category, workout.equipment_required, workout.equipment], broadCategories) &&
    hasAnySelected([workout.muscle_category], muscleCategories) &&
    hasAnySelected([workout.target_muscle, workout.muscle_category], filters.primaryMuscles) &&
    hasAnySelected([workout.equipment_required, workout.equipment], equipmentRequired) &&
    hasAnySelected([workout.mechanics, workout.category], filters.mechanics) &&
    hasAnySelected([workout.category, workout.mechanics], filters.exerciseTypes) &&
    hasAnySelected([workout.force_type], filters.forceTypes) &&
    hasAnySelected([workout.experience_level, workout.difficulty], experienceLevels) &&
    hasAnySelected(secondaryMuscles, filters.secondaryMuscles)
  );
}

function localWorkouts(query = "", filters: WorkoutFilters = {}) {
  const normalized = normalizeText(query);
  const source = dedupeWorkouts([
    ...sampleWorkouts.map(hydrateWorkoutMetadata),
    ...sampleExerciseVideos.map(mapVideoToWorkout)
  ]);
  return source.filter((workout) => matchesWorkoutFilters(workout, normalized, filters));
}

function liveStatus(): WorkoutLibraryStatus {
  return { source: "live" };
}

function fallbackStatus(message = "Showing fallback exercise data because the full library could not load."): WorkoutLibraryStatus {
  return { source: "fallback", message };
}

function partialStatus(message = "Showing live exercise data with a partial source unavailable."): WorkoutLibraryStatus {
  return { source: "partial", message };
}

export async function getWorkoutCategories() {
  const fallback = localWorkoutCategories();
  if (!supabase) throw new Error("Database not connected");

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercises").select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global").eq("is_global", true).eq("is_approved", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "Plaivra could not load workout categories, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return fallback;
  }

  const categories = new Set<string>();
  workoutResult.data?.forEach((workout) => {
    if (workout.muscle_category) categories.add(workout.muscle_category);
    if (workout.equipment_required) categories.add(workout.equipment_required);
    if (workout.target_muscle) categories.add(workout.target_muscle);
    if (workout.equipment) categories.add(workout.equipment);
  });
  videoResult.data?.forEach((video) => {
    if (video.muscle_category) categories.add(video.muscle_category);
    if (video.equipment_required) categories.add(video.equipment_required);
    if (video.category) categories.add(video.category);
  });
  if (!exerciseResult.error) {
    exerciseResult.data?.forEach((exercise) => {
      if (exercise.primary_muscle) categories.add(exercise.primary_muscle);
      (exercise.equipment ?? []).forEach((item: string) => categories.add(item));
    });
  }
  fallback.forEach((value) => categories.add(value));

  const values = Array.from(categories).filter(Boolean).sort();
  return values.length ? values : fallback;
}

export async function getWorkoutFilterOptions() {
  const fallback = getLocalWorkoutFilterOptions();
  if (!supabase) throw new Error("Database not connected");

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercises").select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global").eq("is_global", true).eq("is_approved", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "Plaivra could not load workout filter metadata, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return fallback;
  }

  const workouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata);
  const videos = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout);
  const activeExercises = exerciseResult.error ? [] : ((exerciseResult.data ?? []) as ActiveExerciseRow[]).map(mapActiveExerciseToWorkout);
  const all = [...workouts, ...videos, ...activeExercises];

  return {
    muscleCategories: uniqueSorted([...fallback.muscleCategories, ...all.map((item) => item.muscle_category ?? item.target_muscle)]),
    primaryMuscles: uniqueSorted([...fallback.primaryMuscles, ...all.map((item) => item.target_muscle ?? item.muscle_category)]),
    equipmentRequired: uniqueSorted([...fallback.equipmentRequired, ...all.map((item) => item.equipment_required ?? item.equipment)]),
    mechanics: uniqueSorted([...fallback.mechanics, ...all.map((item) => item.mechanics ?? item.category)]),
    exerciseTypes: uniqueSorted([...fallback.exerciseTypes, ...all.map((item) => item.category ?? item.mechanics)]),
    forceTypes: uniqueSorted([...fallback.forceTypes, ...all.map((item) => item.force_type)]),
    experienceLevels: uniqueSorted([...fallback.experienceLevels, ...all.map((item) => item.experience_level ?? item.difficulty)]),
    secondaryMuscles: uniqueSorted([...fallback.secondaryMuscles, ...all.flatMap((item) => item.secondary_muscles ?? [])])
  };
}

export async function getWorkoutFilterOptionsWithStatus(): Promise<WorkoutLibraryResult<WorkoutFilterOptions>> {
  const fallback = getLocalWorkoutFilterOptions();
  if (!supabase) {
    return {
      data: fallback,
      status: fallbackStatus("Showing fallback exercise filters because the full library could not load.")
    };
  }

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([
    supabase!.from("workouts").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercise_videos").select("*").eq("is_global", true).limit(5000),
    supabase!.from("exercises").select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global").eq("is_global", true).eq("is_approved", true).limit(5000)
  ]);

  if (workoutResult.error || videoResult.error) {
    console.warn(
      "Plaivra could not load workout filter metadata, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return {
      data: fallback,
      status: fallbackStatus("Showing fallback exercise filters because the full library could not load.")
    };
  }

  const workouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata);
  const videos = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout);
  const activeExercises = exerciseResult.error ? [] : ((exerciseResult.data ?? []) as ActiveExerciseRow[]).map(mapActiveExerciseToWorkout);
  const all = [...workouts, ...videos, ...activeExercises];
  const status = exerciseResult.error
    ? partialStatus("Showing live exercise filters without some approved exercise data.")
    : liveStatus();

  return {
    data: {
      muscleCategories: uniqueSorted([...fallback.muscleCategories, ...all.map((item) => item.muscle_category ?? item.target_muscle)]),
      primaryMuscles: uniqueSorted([...fallback.primaryMuscles, ...all.map((item) => item.target_muscle ?? item.muscle_category)]),
      equipmentRequired: uniqueSorted([...fallback.equipmentRequired, ...all.map((item) => item.equipment_required ?? item.equipment)]),
      mechanics: uniqueSorted([...fallback.mechanics, ...all.map((item) => item.mechanics ?? item.category)]),
      exerciseTypes: uniqueSorted([...fallback.exerciseTypes, ...all.map((item) => item.category ?? item.mechanics)]),
      forceTypes: uniqueSorted([...fallback.forceTypes, ...all.map((item) => item.force_type)]),
      experienceLevels: uniqueSorted([...fallback.experienceLevels, ...all.map((item) => item.experience_level ?? item.difficulty)]),
      secondaryMuscles: uniqueSorted([...fallback.secondaryMuscles, ...all.flatMap((item) => item.secondary_muscles ?? [])])
    },
    status
  };
}

export async function getWorkouts(query = "", filters: WorkoutFilters = {}, page = 0) {
  const selectedCategory = filters.category || filters.equipment || filters.muscleCategories?.[0] || filters.categories?.[0] || filters.equipmentRequired?.[0];
  const localMatches = localWorkouts(query, filters);
  const from = page * workoutPageSize;
  const to = from + workoutPageSize - 1;

  if (!supabase) throw new Error("Database not connected");

  let workoutRequest = supabase!.from("workouts").select("*").eq("is_global", true).order("name").limit(5000);
  if (query) workoutRequest = workoutRequest.or(`name.ilike.%${query}%,target_muscle.ilike.%${query}%,equipment.ilike.%${query}%`);

  let videoRequest = supabase!.from("exercise_videos").select("*").eq("is_global", true).order("exercise_name").limit(5000);
  if (selectedCategory) videoRequest = videoRequest.eq("category", selectedCategory);
  if (query) videoRequest = videoRequest.ilike("exercise_name", `%${query}%`);

  let exerciseRequest = supabase!
    .from("exercises")
    .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
    .eq("is_global", true)
    .eq("is_approved", true)
    .order("name")
    .limit(5000);
  if (query) exerciseRequest = exerciseRequest.or(`name.ilike.%${query}%,primary_muscle.ilike.%${query}%,mechanics.ilike.%${query}%,movement_pattern.ilike.%${query}%`);

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([workoutRequest, videoRequest, exerciseRequest]);
  if (workoutResult.error || videoResult.error) {
    console.warn(
      "Plaivra could not load Supabase workouts, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return localMatches.slice(from, to + 1);
  }

  const directWorkouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const videoWorkouts = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const activeExercises = exerciseResult.error
    ? []
    : ((exerciseResult.data ?? []) as ActiveExerciseRow[]).map(mapActiveExerciseToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  return dedupeWorkouts([...activeExercises, ...localMatches, ...directWorkouts, ...videoWorkouts]).slice(from, to + 1);
}

export async function getWorkoutsWithStatus(query = "", filters: WorkoutFilters = {}, page = 0): Promise<WorkoutLibraryResult<Workout[]>> {
  const selectedCategory = filters.category || filters.equipment || filters.muscleCategories?.[0] || filters.categories?.[0] || filters.equipmentRequired?.[0];
  const localMatches = localWorkouts(query, filters);
  const from = page * workoutPageSize;
  const to = from + workoutPageSize - 1;

  if (!supabase) {
    return {
      data: localMatches.slice(from, to + 1),
      status: fallbackStatus()
    };
  }

  let workoutRequest = supabase!.from("workouts").select("*").eq("is_global", true).order("name").limit(5000);
  if (query) workoutRequest = workoutRequest.or(`name.ilike.%${query}%,target_muscle.ilike.%${query}%,equipment.ilike.%${query}%`);

  let videoRequest = supabase!.from("exercise_videos").select("*").eq("is_global", true).order("exercise_name").limit(5000);
  if (selectedCategory) videoRequest = videoRequest.eq("category", selectedCategory);
  if (query) videoRequest = videoRequest.ilike("exercise_name", `%${query}%`);

  let exerciseRequest = supabase!
    .from("exercises")
    .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
    .eq("is_global", true)
    .eq("is_approved", true)
    .order("name")
    .limit(5000);
  if (query) exerciseRequest = exerciseRequest.or(`name.ilike.%${query}%,primary_muscle.ilike.%${query}%,mechanics.ilike.%${query}%,movement_pattern.ilike.%${query}%`);

  const [workoutResult, videoResult, exerciseResult] = await Promise.all([workoutRequest, videoRequest, exerciseRequest]);
  if (workoutResult.error || videoResult.error) {
    console.warn(
      "Plaivra could not load Supabase workouts, using local fallback.",
      workoutResult.error?.message || videoResult.error?.message
    );
    return {
      data: localMatches.slice(from, to + 1),
      status: fallbackStatus()
    };
  }

  const directWorkouts = ((workoutResult.data ?? []) as Workout[]).map(hydrateWorkoutMetadata).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const videoWorkouts = ((videoResult.data ?? []) as ExerciseVideo[]).map(mapVideoToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  const activeExercises = exerciseResult.error
    ? []
    : ((exerciseResult.data ?? []) as ActiveExerciseRow[]).map(mapActiveExerciseToWorkout).filter((workout) => matchesWorkoutFilters(workout, query, filters));
  return {
    data: dedupeWorkouts([...activeExercises, ...localMatches, ...directWorkouts, ...videoWorkouts]).slice(from, to + 1),
    status: exerciseResult.error ? partialStatus("Showing exercise results without some approved exercise data.") : liveStatus()
  };
}

export async function getWorkout(id: string) {
  const local = localWorkouts("").find((workout) => workout.id === id) ?? sampleWorkouts.map(hydrateWorkoutMetadata)[0];
  if (!supabase) throw new Error("Database not connected");

  const workoutResult = await supabase!.from("workouts").select("*").eq("id", id).maybeSingle();
  if (workoutResult.error) console.warn("Plaivra could not load workout from workouts table.", workoutResult.error.message);
  if (workoutResult.data) return hydrateWorkoutMetadata(workoutResult.data as Workout);

  const exerciseResult = await supabase!
    .from("exercises")
    .select("id,name,source,source_url,primary_muscle,secondary_muscles,equipment,difficulty,mechanics,movement_pattern,force_type,instructions,video_url,is_global")
    .eq("id", id)
    .eq("is_approved", true)
    .maybeSingle();
  if (exerciseResult.error) console.warn("Plaivra could not load workout from active exercises.", exerciseResult.error.message);
  if (exerciseResult.data) return mapActiveExerciseToWorkout(exerciseResult.data as ActiveExerciseRow);

  const videoResult = await supabase!.from("exercise_videos").select("*").eq("id", id).maybeSingle();
  if (videoResult.error) {
    console.warn("Plaivra could not load workout from exercise videos.", videoResult.error.message);
    return local;
  }
  return videoResult.data ? mapVideoToWorkout(videoResult.data as ExerciseVideo) : local;
}

export async function getExerciseVideos(query = "") {
  const localVideos = dedupeExerciseVideos(sampleExerciseVideos).filter((video) => !query || normalizeText(video.exercise_name).includes(normalizeText(query)));
  if (!supabase) throw new Error("Database not connected");
  let request = supabase!.from("exercise_videos").select("*").order("exercise_name").limit(100);
  if (query) request = request.ilike("exercise_name", `%${query}%`);
  const { data, error } = await request;
  if (error) {
    console.warn("Plaivra could not load exercise videos, using local fallback.", error.message);
    return localVideos;
  }
  return dedupeExerciseVideos([...((data ?? []) as ExerciseVideo[]), ...localVideos]);
}

export async function getUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) {
    console.warn("Plaivra could not load custom exercise video.", error.message);
    return null;
  }
  return data as UserExerciseVideo | null;
}

export async function upsertUserExerciseVideo(userId: string, exerciseId: string, customVideoUrl: string) {
  const cleanUrl = customVideoUrl.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error("Enter a valid http or https video URL.");
  const payload = { user_id: userId, exercise_id: exerciseId, custom_video_url: cleanUrl };
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { data, error } = await supabase!
    .from("user_exercise_videos")
    .upsert(payload, { onConflict: "user_id,exercise_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserExerciseVideo;
}

export async function resetUserExerciseVideo(userId: string, exerciseId: string) {
  if (!canUseUserData(userId)) throw new Error("User session invalid");
  const { error } = await supabase!
    .from("user_exercise_videos")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  return true;
}
