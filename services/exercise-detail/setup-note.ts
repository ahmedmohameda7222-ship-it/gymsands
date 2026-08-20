"use client";

import { supabase } from "@/lib/supabase/client";

export const EXERCISE_SETUP_NOTE_MAX_LENGTH = 1000;

export type ExerciseSetupNote = {
  id: string;
  exercise_identity: string;
  note_body: string;
  created_at: string;
  updated_at: string;
};

export async function getExerciseSetupNote(userId: string, identity: string, signal?: AbortSignal): Promise<ExerciseSetupNote | null> {
  if (!supabase) throw new Error("A database connection is required.");
  let query = supabase
    .from("exercise_setup_notes")
    .select("id,exercise_identity,note_body,created_at,updated_at")
    .eq("user_id", userId)
    .eq("exercise_identity", identity)
    .limit(1);
  if (signal && typeof query.abortSignal === "function") query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExerciseSetupNote | null) ?? null;
}

export async function persistExerciseSetupNote(userId: string, identity: string, body: string): Promise<ExerciseSetupNote | null> {
  if (!supabase) throw new Error("A database connection is required.");
  const normalized = body.trim();
  if (normalized.length > EXERCISE_SETUP_NOTE_MAX_LENGTH) throw new Error("Setup note is too long.");
  if (!normalized) {
    const { error } = await supabase.from("exercise_setup_notes").delete().eq("user_id", userId).eq("exercise_identity", identity);
    if (error) throw new Error(error.message);
    return null;
  }
  const { data, error } = await supabase
    .from("exercise_setup_notes")
    .upsert({ user_id: userId, exercise_identity: identity, note_body: normalized }, { onConflict: "user_id,exercise_identity" })
    .select("id,exercise_identity,note_body,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ExerciseSetupNote;
}
