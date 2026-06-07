import { toSlug } from "@/lib/utils";

export type WgerExerciseImport = {
  source: "wger";
  source_id: string;
  source_url: string;
  license: string | null;
  license_author: string | null;
  name: string;
  slug: string;
  primary_muscle: string | null;
  secondary_muscles: string[];
  equipment: string[];
  difficulty: string | null;
  mechanics: string | null;
  movement_pattern: string | null;
  force_type: string | null;
  instructions: string | null;
  image_url: string | null;
  video_url: string | null;
  is_approved: true;
  is_global: true;
};

function stripHtml(value: string | null | undefined) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function englishTranslation(item: any) {
  return (
    (item.translations ?? []).find((translation: any) => String(translation.language) === "2" || translation.language?.short_name === "en") ??
    (item.translations ?? [])[0] ??
    item
  );
}

function nameOf(value: any) {
  return value?.name_en || value?.name || value?.translation?.name || null;
}

function inferMovementPattern(category: string | null, muscles: string[]) {
  const haystack = [category, ...muscles].join(" ").toLowerCase();
  if (haystack.includes("chest")) return "horizontal_push";
  if (haystack.includes("shoulder")) return "vertical_push";
  if (haystack.includes("lat") || haystack.includes("back")) return "pull";
  if (haystack.includes("quad") || haystack.includes("leg")) return "squat";
  if (haystack.includes("hamstring") || haystack.includes("glute")) return "hinge";
  if (haystack.includes("ab") || haystack.includes("core")) return "core";
  return category?.toLowerCase().replace(/[^a-z0-9]+/g, "_") || null;
}

export function normalizeWgerExercise(item: any): WgerExerciseImport | null {
  const translation = englishTranslation(item);
  const name = translation?.name || item.name;
  if (!name) return null;
  const primaryMuscles = (item.muscles ?? []).map(nameOf).filter(Boolean);
  const secondaryMuscles = (item.muscles_secondary ?? []).map(nameOf).filter(Boolean);
  const equipment = (item.equipment ?? []).map(nameOf).filter(Boolean);
  const category = nameOf(item.category);
  const image = (item.images ?? []).find((entry: any) => entry.is_main) ?? (item.images ?? [])[0];
  const video = (item.videos ?? [])[0];
  const slug = toSlug(`wger-${item.id}-${name}`);

  return {
    source: "wger",
    source_id: String(item.id ?? item.uuid),
    source_url: `https://wger.de/en/exercise/${item.id}/view/`,
    license: item.license?.full_name || item.license?.short_name || item.license || null,
    license_author: item.license_author || null,
    name,
    slug,
    primary_muscle: primaryMuscles[0] ?? category ?? null,
    secondary_muscles: secondaryMuscles,
    equipment,
    difficulty: null,
    mechanics: category,
    movement_pattern: inferMovementPattern(category, [...primaryMuscles, ...secondaryMuscles]),
    force_type: null,
    instructions: stripHtml(translation?.description),
    image_url: image?.image || null,
    video_url: video?.video || null,
    is_approved: true,
    is_global: true
  };
}

export async function fetchWgerExercises(apiKey: string, limit = 50, offset = 0) {
  const response = await fetch(
    `https://wger.de/api/v2/exerciseinfo/?language=2&limit=${Math.min(Math.max(limit, 1), 100)}&offset=${Math.max(offset, 0)}`,
    { headers: { Authorization: `Token ${apiKey}` } }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "wger import failed.");
  return {
    count: data.count ?? 0,
    next: data.next ?? null,
    results: (data.results ?? []).map(normalizeWgerExercise).filter(Boolean) as WgerExerciseImport[]
  };
}
