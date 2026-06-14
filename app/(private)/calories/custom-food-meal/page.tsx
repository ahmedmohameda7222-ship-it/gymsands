"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { CustomNutritionManager } from "@/components/meals/custom-nutrition-manager";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function CustomFoodMealPage() {
  const today = useTodayDate();
  return (
    <>
      <PageHeading title="Food Builder" description="Create and manage your custom kitchens, foods, and meals." />
      <CustomNutritionManager selectedDate={today} />
    </>
  );
}
