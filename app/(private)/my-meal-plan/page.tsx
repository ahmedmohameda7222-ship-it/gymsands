import Link from "next/link";
import { Bot } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";
import { Button } from "@/components/ui/button";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Plan Breakfast, Lunch, Snacks, and Dinner. Food only counts in calories after you mark it done."
        action={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Bot className="h-4 w-4" />
              Import meal plan from ChatGPT
            </Link>
          </Button>
        }
      />
      <MyMealPlanBuilder />
    </>
  );
}
