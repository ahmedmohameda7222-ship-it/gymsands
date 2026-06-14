import Link from "next/link";
import { Bot } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";
import { Button } from "@/components/ui/button";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading
        title="Workout Plans"
        description="Import ChatGPT-created plans, manage the active plan, or use the manual builder as a secondary option."
        action={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Bot className="h-4 w-4" />
              Import from ChatGPT
            </Link>
          </Button>
        }
      />
      <MyWorkoutPlans />
    </>
  );
}
