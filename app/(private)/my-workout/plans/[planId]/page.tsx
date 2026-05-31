import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutPlanDetail } from "@/components/workouts/workout-plan-detail";

export default function MyPlanDetailPage() {
  return (
    <>
      <PageHeading title="Workout Plan" description="Review the weekly calendar, edit a day, or start the selected day." />
      <WorkoutPlanDetail />
    </>
  );
}
