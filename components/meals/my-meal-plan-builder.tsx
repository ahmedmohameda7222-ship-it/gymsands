"use client";

import { MyMealPlanPageClient } from "@/components/meals/my-meal-plan/my-meal-plan-page-client";
import { useTranslation } from "@/lib/i18n/use-translation";

export function MyMealPlanBuilder() {
  const { t } = useTranslation();

  return (
    <div className="contents" data-skipped-status-label={t("mealPlan.statusSkipped")}>
      <MyMealPlanPageClient />
    </div>
  );
}
