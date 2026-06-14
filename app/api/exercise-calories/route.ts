import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";

type ExerciseCalorieReference = {
  id: string;
  activity_key: string;
  display_name: string;
  category: string | null;
  default_intensity: string | null;
  met: number;
  aliases: string[] | null;
  source_note: string | null;
};

function caloriesFromMet(met: number, weightKg: number, minutes: number) {
  return Math.round(((met * 3.5 * weightKg) / 200) * minutes);
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getProfileWeight(context: Awaited<ReturnType<typeof requireUser>>) {
  if (context instanceof NextResponse) return 75;
  const { data } = await context.supabase
    .from("onboarding_answers")
    .select("weight_kg")
    .eq("user_id", context.user.id)
    .maybeSingle();
  return cleanNumber(data?.weight_kg, 75);
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "exercise-calorie-list", 30, 60_000);
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  let requestQuery = context.supabase
    .from("exercise_calorie_reference")
    .select("id,activity_key,display_name,category,default_intensity,met,aliases,source_note")
    .eq("is_active", true)
    .order("display_name")
    .limit(80);

  if (query) {
    requestQuery = requestQuery.or(`display_name.ilike.%${query}%,activity_key.ilike.%${query}%`);
  }

  const { data, error } = await requestQuery;
  if (error) {
    console.warn("Exercise calorie reference failed to load.", error.message);
    return jsonError("Something went wrong while loading exercise calorie estimates. Please try again.", 400);
  }

  const activities = ((data ?? []) as ExerciseCalorieReference[]).filter((item) => {
    if (!query) return true;
    return [item.display_name, item.activity_key, ...(item.aliases ?? [])].some((value) => value.toLowerCase().includes(query));
  });

  return NextResponse.json({ activities });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "exercise-calorie-estimate", 20, 60_000);
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const activityId = String(body.activityId ?? "").trim();
  const minutes = cleanNumber(body.minutes, 30);
  const weightKg = cleanNumber(body.weightKg, await getProfileWeight(context));
  const shouldSave = Boolean(body.save);

  if (!activityId) return jsonError("Choose an activity before estimating calories.");

  const { data: activity, error } = await context.supabase
    .from("exercise_calorie_reference")
    .select("id,activity_key,display_name,category,default_intensity,met,aliases,source_note")
    .eq("id", activityId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn("Exercise calorie estimate failed to load.", error.message);
    return jsonError("Something went wrong while loading this activity. Please try again.", 400);
  }
  if (!activity) return jsonError("Activity was not found.", 404);

  const calories = caloriesFromMet(Number(activity.met), weightKg, minutes);
  const estimate = {
    activity,
    minutes,
    weightKg,
    calories,
    formula: "MET x 3.5 x body weight kg / 200 x minutes"
  };

  let saved = null;
  if (shouldSave) {
    const { data, error: saveError } = await context.supabase
      .from("imported_cardio_activities")
      .insert({
        user_id: context.user.id,
        provider: "local_exercise_calorie_reference",
        provider_activity_id: `manual-${activity.activity_key}-${Date.now()}`,
        activity_type: activity.display_name,
        title: `${activity.display_name} - ${minutes} min`,
        duration_seconds: Math.round(minutes * 60),
        calories,
        raw_data: estimate
      })
      .select("*")
      .single();
    if (saveError) {
      console.warn("Exercise calorie estimate could not be saved.", saveError.message);
      return jsonError("Something went wrong while saving this activity. Please try again.", 400);
    }
    saved = data;
  }

  return NextResponse.json({ estimate, saved });
}
