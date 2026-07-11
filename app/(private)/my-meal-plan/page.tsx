import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Use ChatGPT with authorized Plaivra tools to create or update your plan, then schedule, complete, edit, and correct meals here."
      />
      <MyMealPlanBuilder />
    </>
  );
}
