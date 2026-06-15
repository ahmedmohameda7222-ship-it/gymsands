"use client";

import type { Workout } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

export type CustomExerciseInput = {
  name: string;
  targetMuscle: string;
  secondaryMuscles: string;
  equipment: string;
  difficulty: string;
  instructions: string;
  videoUrl: string;
};

type StoredCustomExercise = Workout & {
  user_id: string;
  created_at: string;
  updated_at: string;
};

const favoritesPrefix = "fitlife-exercise-favorites";
const customPrefix = "fitlife-custom-exercises";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function storageKey(prefix: string, userId: string | null | undefined) {
  return `${prefix}:${userId || "anonymous"}`;
}

function canSyncUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function normalizeList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJson<T>(key: string, fallback: T): T {
  // TODO(migration): Move exercise favorites and custom exercises to Supabase
  if (!canUseBrowserStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Ensure one-time migration runs
let hasMigratedFavorites = false;
let hasMigratedCustom = false;

export async function getFavoriteExerciseIds(userId: string | null | undefined): Promise<string[]> {
  if (!canSyncUserData(userId)) return readJson<string[]>(storageKey(favoritesPrefix, userId), []);
  
  if (!hasMigratedFavorites && canUseBrowserStorage()) {
    hasMigratedFavorites = true;
    const local = readJson<string[]>(storageKey(favoritesPrefix, userId), []);
    if (local.length > 0) {
      await Promise.all(local.map(id => 
        supabase!.from("user_exercise_favorites").upsert({ user_id: userId, exercise_id: id }, { onConflict: "user_id, exercise_id" })
      ));
      window.localStorage.removeItem(storageKey(favoritesPrefix, userId));
    }
  }

  const { data } = await supabase!.from("user_exercise_favorites").select("exercise_id").eq("user_id", userId);
  return data?.map((d: Record<string, unknown>) => d.exercise_id as string) || [];
}

export async function isFavoriteExercise(userId: string | null | undefined, exerciseId: string): Promise<boolean> {
  const ids = await getFavoriteExerciseIds(userId);
  return ids.includes(exerciseId);
}

export async function setFavoriteExercise(userId: string | null | undefined, exerciseId: string, favorite: boolean): Promise<string[]> {
  if (!canSyncUserData(userId)) {
    const key = storageKey(favoritesPrefix, userId);
    const current = new Set(readJson<string[]>(key, []));
    if (favorite) current.add(exerciseId);
    else current.delete(exerciseId);
    const next = Array.from(current);
    if (canUseBrowserStorage()) window.localStorage.setItem(key, JSON.stringify(next));
    return next;
  }

  const supabaseCl = supabase;
  if (favorite) {
    await supabaseCl!.from("user_exercise_favorites").upsert({ user_id: userId, exercise_id: exerciseId }, { onConflict: "user_id, exercise_id" });
  } else {
    await supabaseCl!.from("user_exercise_favorites").delete().match({ user_id: userId, exercise_id: exerciseId });
  }
  return getFavoriteExerciseIds(userId);
}

export async function getCustomExercises(userId: string | null | undefined): Promise<Workout[]> {
  if (!canSyncUserData(userId)) return readJson<StoredCustomExercise[]>(storageKey(customPrefix, userId), []);

  if (!hasMigratedCustom && canUseBrowserStorage()) {
    hasMigratedCustom = true;
    const local = readJson<StoredCustomExercise[]>(storageKey(customPrefix, userId), []);
    if (local.length > 0) {
      for (const ex of local) {
        const id = ex.id.startsWith("custom-") ? ex.id.replace("custom-", "") : ex.id;
        const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
        await supabase!.from("user_custom_exercises").insert({
          id: validUuid,
          user_id: userId,
          name: ex.name,
          category: ex.category,
          target_muscle: ex.target_muscle,
          equipment: ex.equipment,
          difficulty: ex.difficulty,
          sets: ex.sets,
          reps: ex.reps,
          rest_seconds: ex.rest_seconds,
          instructions: ex.instructions,
          notes: ex.notes,
          muscle_category: ex.muscle_category,
          equipment_required: ex.equipment_required,
          mechanics: ex.mechanics,
          force_type: ex.force_type,
          experience_level: ex.experience_level,
          secondary_muscles: ex.secondary_muscles,
          exercise_url: ex.exercise_url,
          video_url: ex.video_url,
          custom_video_url: ex.custom_video_url,
          is_global: ex.is_global,
          created_at: ex.created_at,
          updated_at: ex.updated_at
        }).select().single();
      }
      window.localStorage.removeItem(storageKey(customPrefix, userId));
    }
  }

  const { data } = await supabase!.from("user_custom_exercises").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return (data || []) as Workout[];
}

export async function getCustomExercise(userId: string | null | undefined, exerciseId: string): Promise<Workout | null> {
  const exercises = await getCustomExercises(userId);
  return exercises.find((exercise) => exercise.id === exerciseId) ?? null;
}

export async function saveCustomExercise(userId: string | null | undefined, input: CustomExerciseInput): Promise<Workout> {
  const name = input.name.trim();
  if (!name) throw new Error("Exercise name is required.");
  const targetMuscle = input.targetMuscle.trim() || "General";
  const equipment = input.equipment.trim() || "Varies";
  const difficulty = input.difficulty.trim() || "Custom";
  const cleanVideoUrl = input.videoUrl.trim();
  if (cleanVideoUrl && !/^https?:\/\/[^\s]+$/i.test(cleanVideoUrl)) throw new Error("Enter a valid http or https video URL.");

  const now = new Date().toISOString();
  
  if (!canSyncUserData(userId)) {
    const exercise: StoredCustomExercise = {
      id: `custom-${crypto.randomUUID()}`,
      user_id: "anonymous",
      name,
      category: "Custom exercise",
      target_muscle: targetMuscle,
      equipment,
      difficulty,
      sets: 3,
      reps: "8-12",
      rest_seconds: 75,
      instructions: input.instructions.trim() || "No instructions saved yet.",
      notes: null,
      muscle_category: targetMuscle,
      equipment_required: equipment,
      mechanics: null,
      force_type: null,
      experience_level: difficulty,
      secondary_muscles: normalizeList(input.secondaryMuscles),
      exercise_url: null,
      video_url: cleanVideoUrl || null,
      custom_video_url: cleanVideoUrl || null,
      is_global: false,
      created_at: now,
      updated_at: now
    };
    const key = storageKey(customPrefix, userId);
    const current = readJson<StoredCustomExercise[]>(key, []);
    if (canUseBrowserStorage()) window.localStorage.setItem(key, JSON.stringify([exercise, ...current]));
    return exercise;
  }

  const supabaseCl = supabase;
  const { data, error } = await supabaseCl!.from("user_custom_exercises").insert({
    user_id: userId,
    name,
    category: "Custom exercise",
    target_muscle: targetMuscle,
    equipment,
    difficulty,
    sets: 3,
    reps: "8-12",
    rest_seconds: 75,
    instructions: input.instructions.trim() || "No instructions saved yet.",
    notes: null,
    muscle_category: targetMuscle,
    equipment_required: equipment,
    mechanics: null,
    force_type: null,
    experience_level: difficulty,
    secondary_muscles: normalizeList(input.secondaryMuscles),
    exercise_url: null,
    video_url: cleanVideoUrl || null,
    custom_video_url: cleanVideoUrl || null,
    is_global: false
  }).select().single();

  if (error) throw new Error(error.message);
  return data as Workout;
}
