"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { CustomNutritionManager } from "@/components/meals/custom-nutrition-manager";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodHubPage() {
  return (
    <Suspense fallback={<FoodHubFallback />}>
      <FoodHubContent />
    </Suspense>
  );
}

function FoodHubContent() {
  const today = useTodayDate();
  const searchParams = useSearchParams();
  const builderParam = searchParams.get("builder");
  const [showBuilder, setShowBuilder] = useState(builderParam === "1");

  useEffect(() => {
    if (builderParam === "1") setShowBuilder(true);
  }, [builderParam]);

  return (
    <div className="space-y-4">
      <PageHeading
        title="Food Hub"
        description="Search the food library, log foods, save favorites, and manage food actions."
      />
      <Surface variant="glass" className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Food library tools</p>
          <p className="text-sm text-muted-foreground">Browse, search, favorite, log, or open the custom builder.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setShowBuilder((current) => !current)}>
          Create / Edit Custom Foods & Meals
        </Button>
      </Surface>
      {showBuilder ? <CustomNutritionManager selectedDate={today} /> : null}
      <FoodBrowser initialLogs={[]} logDate={today} />
    </div>
  );
}

function FoodHubFallback() {
  return (
    <div className="space-y-4">
      <PageHeading
        title="Food Hub"
        description="Search the food library, log foods, save favorites, and manage food actions."
      />
      <p className="text-sm text-muted-foreground">Loading Food Hub...</p>
    </div>
  );
}
