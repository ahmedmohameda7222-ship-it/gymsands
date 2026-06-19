"use client";

import { useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { CustomNutritionManager } from "@/components/meals/custom-nutrition-manager";
import { Button } from "@/components/ui/button";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodHubPage() {
  const today = useTodayDate();
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeading
        title="Food Hub"
        description="Search the food library, log foods, save favorites, and manage food actions."
      />
      <Button type="button" variant="outline" onClick={() => setShowBuilder((current) => !current)}>
        Create / Edit Custom Foods & Meals
      </Button>
      {showBuilder ? <CustomNutritionManager selectedDate={today} /> : null}
      <FoodBrowser initialLogs={[]} logDate={today} />
    </div>
  );
}
