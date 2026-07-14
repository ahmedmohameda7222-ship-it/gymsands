"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { UserExerciseVideo } from "@/types";

function requireUserData(userId: string | null | undefined) {
  if (!supabase || !isUuid(userId)) throw new Error("User session invalid");
  return supabase;
}

export async function getUserExerciseVideo(userId: string, exerciseId: string) {
  if (!supabase || !isUuid(userId)) return null;
  const client = supabase;
  const { data, error } = await client
    .from("user_exercise_videos")
    .select("*")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error) {
    console.warn("Plaivra could not load the user's custom exercise video.", error.message);
    return null;
  }
  return data as UserExerciseVideo | null;
}

export async function upsertUserExerciseVideo(userId: string, exerciseId: string, customVideoUrl: string) {
  const cleanUrl = customVideoUrl.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error("Enter a valid http or https video URL.");
  const client = requireUserData(userId);
  const { data, error } = await client
    .from("user_exercise_videos")
    .upsert({ user_id: userId, exercise_id: exerciseId, custom_video_url: cleanUrl }, { onConflict: "user_id,exercise_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserExerciseVideo;
}

export async function resetUserExerciseVideo(userId: string, exerciseId: string) {
  const client = requireUserData(userId);
  const { error } = await client
    .from("user_exercise_videos")
    .delete()
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  return true;
}
