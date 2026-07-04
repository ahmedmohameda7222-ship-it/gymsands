import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Plan breakfast, lunch, snacks, and dinner. Planned food counts only after you mark it done."
      />
      <MyMealPlanBuilder />
    </>
  );
}
