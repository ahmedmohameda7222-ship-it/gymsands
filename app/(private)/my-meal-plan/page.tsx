import Link from "next/link";
import { Utensils } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MyMealPlanBuilder } from "@/components/meals/my-meal-plan-builder";
import { Button } from "@/components/ui/button";

export default function MyMealPlanPage() {
  return (
    <>
      <PageHeading
        title="My Meal Plan"
        description="Plan breakfast, lunch, snacks, and dinner. Planned food counts only after you mark it done."
        action={
          <Button asChild variant="outline">
            <Link href="/my-meal-plan/food-preferences">
              <Utensils className="h-4 w-4" />
              Food preferences
            </Link>
          </Button>
        }
      />
      <MyMealPlanBuilder />
    </>
  );
}
