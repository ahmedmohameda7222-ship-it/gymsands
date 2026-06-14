"use client";

import { supabase } from "@/lib/supabase/client";
import type { ExerciseVideo, FoodItem, WelcomeSettings, Workout } from "@/types";
import { adminUpdateWelcomeSettings, adminUpsertWelcomeMessage } from "./settings";

export { adminUpdateWelcomeSettings, adminUpsertWelcomeMessage };

export async function adminListUsers() {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false });
  if (error) {
    console.warn("FitLife Hub could not load admin users.", error.message);
    return [];
  }
  return data ?? [];
}

export async function adminUpdateUserRole(userId: string, role: "member" | "admin") {
  if (!supabase) throw new Error("Database not connected");
  const { error } = await supabase!.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  return true;
}

export async function adminUpsertGlobalFood(food: Partial<FoodItem>) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("food_items")
    .upsert({ ...food, is_global: true, is_editable_by_user: false, cuisine: food.cuisine ?? "Egyptian" })
    .select("*")
    .single();
  if (error) throw error;
  return data as FoodItem;
}

export async function adminUpsertWorkout(workout: Partial<Workout>) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("workouts").upsert({ ...workout, is_global: true }).select("*").single();
  if (error) throw error;
  return data as Workout;
}

export async function adminUpsertExerciseVideo(video: Partial<ExerciseVideo>) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("exercise_videos").upsert({ ...video, is_global: true }).select("*").single();
  if (error) throw error;
  return data as ExerciseVideo;
}

export async function adminImportExerciseVideos(rows: Omit<ExerciseVideo, "id" | "is_global">[]) {
  if (!supabase) throw new Error("Database not connected");
  const importResult = await supabase!
    .from("workout_video_imports")
    .insert({ imported_count: rows.length, status: "queued" })
    .select("id")
    .single();
  if (importResult.error) throw importResult.error;
  const { error } = await supabase!.from("exercise_videos").upsert(
    rows.map((row) => ({
      ...row,
      is_global: true,
      source: row.source ?? "admin_import"
    })),
    { onConflict: "exercise_name,category_type,category" }
  );
  if (error) throw error;
  await supabase!.from("workout_video_imports").update({ status: "completed" }).eq("id", importResult.data.id);
  return rows.length;
}

export type { WelcomeSettings };
