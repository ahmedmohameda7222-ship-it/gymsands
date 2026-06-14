"use client";

import type { Workout } from "@/types";

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

function normalizeList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseBrowserStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getFavoriteExerciseIds(userId: string | null | undefined) {
  return readJson<string[]>(storageKey(favoritesPrefix, userId), []);
}

export function isFavoriteExercise(userId: string | null | undefined, exerciseId: string) {
  return getFavoriteExerciseIds(userId).includes(exerciseId);
}

export function setFavoriteExercise(userId: string | null | undefined, exerciseId: string, favorite: boolean) {
  const key = storageKey(favoritesPrefix, userId);
  const current = new Set(getFavoriteExerciseIds(userId));
  if (favorite) current.add(exerciseId);
  else current.delete(exerciseId);
  const next = Array.from(current);
  writeJson(key, next);
  return next;
}

export function getCustomExercises(userId: string | null | undefined): Workout[] {
  return readJson<StoredCustomExercise[]>(storageKey(customPrefix, userId), []);
}

export function getCustomExercise(userId: string | null | undefined, exerciseId: string): Workout | null {
  return getCustomExercises(userId).find((exercise) => exercise.id === exerciseId) ?? null;
}

export function saveCustomExercise(userId: string | null | undefined, input: CustomExerciseInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Exercise name is required.");
  const targetMuscle = input.targetMuscle.trim() || "General";
  const equipment = input.equipment.trim() || "Varies";
  const difficulty = input.difficulty.trim() || "Custom";
  const cleanVideoUrl = input.videoUrl.trim();
  if (cleanVideoUrl && !/^https?:\/\/[^\s]+$/i.test(cleanVideoUrl)) throw new Error("Enter a valid http or https video URL.");

  const now = new Date().toISOString();
  const exercise: StoredCustomExercise = {
    id: `custom-${crypto.randomUUID()}`,
    user_id: userId || "anonymous",
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
  writeJson(key, [exercise, ...current]);
  return exercise;
}
