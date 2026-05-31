import { PageHeading } from "@/components/layout/page-heading";
import { GeneratedWorkoutDashboard } from "@/components/workouts/generated-workout-dashboard";

export default function GeneratedPlansPage() {
  return (
    <>
      <PageHeading
        title="Generated Plans"
        description="Follow your generated workout plan, track sessions, and review the scheduled calendar."
      />
      <GeneratedWorkoutDashboard />
    </>
  );
}
