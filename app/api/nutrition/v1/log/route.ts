import { NextResponse } from "next/server";

import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { completeDiaryPlannedOccurrence, logDiaryMeal, type LogMealCommand } from "@/services/nutrition-v1/server/diary";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";

export async function POST(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.kind === "complete_planned") {
      if (typeof body.occurrenceId !== "string" || typeof body.operationId !== "string") {
        throw new NutritionRequestError("Planned occurrence and operation IDs are required.");
      }
      const executionSnapshot = body.executionSnapshot == null
        ? null
        : body.executionSnapshot as Record<string, unknown>;
      return nutritionJson(await completeDiaryPlannedOccurrence(context.supabase, {
        occurrenceId: body.occurrenceId,
        operationId: body.operationId,
        executionSnapshot,
      }));
    }
    return nutritionJson(await logDiaryMeal(context.supabase, body as unknown as LogMealCommand), { status: 201 });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
