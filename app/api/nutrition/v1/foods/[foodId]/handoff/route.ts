import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { createSupabaseServerClient } from "@/lib/integrations/env";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { resolveFoodHandoffWithAuthorities } from "@/services/nutrition-v1/server/food-handoff";

export async function GET(request: Request, { params }: { params: Promise<{ foodId: string }> }) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { foodId } = await params;
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const serving = url.searchParams.get("serving");
    const displayName = url.searchParams.get("displayName")?.trim() || undefined;
    const languageTag = url.searchParams.get("languageTag")?.trim() || null;
    const servingOptionId = url.searchParams.get("servingOptionId")?.trim() || null;
    const quantity = Number(url.searchParams.get("quantity"));
    if (source !== "catalog" && source !== "my_food") throw new NutritionRequestError("Food source is invalid.");
    if (!serving?.trim()) throw new NutritionRequestError("Resolved serving is required.");
    if (source === "catalog" && !displayName) throw new NutritionRequestError("Resolved display name is required.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new NutritionRequestError("Resolved quantity is invalid.");
    const catalogSupabase = source === "catalog" ? createSupabaseServerClient(null, true) : context.supabase;
    return nutritionJson(await resolveFoodHandoffWithAuthorities(context.supabase, catalogSupabase, context.user.id, {
      foodId,
      source,
      serving,
      servingOptionId,
      quantity,
      displayName,
      languageTag,
    }));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
