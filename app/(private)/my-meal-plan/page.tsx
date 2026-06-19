import { PageHeading } from "@/components/layout/page-heading";
import { MealPlanAddButtonBridge } from "@/components/meals/meal-plan-add-button-bridge";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";

export default function MyMealPlanPage() {
  return (
    <>
      <MealPlanAddButtonBridge />
      <PageHeading
        title="My Meal Plan"
        description="Plan breakfast, lunch, snacks, and dinner. Planned food counts only after you mark it done."
      />
      <div className="meal-plan-page-clean">
        <MyMealPlanBuilder />
      </div>
      <style>{`
        .meal-plan-page-clean > div > :nth-child(2) {
          display: none !important;
        }
      `}</style>
    </>
  );
}
