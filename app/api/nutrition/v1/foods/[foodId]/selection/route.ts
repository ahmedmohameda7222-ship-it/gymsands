import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/integrations/env";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveCatalogNewUseSelectionWithAuthorities } from "@/services/nutrition-v1/server/food-handoff";

export async function GET(
  request: Request,
  context: { params: Promise<{ foodId: string }> },
) {
  const owner = await requireNutritionUser(request);
  if (owner instanceof NextResponse) return owner;
  try {
    const { foodId } = await context.params;
    const url = new URL(request.url);
    const displayName = url.searchParams.get("displayName")?.trim() ?? "";
    if (!displayName) return nutritionJson({ error: "displayName is required." }, { status: 400 });
    const languageTag = url.searchParams.get("languageTag")?.trim() || null;
    const catalogSupabase = createSupabaseServerClient(null, true);
    return nutritionJson(await resolveCatalogNewUseSelectionWithAuthorities(
      owner.supabase,
      catalogSupabase,
      owner.user.id,
      { foodId, displayName, languageTag },
    ));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
