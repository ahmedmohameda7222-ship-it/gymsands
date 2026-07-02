import type { ExerciseVideo, Workout } from "@/types";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/aka/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findExerciseVideo(workout: Pick<Workout, "name" | "category" | "target_muscle">, videos: ExerciseVideo[]) {
  const workoutName = normalize(workout.name);
  const workoutCategory = normalize(workout.target_muscle || workout.category);

  return (
    videos.find((video) => normalize(video.exercise_name) === workoutName && normalize(video.category) === workoutCategory) ??
    videos.find((video) => normalize(video.exercise_name) === workoutName) ??
    videos.find((video) => workoutName.includes(normalize(video.exercise_name)) || normalize(video.exercise_name).includes(workoutName)) ??
    null
  );
}

export function isEmbeddableVideo(url: string | null | undefined) {
  return Boolean(toEmbedUrl(url));
}

export function toEmbedUrl(url: string | null | undefined) {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const hostname = parsed.hostname.toLowerCase();
  let videoId = "";
  if (hostname === "youtube.com" || hostname === "www.youtube.com") {
    videoId = parsed.pathname === "/watch"
      ? parsed.searchParams.get("v") ?? ""
      : parsed.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})$/)?.[1] ?? "";
    return /^[A-Za-z0-9_-]{6,}$/.test(videoId) ? `https://www.youtube.com/embed/${videoId}` : null;
  }
  if (hostname === "youtu.be") {
    videoId = parsed.pathname.match(/^\/([A-Za-z0-9_-]{6,})$/)?.[1] ?? "";
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }
  if (hostname === "vimeo.com" || hostname === "www.vimeo.com") {
    videoId = parsed.pathname.match(/^\/(\d+)$/)?.[1] ?? "";
    return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
  }
  if (hostname === "player.vimeo.com") {
    videoId = parsed.pathname.match(/^\/video\/(\d+)$/)?.[1] ?? "";
    return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
  }
  return null;
}
