
"use client";

import { FoodBrowser } from "@/components/meals/food-browser";
import { PageHeading } from "@/components/layout/page-heading";

export default function MealsPage() {
  return (
    <>
      <PageHeading
        title="Meal Section"
        description="Browse foods by category, then add them to My Meal Plan or log them as done now."
      />
      <FoodBrowser />
    </>
  );
}
