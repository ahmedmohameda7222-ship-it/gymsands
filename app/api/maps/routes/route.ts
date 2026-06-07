import { NextResponse } from "next/server";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { computeGymRoute } from "@/lib/integrations/google-maps";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "google-maps-routes", 20, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("Google Maps Routes", [["GOOGLE_MAPS_API_KEY", serverEnv.googleMapsApiKey]]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const body = await request.json().catch(() => ({}));
  const origin = body.origin ?? {};
  if (!origin.address && !(Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng)))) {
    return jsonError("Origin address or latitude/longitude is required.");
  }
  const destination = serverEnv.gymAddress
    ? { address: serverEnv.gymAddress }
    : { lat: Number(serverEnv.gymLat), lng: Number(serverEnv.gymLng) };
  if (!destination.address && !(Number.isFinite(destination.lat) && Number.isFinite(destination.lng))) {
    return jsonError("Gym destination is not configured. Set GYM_ADDRESS or GYM_LAT/GYM_LNG.", 503);
  }
  try {
    const route = await computeGymRoute({
      apiKey: serverEnv.googleMapsApiKey,
      origin: origin.address ? { address: origin.address } : { lat: Number(origin.lat), lng: Number(origin.lng) },
      destination
    });
    return NextResponse.json({ route });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Google Maps route failed.", 400);
  }
}
