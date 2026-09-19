import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";
import { getFoodPersonalCorrectionState } from "@/services/nutrition-v1/server/user-foods";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ foodId: string }> },
) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const { foodId } = await params;
    return nutritionJson(await getFoodPersonalCorrectionState(
      context.supabase,
      context.user.id,
      foodId,
    ));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
