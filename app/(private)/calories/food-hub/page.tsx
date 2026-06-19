"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodHubPage() {
  const today = useTodayDate();
  return (
    <div className="space-y-4">
      <PageHeading
        title="Food Hub"
        description="Search the food library, log foods, save favorites, and manage food actions."
      />
      <FoodBrowser initialLogs={[]} logDate={today} />
    </div>
  );
}
