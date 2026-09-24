import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/integrations/env";
import { requireNutritionUser, nutritionJson } from "@/lib/nutrition-v1/http";
import { listCurrentFoodCatalogCategoryFacets } from "@/services/food-catalog/server/current-search-category-facets";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";

export async function GET(request: Request) {
  const context = await requireNutritionUser(request);
  if (context instanceof NextResponse) return context;

  try {
    const catalogSupabase = createSupabaseServerClient(null, true);
    const categories = await listCurrentFoodCatalogCategoryFacets(catalogSupabase);
    return nutritionJson({ categories });
  } catch (error) {
    return nutritionErrorResponse(error);
  }
}
