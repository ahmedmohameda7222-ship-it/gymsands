
"use client";

import { FoodBrowser } from "@/components/meals/food-browser";
import { PageHeading } from "@/components/layout/page-heading";

export default function MealsPage() {
  return (
    <>
      <PageHeading
        title="Meal Section"
        description="Select a kitchen and subcategory, then add foods or custom meals to your plan or log."
      />
      <FoodBrowser />
    </>
  );
}
