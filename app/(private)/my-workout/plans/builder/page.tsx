"use client";

import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import { useRouter } from "next/navigation";

export default function BuilderPage() {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push("/my-workout/plans")}>
          <ArrowLeft className="h-4 w-4" />
          Back to plans
        </Button>
      </div>
      <PageHeading
        title="Create Workout Plan"
        description="Build a custom workout plan manually using the exercise library."
      />
      <WorkoutPlanBuilder loadActivePlan={false} onSaved={() => router.push("/my-workout/plans")} />
    </div>
  );
}
