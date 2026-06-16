import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutHistory } from "@/components/workouts/workout-history";

export default function WorkoutHistoryPage() {
  return (
    <>
      <PageHeading title="Workout History" description="Review completed workouts and track your progression." />
      <WorkoutHistory />
    </>
  );
}
