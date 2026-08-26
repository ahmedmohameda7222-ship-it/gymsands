import { NextResponse } from "next/server";

import { isIsoDate } from "@/lib/date-utils";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import {
  addDiaryWater,
  deriveDiaryNutritionPosition,
  getDiaryProjection,
  type DiaryProjection,
} from "@/services/nutrition-v1/server/diary";
import { NutritionRequestError, nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";

const RENDERED_QA_ACCESS_TOKEN = "plaivra-rendered-qa-access-token";

function isRenderedQaDiaryRequest(request: Request) {
  const qaEnabled =
    process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true" &&
    (process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA === "true" ||
      process.env.QA_MOCK_AUTH_BUILD_VALUE === "true");
  if (!qaEnabled) return false;
  return request.headers.get("authorization")?.trim() === `Bearer ${RENDERED_QA_ACCESS_TOKEN}`;
}

function renderedQaDiaryProjection(date: string): DiaryProjection {
  const actualFacts = {
    caloriesKcal: 620,
    proteinG: 41,
    carbsG: 72,
    fatG: 18,
  };
  const targetValues = {
    calories: 2200,
    protein_g: 160,
    carbs_g: 240,
    fat_g: 70,
    water_ml: 2500,
  };

  return {
    date,
    position: deriveDiaryNutritionPosition(actualFacts, targetValues),
    domains: {
      actual: {
        status: "ready",
        data: {
          nutrition: actualFacts,
          logs: [
            {
              id: "00000000-0000-4000-8000-000000000101",
              mealType: "Breakfast",
              foodName: "Greek yogurt with berries",
              servingLabel: "1 bowl",
              quantity: 1,
              nutrition: {
                caloriesKcal: 320,
                proteinG: 26,
                carbsG: 34,
                fatG: 9,
              },
              notes: null,
              foodItemId: null,
              userFoodItemId: null,
              createdAt: null,
            },
            {
              id: "00000000-0000-4000-8000-000000000102",
              mealType: "Snack",
              foodName: "Banana and almonds",
              servingLabel: "1 serving",
              quantity: 1,
              nutrition: {
                caloriesKcal: 300,
                proteinG: 15,
                carbsG: 38,
                fatG: 9,
              },
              notes: null,
              foodItemId: null,
              userFoodItemId: null,
              createdAt: null,
            },
          ],
        },
      },
      target: {
        status: "ready",
        data: {
          available: true,
          effective_from: date,
          effective_to: null,
          values: targetValues,
          source: "rendered_qa_fixture",
          source_evidence: { authority: "rendered_qa" },
          reason: "effective_target",
        },
      },
      hydration: {
        status: "ready",
        data: {
          logs: [
            {
              id: "00000000-0000-4000-8000-000000000103",
              amountMl: 750,
              createdAt: null,
            },
          ],
          totalMl: 750,
        },
      },
      planned: {
        status: "ready",
        data: [
          {
            id: "00000000-0000-4000-8000-000000000104",
            mealType: "Lunch",
            name: "Chicken rice bowl",
            status: "planned",
            sourceType: "food",
            frozenSnapshot: { name: "Chicken rice bowl" },
          },
        ],
      },
      savedMeals: { status: "ready", data: [] },
    },
  };
}

export async function GET(request: Request) {
  if (isRenderedQaDiaryRequest(request)) {
    try {
      const date = new URL(request.url).searchParams.get("date") ?? "";
      if (!isIsoDate(date)) throw new NutritionRequestError("Diary date must use YYYY-MM-DD.");
      return nutritionJson(renderedQaDiaryProjection(date));
    } catch (error) {
      return nutritionErrorResponse(error);
    }
  }

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
