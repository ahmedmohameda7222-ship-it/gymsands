import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";

export default function MyWorkoutPage() {
  return (
    <>
      <PageHeading title="My Workout" description="Plan your training week, start today, skip when needed, and track completion." />
      <WorkoutPlanBuilder />
    </>
  );
}
