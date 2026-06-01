import { PageHeading } from "@/components/layout/page-heading";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading title="Workout Plans" description="Create, open, edit, and start workout plans saved to your account." />
      <MyWorkoutPlans />
    </>
  );
}
