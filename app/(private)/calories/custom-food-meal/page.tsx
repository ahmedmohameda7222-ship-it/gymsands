"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { CustomNutritionManager } from "@/components/meals/custom-nutrition-manager";
import { todayIso } from "@/lib/utils";

export default function CustomFoodMealPage() {
  return (
    <>
      <PageHeading title="Custom Food / Meal" description="Create and manage your custom kitchens, foods, and meals." />
      <CustomNutritionManager selectedDate={todayIso()} />
    </>
  );
}
