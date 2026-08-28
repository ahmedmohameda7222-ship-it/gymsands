import { Suspense } from "react";

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";
import { MealPlanPage } from "@/components/nutrition/meal-plan/meal-plan-page";
import { SavedMealUtilityLauncher } from "@/components/nutrition/saved-meals/saved-meal-utility-launcher";

export default function MyMealPlanPage() {
  return <><SavedMealUtilityLauncher /><MealPlanPage /><Suspense fallback={null}><AddToHandoffConsumer destination="meal_plan" /></Suspense></>;
}
