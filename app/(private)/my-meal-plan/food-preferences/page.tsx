"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NutritionPreferenceCard } from "@/components/profile/execution-profiles";

export default function FoodPreferencesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  const backHref = date ? `/my-meal-plan?date=${encodeURIComponent(date)}` : "/my-meal-plan";

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => router.push(backHref)} className="gap-1">
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
      <NutritionPreferenceCard
        saveLabel="Save food preference"
        onAfterSave={() => router.push(backHref)}
      />
    </div>
  );
}
