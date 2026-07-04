"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { NutritionPreferenceCard } from "@/components/profile/execution-profiles";

export default function MealPlanFoodPreferencesPage() {
  const router = useRouter();

  return (
    <>
      <PageHeading
        title="Food Preferences"
        description="Set the taste, budget, cooking-time, and shopping context used for meal-plan requests."
      />
      <div className="mb-4">
        <Button asChild variant="outline">
          <Link href="/my-meal-plan">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
      <NutritionPreferenceCard
        saveLabel="Save food preference"
        onSaved={() => router.push("/my-meal-plan")}
      />
    </>
  );
}
