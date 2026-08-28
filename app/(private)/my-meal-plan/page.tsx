import { Suspense } from "react";

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";
import { MealPlanPage } from "@/components/nutrition/meal-plan/meal-plan-page";

export default function MyMealPlanPage() {
  return <><MealPlanPage /><Suspense fallback={null}><AddToHandoffConsumer destination="meal_plan" /></Suspense></>;
}
