"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoodPreferencesForm } from "@/components/meals/my-meal-plan/food-preferences-form";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getMealPlanCopy } from "@/lib/meals/meal-plan-copy";
import { mealPlanUrl, resolveMealPlanTab } from "@/lib/meals/meal-plan-navigation";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodPreferencesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const { language, dir, t } = useTranslation();
  const c = getMealPlanCopy(language);
  const rawDate = searchParams.get("date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const tab = resolveMealPlanTab(searchParams.get("tab"));

  return (
    <div className="mx-auto max-w-4xl space-y-5" dir={dir}>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => router.push(mealPlanUrl("/my-meal-plan", tab, date))}
      >
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {t("common.back")}
      </Button>
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.foodPreferences}</h1>
      </header>
      <FoodPreferencesForm />
    </div>
  );
}
