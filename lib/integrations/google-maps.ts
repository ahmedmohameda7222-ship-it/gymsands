export async function computeGymRoute({
  apiKey,
  origin,
  destination
}: {
  apiKey: string;
  origin: { address?: string; lat?: number; lng?: number };
  destination: { address?: string; lat?: number; lng?: number };
}) {
  const waypoint = (value: typeof origin) =>
    value.address
      ? { address: value.address }
      : { location: { latLng: { latitude: value.lat, longitude: value.lng } } };

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE"
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Google Maps Routes lookup failed.");
  const route = data.routes?.[0];
  return {
    distanceMeters: route?.distanceMeters ?? null,
    duration: route?.duration ?? null,
    raw: data
  };
}
