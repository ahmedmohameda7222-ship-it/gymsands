import { PageHeading } from "@/components/layout/page-heading";
import { GeneratedWorkoutDashboard } from "@/components/workouts/generated-workout-dashboard";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";

export default function MyWorkoutPage() {
  return (
    <>
      <PageHeading title="My Workout" description="Follow your generated plan, complete or skip workout days, and track progress." />
      <div className="space-y-6">
        <GeneratedWorkoutDashboard />
        <WorkoutPlanBuilder />
      </div>
    </>
  );
}
