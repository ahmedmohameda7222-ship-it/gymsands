import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/integrations/env";
import { fetchStravaActivities } from "@/lib/integrations/strava";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "strava-import", 6, 60_000);
  if (limited) return limited;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const integration = await context.supabase
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", context.user.id)
    .eq("provider", "strava")
    .maybeSingle();
  if (integration.error) return jsonError(integration.error.message, 400);
  if (!integration.data?.access_token) return jsonError("Strava is not connected.", 400);

  try {
    const activities = await fetchStravaActivities(integration.data.access_token);
    const rows = activities.map((activity) => ({
      user_id: context.user.id,
      provider: "strava",
      provider_activity_id: String(activity.id),
      activity_type: activity.type,
      title: activity.name,
      distance_meters: activity.distance ?? null,
      duration_seconds: activity.moving_time ?? activity.elapsed_time ?? null,
      calories: activity.calories ?? null,
      average_heart_rate: activity.average_heartrate ?? null,
      started_at: activity.start_date ?? null,
      raw_data: activity
    }));
    if (rows.length) await context.supabase.from("imported_cardio_activities").upsert(rows, { onConflict: "user_id,provider,provider_activity_id" });
    return NextResponse.json({ imported: rows.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Strava import failed.", 400);
  }
}
