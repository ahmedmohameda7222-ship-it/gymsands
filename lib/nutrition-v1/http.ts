import { NextResponse } from "next/server";

import { requireUser, type RouteContext } from "@/lib/integrations/env";

export const NUTRITION_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
} as const;

export function withNutritionPrivateHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(NUTRITION_PRIVATE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function nutritionJson(
  body: unknown,
  init?: ResponseInit,
) {
  return withNutritionPrivateHeaders(NextResponse.json(body, init));
}

export async function requireNutritionUser(
  request: Request,
): Promise<RouteContext | NextResponse> {
  const context = await requireUser(request);
  return context instanceof NextResponse
    ? withNutritionPrivateHeaders(context)
    : context;
}
