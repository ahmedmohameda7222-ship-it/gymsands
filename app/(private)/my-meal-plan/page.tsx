
"use client";

import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Plan Breakfast, Lunch, Snacks, and Dinner. Food only counts in calories after you mark it done."
      />
      <MyMealPlanBuilder />
    </>
  );
}
