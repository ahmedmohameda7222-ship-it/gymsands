import { PageHeading } from "@/components/layout/page-heading";
import { GeneratedWorkoutDashboard } from "@/components/workouts/generated-workout-dashboard";

export default function GeneratedPlansPage() {
  return (
    <>
      <PageHeading
        title="Generated Plans"
        description="Browse matched workout plans, inspect every day, then choose the one that becomes your active default."
      />
      <GeneratedWorkoutDashboard />
    </>
  );
}
