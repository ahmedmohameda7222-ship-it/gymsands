import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Import a meal plan from ChatGPT, review it, then save it to Plaivra. Manual edits stay available for corrections."
      />
      <MyMealPlanBuilder />
    </>
  );
}
