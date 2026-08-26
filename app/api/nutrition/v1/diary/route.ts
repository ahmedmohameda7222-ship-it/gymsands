import { NextResponse } from "next/server";

import { isIsoDate } from "@/lib/date-utils";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { addDiaryWater, getDiaryProjection } from "@/services/nutrition-v1/server/diary";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isIsoDate(date)) throw new NutritionRequestError("Diary date must use YYYY-MM-DD.");
    return nutritionJson(await getDiaryProjection(context.supabase, context.user.id, date));
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = await request.json().catch(() => ({})) as { kind?: unknown; date?: unknown; amountMl?: unknown };
    if (body.kind !== "water" || typeof body.date !== "string" || typeof body.amountMl !== "number") {
      throw new NutritionRequestError("A valid water log is required.");
    }
    return nutritionJson({ water: await addDiaryWater(context.supabase, context.user.id, body.date, body.amountMl) }, { status: 201 });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
