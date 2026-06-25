"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

export type ProgressPhotoType = "front" | "side" | "back";

export type ProgressPhoto = {
  id: string;
  user_id: string;
  progress_entry_id: string | null;
  photo_type: ProgressPhotoType;
  taken_on: string;
  storage_path: string;
  created_at: string;
  signed_url: string | null;
};

const bucket = "progress-photos";

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "progress-photo.jpg";
}

function requireStorage(userId: string) {
  if (!supabase || !isUuid(userId)) {
    console.warn("Progress photo storage is unavailable. Check Supabase storage configuration and progress photo tables.");
    throw new Error("Progress photo storage is not available right now. Please try again later.");
  }
  return supabase;
}

function normalizePhoto(row: Record<string, unknown>, signedUrl: string | null): ProgressPhoto {
  const rawType = String(row.photo_type || "front");
  const photoType: ProgressPhotoType = rawType === "side" || rawType === "back" ? rawType : "front";
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    progress_entry_id: typeof row.progress_entry_id === "string" ? row.progress_entry_id : null,
    photo_type: photoType,
    taken_on: String(row.taken_on || row.created_at || "").slice(0, 10),
    storage_path: String(row.storage_path),
    created_at: String(row.created_at || new Date().toISOString()),
    signed_url: signedUrl
  };
}

export async function getProgressPhotos(userId: string) {
  const client = requireStorage(userId);
  const { data, error } = await client
    .from("progress_photos")
    .select("*")
    .eq("user_id", userId)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Plaivra could not load progress photos.", error.message);
    return [] as ProgressPhoto[];
  }

  const photos = (data ?? []) as Record<string, unknown>[];
  const signed = await Promise.all(
    photos.map(async (photo) => {
      const path = String(photo.storage_path);
      const result = await client.storage.from(bucket).createSignedUrl(path, 60 * 60);
      return normalizePhoto(photo, result.data?.signedUrl ?? null);
    })
  );
  return signed;
}

export async function uploadProgressPhoto({ userId, type, takenOn, file }: { userId: string; type: ProgressPhotoType; takenOn: string; file: File }) {
  const client = requireStorage(userId);
  if (!file.type.startsWith("image/")) throw new Error("Upload an image file only.");
  const path = `${userId}/${type}/${takenOn}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (upload.error) throw new Error(`Could not upload progress photo. ${upload.error.message}`);

  const { data, error } = await client
    .from("progress_photos")
    .insert({ user_id: userId, photo_type: type, taken_on: takenOn, storage_path: path })
    .select("*")
    .single();
  if (error) {
    await client.storage.from(bucket).remove([path]);
    throw new Error(`Could not save progress photo metadata. ${error.message}`);
  }
  const signed = await client.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return normalizePhoto(data as Record<string, unknown>, signed.data?.signedUrl ?? null);
}

export async function deleteProgressPhoto(photo: ProgressPhoto) {
  const client = requireStorage(photo.user_id);
  const rowDelete = await client.from("progress_photos").delete().eq("id", photo.id).eq("user_id", photo.user_id);
  if (rowDelete.error) throw new Error(`Could not delete progress photo metadata. ${rowDelete.error.message}`);
  const storageDelete = await client.storage.from(bucket).remove([photo.storage_path]);
  if (storageDelete.error) console.warn("Plaivra could not remove the progress photo file.", storageDelete.error.message);
  return true;
}
