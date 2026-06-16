import { PageHeading } from "@/components/layout/page-heading";
import { MealPlanAddButtonBridge } from "@/components/meals/meal-plan-add-button-bridge";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";
import { ChatGptImportCard } from "@/components/shared/chatgpt-import-card";

export default function MyMealPlanPage() {
  return (
    <>
      <MealPlanAddButtonBridge />
      <PageHeading
        title="My Meal Plan"
        description="Plan breakfast, lunch, snacks, and dinner. Planned food counts only after you mark it done."
      />
      <div className="mb-5">
        <ChatGptImportCard mode="meal" />
      </div>
      <MyMealPlanBuilder />
    </>
  );
}
